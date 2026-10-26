import { createClient } from 'npm:@supabase/supabase-js@2';
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'npm:jose@5.9.6';

/**
 * Permanently deletes the calling BookFlow account.
 *
 * Who is deleted comes ONLY from the verified Clerk session token in the Authorization header —
 * the request body is ignored, so no client can name another user.
 *
 * Order, chosen so a failure never strands data behind a deleted login, and so a failing external
 * service stops the request *before* any BookFlow data is removed:
 *   1. RevenueCat customer record (when REVENUECAT_SECRET_API_KEY is set; must be a secret sk_ key)
 *   2. Storage: every object under business-logos/<user_id>/
 *   3. Database: all BookFlow rows, in one transaction (delete_bookflow_account_data)
 *   4. PostHog person (optional, best effort, when POSTHOG_PERSONAL_API_KEY is set)
 *   5. Clerk user — last, so the person can still sign in and retry if anything above fails
 *   6. Database sweep again, catching a workspace save that raced the deletion
 *
 * Every step treats "already gone" as success, so the whole request is safe to retry.
 *
 * Clerk instances: the production app and the development build sign users in through different
 * Clerk instances but share this Supabase project. A token is accepted only if its signature verifies
 * against the JWKS of a configured instance, and the user is deleted through that same instance.
 *
 * Secrets (Supabase function secrets, never in the app):
 *   CLERK_SECRET_KEY               required — the production instance: verifies its tokens (JWKS)
 *                                  and deletes its users
 *   CLERK_ISSUER                   recommended — the production issuer (https://clerk.bookflow.my);
 *                                  when set, a production token must carry exactly this `iss`
 *   CLERK_DEVELOPMENT_SECRET_KEY   optional — the development instance (sk_test_…), so accounts
 *   CLERK_DEVELOPMENT_ISSUER       created in development builds can be deleted too. Both are
 *                                  required: without the issuer the development instance stays off
 *   CLERK_AUTHORIZED_PARTIES       optional — comma-separated allowed `azp` origins
 *   REVENUECAT_SECRET_API_KEY      optional — RevenueCat v1 secret key, deletes the customer record
 *   POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID, POSTHOG_HOST   optional — deletes the person
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY                     provided by Supabase
 */

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const LOGO_BUCKET = 'business-logos';

type StepFailure = { step: string; status?: number };

class DeletionError extends Error {
  constructor(readonly failure: StepFailure) {
    super(failure.step);
  }
}

function respond(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, 'cache-control': 'no-store' },
  });
}

/** One configured Clerk instance. Its label only ever appears in logs. */
type ClerkInstance = { label: 'production' | 'development'; secretKey: string; issuer?: string };

const jwksCache = new Map<string, { keys: ReturnType<typeof createLocalJWKSet>; fetchedAt: number }>();

async function getClerkJwks(instance: ClerkInstance) {
  const cached = jwksCache.get(instance.secretKey);
  if (cached && Date.now() - cached.fetchedAt < 60 * 60 * 1000) return cached.keys;
  const response = await fetch('https://api.clerk.com/v1/jwks', {
    headers: { authorization: `Bearer ${instance.secretKey}` },
  });
  if (!response.ok) throw new DeletionError({ step: `jwks_${instance.label}`, status: response.status });
  const jwks = (await response.json()) as JSONWebKeySet;
  const keys = createLocalJWKSet(jwks);
  jwksCache.set(instance.secretKey, { keys, fetchedAt: Date.now() });
  return keys;
}

/** Why a request was refused. Codes only — safe to log and to return. */
type RejectionReason =
  | 'missing_token'
  | 'unknown_issuer'
  | 'invalid_token'
  | 'token_expired'
  | 'wrong_issuer'
  | 'unauthorized_party'
  | 'impersonation';

type AuthResult =
  | { ok: true; userId: string; instance: ClerkInstance }
  | { ok: false; reason: RejectionReason; issuerHost: string };

/** The token's issuer host, read *without* trusting it, purely so a rejection can be diagnosed. */
function unverifiedIssuerHost(token: string) {
  try {
    const part = token.split('.')[1] ?? '';
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')));
    return typeof json.iss === 'string' ? new URL(json.iss).host : '';
  } catch {
    return '';
  }
}

/**
 * Verifies the session token against each configured Clerk instance's own signing keys. The first
 * instance whose keys verify it is the one the user belongs to; nothing in the token is trusted
 * until then.
 */
