import { createClient } from 'npm:@supabase/supabase-js@2';
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'npm:jose@5.9.6';

/**
 * Permanently deletes the calling BookFlow account.
 *
 * Who is deleted comes ONLY from the verified Clerk session token in the Authorization header —
 * the request body is ignored, so no client can name another user.
 *
 * Order, chosen so a failure never strands data behind a deleted login:
 *   1. Storage: every object under business-logos/<user_id>/
 *   2. Database: all BookFlow rows, in one transaction (delete_bookflow_account_data)
 *   3. RevenueCat customer record (when REVENUECAT_SECRET_API_KEY is set)
 *   4. PostHog person (optional, best effort, when POSTHOG_PERSONAL_API_KEY is set)
 *   5. Clerk user — last, so the person can still sign in and retry if anything above fails
 *   6. Database sweep again, catching a workspace save that raced the deletion
 *
 * Every step treats "already gone" as success, so the whole request is safe to retry.
 *
 * Secrets (Supabase function secrets, never in the app):
 *   CLERK_SECRET_KEY               required — verifies tokens (JWKS) and deletes the Clerk user
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

let cachedJwks: { keys: ReturnType<typeof createLocalJWKSet>; fetchedAt: number } | null = null;

async function getClerkJwks(secretKey: string) {
  if (cachedJwks && Date.now() - cachedJwks.fetchedAt < 60 * 60 * 1000) return cachedJwks.keys;
  const response = await fetch('https://api.clerk.com/v1/jwks', {
    headers: { authorization: `Bearer ${secretKey}` },
  });
  if (!response.ok) throw new DeletionError({ step: 'jwks', status: response.status });
  const jwks = (await response.json()) as JSONWebKeySet;
  cachedJwks = { keys: createLocalJWKSet(jwks), fetchedAt: Date.now() };
  return cachedJwks.keys;
}

/** The verified Clerk user id, or null when the token is missing, invalid, expired or impersonated. */
async function authenticate(request: Request, secretKey: string): Promise<string | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, await getClerkJwks(secretKey), {
      algorithms: ['RS256'],
      clockTolerance: 5,
    });

    const authorizedParties = (Deno.env.get('CLERK_AUTHORIZED_PARTIES') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (authorizedParties.length && typeof payload.azp === 'string' && !authorizedParties.includes(payload.azp)) {
      return null;
    }
    // An impersonation session (support staff acting as the user) must never delete the account.
    if (payload.act) return null;

    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  } catch (error) {
    if (error instanceof DeletionError) throw error;
    return null;
  }
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

async function deleteClerkUser(userId: string, secretKey: string) {
  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${secretKey}` },
  });
  if (!response.ok && response.status !== 404) throw new DeletionError({ step: 'clerk', status: response.status });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);

  const clerkSecret = Deno.env.get('CLERK_SECRET_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!clerkSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('delete-account: missing server configuration');
    return respond({ error: 'not_configured' }, 503);
  }

  let userId: string | null;
  try {
    userId = await authenticate(request, clerkSecret);
  } catch (error) {
    const failure = error instanceof DeletionError ? error.failure : { step: 'auth' };
    console.error('delete-account: verification unavailable', failure);
    return respond({ error: 'unavailable' }, 503);
  }
  if (!userId) return respond({ error: 'unauthorized' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    await deleteStorage(admin, userId);
    await deleteDatabaseRows(admin, userId);
    const revenuecat = await deleteRevenueCatCustomer(userId);
    const posthog = await deletePostHogPerson(userId);
    await deleteClerkUser(userId, clerkSecret);
    await deleteDatabaseRows(admin, userId);

    // Ids and step names only — never tokens, emails or record contents.
    console.log('delete-account: completed', { revenuecat, posthog });
    return respond({ deleted: true });
  } catch (error) {
    const failure = error instanceof DeletionError ? error.failure : { step: 'unexpected' };
    console.error('delete-account: failed', failure);
    return respond({ error: 'deletion_failed' }, 500);
  }
});
