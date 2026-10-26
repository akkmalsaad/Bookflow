import { createClient } from 'npm:@supabase/supabase-js@2';

import { checkProEntitlement } from '../_shared/pro-entitlement.ts';

/**
 * Tells the signed-in owner whether BookFlow's server can verify their Pro entitlement — the same
 * RevenueCat check booking-public makes on every booking-form submission. The app calls this after
 * a purchase or restore, and only reports Pro as active for existing booking links once it answers
 * 'pro'.
 *
 * Authentication (platform JWT verification is off, as for delete-account, because the gateway
 * cannot verify Clerk tokens):
 *   1. A Bearer token is required. Its `sub` is read *unverified*, only to say whose row to ask for.
 *   2. That row is requested from PostgREST with the caller's own token and the anon key. Supabase
 *      verifies the token's signature against Clerk (Third-Party Auth) — a forged, expired or
 *      foreign token is rejected there — and row-level security returns a workspace only when
 *      auth.jwt()->>'sub' equals its user_id.
 *   3. The function answers only if exactly that row came back, so the id checked with RevenueCat is
 *      the verified caller's. The request body is never read; no client can name another owner.
 *
 * Responses (reason codes only — never ids, tokens or keys):
 *   200 { plan: 'pro' | 'free', reason }  ·  401 { error: 'unauthorized', reason }
 *   503 { error: 'unavailable', reason }  ·  405 for anything but POST
 *
 * Secrets: REVENUECAT_SECRET_API_KEY (shared with delete-account and booking-public), optional
 * REVENUECAT_PRO_ENTITLEMENT_ID; SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase.
 */
const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function respond(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { ...corsHeaders, 'cache-control': 'no-store' } });
}

/** The token's `sub`, read without trusting it — it only chooses which row to ask PostgREST for. */
function unverifiedSubject(token: string) {
  try {
    const part = token.split('.')[1] ?? '';
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')));
    return typeof json.sub === 'string' && json.sub.length > 0 && json.sub.length <= 200 ? json.sub : '';
  } catch {
    return '';
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);

  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
  if (!token) return respond({ error: 'unauthorized', reason: 'missing_token' }, 401);
  const subject = unverifiedSubject(token);
  if (!subject) return respond({ error: 'unauthorized', reason: 'malformed_token' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return respond({ error: 'unavailable', reason: 'not_configured' }, 503);

  const asCaller = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await asCaller.from('bookflow_workspaces').select('user_id').eq('user_id', subject).maybeSingle();
  if (error) {
    // PGRST301/302/303: the token was rejected (bad signature, expired, wrong issuer). 42501: it
    // carried no signed-in role (e.g. an anon key). Neither is a server fault.
    const rejected = /^PGRST30\d$/.test(error.code ?? '') || error.code === '42501' || /jwt/i.test(error.message ?? '');
    return rejected ? respond({ error: 'unauthorized', reason: 'invalid_session' }, 401) : respond({ error: 'unavailable', reason: 'workspace_lookup_failed' }, 503);
  }
  // No row: the token was not accepted as this user, or this user has no workspace yet.
  if (!data || data.user_id !== subject) return respond({ error: 'unauthorized', reason: 'no_verified_workspace' }, 401);

  const check = await checkProEntitlement(data.user_id, {
    apiKey: Deno.env.get('REVENUECAT_SECRET_API_KEY'),
    entitlementId: Deno.env.get('REVENUECAT_PRO_ENTITLEMENT_ID') || undefined,
  });
  if (check.plan === 'unknown') {
    console.warn('entitlement-status: check unavailable', { reason: check.reason });
    return respond({ error: 'unavailable', reason: check.reason }, 503);
  }
  return respond({ plan: check.plan, reason: check.reason });
});