async function authenticate(request: Request, instances: ClerkInstance[]): Promise<AuthResult> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) return { ok: false, reason: 'missing_token', issuerHost: '' };
  const issuerHost = unverifiedIssuerHost(token);

  let reason: RejectionReason = 'unknown_issuer';
  let unavailable: DeletionError | null = null;
  for (const instance of instances) {
    let keys: ReturnType<typeof createLocalJWKSet>;
    try {
      keys = await getClerkJwks(instance);
    } catch (error) {
      // One instance's key server being down must not hide a token that another instance signed.
      if (error instanceof DeletionError) unavailable = error;
      continue;
    }

    try {
      // The signature ties the token to this instance's keys; the pinned issuer must match as well.
      const { payload } = await jwtVerify(token, keys, {
        algorithms: ['RS256'],
        clockTolerance: 5,
        ...(instance.issuer ? { issuer: instance.issuer } : {}),
      });

      const authorizedParties = (Deno.env.get('CLERK_AUTHORIZED_PARTIES') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (authorizedParties.length && typeof payload.azp === 'string' && !authorizedParties.includes(payload.azp)) {
        return { ok: false, reason: 'unauthorized_party', issuerHost };
      }
      // An impersonation session (support staff acting as the user) must never delete the account.
      if (payload.act) return { ok: false, reason: 'impersonation', issuerHost };
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) return { ok: false, reason: 'invalid_token', issuerHost };

      return { ok: true, userId: payload.sub, instance };
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      // No key with this token's id: it was signed by a different instance — try the next one.
      if (code === 'ERR_JWKS_NO_MATCHING_KEY') continue;
      reason = code === 'ERR_JWT_EXPIRED' ? 'token_expired' : code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' ? 'wrong_issuer' : 'invalid_token';
      break;
    }
  }

  // Only "unavailable" when no instance could even be checked; a definite rejection wins.
  if (reason === 'unknown_issuer' && unavailable && instances.every((instance) => !jwksCache.has(instance.secretKey))) {
    throw unavailable;
  }
  return { ok: false, reason, issuerHost };
}

async function deleteStorage(admin: ReturnType<typeof createClient>, userId: string) {
  // Objects can sit directly in the user's folder or one level below; remove until the folder is empty.
  for (let pass = 0; pass < 50; pass += 1) {
    const { data, error } = await admin.storage.from(LOGO_BUCKET).list(userId, { limit: 100 });
    if (error) throw new DeletionError({ step: 'storage_list' });
    const files = (data ?? []).filter((entry) => entry.id !== null).map((entry) => `${userId}/${entry.name}`);
    const folders = (data ?? []).filter((entry) => entry.id === null).map((entry) => `${userId}/${entry.name}`);

    for (const folder of folders) {
      const { data: nested, error: nestedError } = await admin.storage.from(LOGO_BUCKET).list(folder, { limit: 100 });
      if (nestedError) throw new DeletionError({ step: 'storage_list' });
      files.push(...(nested ?? []).filter((entry) => entry.id !== null).map((entry) => `${folder}/${entry.name}`));
    }

    if (files.length === 0) return;
    const { error: removeError } = await admin.storage.from(LOGO_BUCKET).remove(files);
    if (removeError) throw new DeletionError({ step: 'storage_remove' });
  }
  throw new DeletionError({ step: 'storage_remove' });
}

async function deleteDatabaseRows(admin: ReturnType<typeof createClient>, userId: string) {
  const { error } = await admin.rpc('delete_bookflow_account_data', { p_user_id: userId });
  if (error) throw new DeletionError({ step: 'database' });
}

async function deleteRevenueCatCustomer(userId: string) {
  const key = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!key) return 'skipped';
  // RevenueCat only lets *secret* keys (sk_…) delete customers. A public SDK key (appl_…, goog_…,
  // test_…) is rejected with 401, so it is refused here before anything else is touched.
  if (!key.startsWith('sk_')) throw new DeletionError({ step: 'revenuecat_config' });
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${key}` },
  });
  // 404: no customer was ever created for this user (e.g. never opened the paywall).
  if (!response.ok && response.status !== 404) throw new DeletionError({ step: 'revenuecat', status: response.status });
  return 'deleted';
}

/** Best effort: analytics history is not a reason to refuse someone's deletion request. */
async function deletePostHogPerson(userId: string) {
  const key = Deno.env.get('POSTHOG_PERSONAL_API_KEY');
  const projectId = Deno.env.get('POSTHOG_PROJECT_ID');
  const host = (Deno.env.get('POSTHOG_HOST') ?? '').replace(/\/$/, '');
  if (!key || !projectId || !host) return 'skipped';

  try {
    const headers = { authorization: `Bearer ${key}` };
    const lookup = await fetch(
      `${host}/api/projects/${encodeURIComponent(projectId)}/persons/?distinct_id=${encodeURIComponent(userId)}`,
      { headers },
    );
    if (!lookup.ok) return 'failed';
    const { results } = (await lookup.json()) as { results?: { id: string }[] };
    for (const person of results ?? []) {
      const removal = await fetch(
        `${host}/api/projects/${encodeURIComponent(projectId)}/persons/${encodeURIComponent(person.id)}/?delete_events=true`,
        { method: 'DELETE', headers },
      );
      if (!removal.ok && removal.status !== 404) return 'failed';
    }
    return 'deleted';
  } catch {
    return 'failed';
  }
}

async function deleteClerkUser(userId: string, instance: ClerkInstance) {
  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${instance.secretKey}` },
  });
  if (!response.ok && response.status !== 404) throw new DeletionError({ step: `clerk_${instance.label}`, status: response.status });
}

/**
 * The final sweep only catches a workspace save that raced the deletion — every row was already
 * removed in step 2. It is retried, and if it still fails after the login is gone the deletion is
 * reported complete (the person can no longer sign in to retry) and the failure logged for follow-up.
 */
async function sweepAfterLoginDeleted(admin: ReturnType<typeof createClient>, userId: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await deleteDatabaseRows(admin, userId);
      return 'clean';
    } catch {
      // Try again.
    }
  }
  return 'pending';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);

  const clerkSecret = Deno.env.get('CLERK_SECRET_KEY');
  const clerkIssuer = Deno.env.get('CLERK_ISSUER')?.trim() || undefined;
  const clerkDevelopmentSecret = Deno.env.get('CLERK_DEVELOPMENT_SECRET_KEY');
  const clerkDevelopmentIssuer = Deno.env.get('CLERK_DEVELOPMENT_ISSUER')?.trim() || undefined;
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!clerkSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('delete-account: missing server configuration');
    return respond({ error: 'not_configured' }, 503);
  }
  const instances: ClerkInstance[] = [
    { label: 'production', secretKey: clerkSecret, issuer: clerkIssuer },
    // Development is opt-in and must be pinned to its own issuer.
    ...(clerkDevelopmentSecret && clerkDevelopmentIssuer && clerkDevelopmentSecret !== clerkSecret
      ? [{ label: 'development' as const, secretKey: clerkDevelopmentSecret, issuer: clerkDevelopmentIssuer }]
      : []),
  ];

  let auth: AuthResult;
  try {
    auth = await authenticate(request, instances);
  } catch (error) {
    const failure = error instanceof DeletionError ? error.failure : { step: 'auth' };
    console.error('delete-account: verification unavailable', failure);
    return respond({ error: 'unavailable' }, 503);
  }
  if (!auth.ok) {
    // The reason and the issuer's host name (which Clerk instance signed it) — never the token.
    console.warn('delete-account: rejected', { reason: auth.reason, issuer: auth.issuerHost, instances: instances.map((item) => item.label) });
    return respond({ error: 'unauthorized', reason: auth.reason }, 401);
  }
  const { userId, instance } = auth;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let revenuecat = 'skipped';
  let posthog = 'skipped';
  try {
    revenuecat = await deleteRevenueCatCustomer(userId);
    await deleteStorage(admin, userId);
    await deleteDatabaseRows(admin, userId);
    posthog = await deletePostHogPerson(userId);
  } catch (error) {
    // Nothing irreversible has happened to the login yet, so the person can simply try again; every
    // step above treats "already gone" as success.
    const failure = error instanceof DeletionError ? error.failure : { step: 'unexpected', error: error instanceof Error ? error.name : typeof error };
    console.error('delete-account: failed before the login was removed', { ...failure, instance: instance.label });
    return respond({ error: 'deletion_failed', step: failure.step }, 500);
  }

  try {
    await deleteClerkUser(userId, instance);
  } catch (error) {
    const failure = error instanceof DeletionError ? error.failure : { step: 'unexpected', error: error instanceof Error ? error.name : typeof error };
    console.error('delete-account: failed removing the login', { ...failure, instance: instance.label });
    return respond({ error: 'deletion_failed', step: failure.step }, 500);
  }

  const sweep = await sweepAfterLoginDeleted(admin, userId);
  if (sweep === 'pending') console.error('delete-account: final sweep failed after the login was removed', { instance: instance.label });

  // Step names and outcomes only — never tokens, emails or record contents.
  console.log('delete-account: completed', { instance: instance.label, revenuecat, posthog, sweep });
  return respond({ deleted: true });
});
