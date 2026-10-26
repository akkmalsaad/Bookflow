import { createClient } from 'npm:@supabase/supabase-js@2';

import { checkProEntitlement, type VerifiedPlan } from '../_shared/pro-entitlement.ts';
import { publicBookingOfferResponse, RESPONSE_ERRORS } from './payload.ts';

/**
 * Public booking forms, quotations and customer booking pages.
 *
 * Deployed with JWT verification off (customers have no account): the unguessable, expiring,
 * revocable token in the query string is the only credential, and every database change happens in
 * the service-role RPCs, which re-validate everything. Tokens are never logged.
 */
const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const publicWebUrl = 'https://bookflow.expo.app';
const MAX_BODY_BYTES = 16 * 1024;

/**
 * What the customer may send with each action. A booking form takes exactly five details from the
 * customer — name, email, phone, their own location and the event location — plus the terms
 * acceptance and the version they were shown.
 */
const PAYLOAD_FIELDS: Record<'submit' | 'accept' | 'decline' | 'request_change', string[]> = {
  submit: ['name', 'email', 'phone', 'customerLocation', 'location', 'acceptTerms', 'termsVersion', 'version'],
  accept: ['name', 'acceptTerms', 'termsVersion', 'version'],
  decline: ['version'],
  request_change: ['message', 'version'],
};

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      ...extraHeaders,
      ...corsHeaders,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  });
}

function isToken(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function createPublicBookingUrl(baseUrl: string, token: string) {
  const target = new URL(baseUrl);
  target.pathname = `${target.pathname.replace(/\/$/, '')}/booking-public`;
  target.search = '';
  target.hash = '';
  target.searchParams.set('token', token);
  return target.toString();
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'GET' && request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!isToken(token)) return jsonResponse({ error: 'invalid_link' }, 400);

  // Edge Functions rewrite HTML to text/plain, so browsers are sent to the Expo web page.
  if (request.method === 'GET' && url.searchParams.get('format') !== 'json') {
    return new Response(null, {
      status: 302,
      headers: { 'cache-control': 'no-store', location: createPublicBookingUrl(publicWebUrl, token), 'referrer-policy': 'no-referrer' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'unavailable' }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  if (request.method === 'POST') {
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > MAX_BODY_BYTES) return jsonResponse({ error: 'invalid_request' }, 413);
    let body: Record<string, unknown>;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) return jsonResponse({ error: 'invalid_request' }, 413);
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      body = parsed as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: 'invalid_request' }, 400);
    }

    const action = body.action;
    if (action !== 'submit' && action !== 'accept' && action !== 'decline' && action !== 'request_change') {
      return jsonResponse({ error: 'unsupported_action' }, 400);
    }
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
    const received = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload as Record<string, unknown> : {};
    // Only the fields each action may carry reach the database; anything else the client sends
    // (a price, a date, a package…) is dropped here and the stored offer stays the source of truth.
    const allowed = PAYLOAD_FIELDS[action];
    const payload = Object.fromEntries(Object.entries(received).filter(([key]) => allowed.includes(key)));

    // Free-plan limits apply to a submission, so the owner's *current* entitlement is verified with
    // RevenueCat on every attempt — never the plan the form was published under, and never anything
    // the client sends. A failed check is passed on as 'unknown', which the RPC reports as a
    // temporary failure rather than a limit.
    let verifiedPlan: VerifiedPlan | undefined;
    if (action === 'submit') {
      const { data: owner } = await admin.from('public_booking_offers').select('user_id').eq('token', token).maybeSingle();
      const check = owner?.user_id
        ? await checkProEntitlement(owner.user_id, {
            apiKey: Deno.env.get('REVENUECAT_SECRET_API_KEY'),
            entitlementId: Deno.env.get('REVENUECAT_PRO_ENTITLEMENT_ID') || undefined,
          })
        : { plan: 'unknown' as const, reason: 'link_not_found' };
      verifiedPlan = check.plan;
      // Reason codes only — never the token, the owner's id or the key.
      if (check.plan === 'unknown') console.warn('booking-public: entitlement check unavailable', { reason: check.reason });
    }

    const args = { p_token: token, p_action: action, p_payload: payload, p_idempotency_key: idempotencyKey };
    let { data, error } = await admin.rpc('respond_to_booking_offer', verifiedPlan ? { ...args, p_verified_plan: verifiedPlan } : args);
    // Rollout only: until the verified-plan migration is applied the database has no such
    // signature (PGRST202 — the function did not run), so the request is answered by the previous
    // one exactly as before. Once it is applied this never happens, and a call without the plan is
    // treated as unverified there, so it can never lift a limit.
    if (verifiedPlan && error?.code === 'PGRST202') {
      ({ data, error } = await admin.rpc('respond_to_booking_offer', args));
    }
    if (error?.code === 'P0002') return jsonResponse({ error: 'not_found' }, 404);
    if (error || !data || typeof data !== 'object') return jsonResponse({ error: 'unavailable' }, 503);

    const result = data as { ok?: boolean; error?: string; state?: unknown; retry_after_seconds?: unknown };
    if (!result.ok) {
      const code = typeof result.error === 'string' && result.error in RESPONSE_ERRORS ? result.error : 'unavailable';
      // A temporary throttle says how long to wait; a permanent limit (e.g. change requests) does not.
      const retryAfter = code === 'rate_limited' && Number.isInteger(result.retry_after_seconds) && (result.retry_after_seconds as number) > 0
        ? Math.min(result.retry_after_seconds as number, 3600)
        : null;
      return retryAfter
        ? jsonResponse({ error: code, retryAfterSeconds: retryAfter }, RESPONSE_ERRORS[code] ?? 503, { 'retry-after': String(retryAfter) })
        : jsonResponse({ error: code }, RESPONSE_ERRORS[code] ?? 503);
    }
    if (!result.state) return jsonResponse({ error: 'not_found' }, 404);
    return jsonResponse({ data: publicBookingOfferResponse(result.state) });
  }

  const { data, error } = await admin.rpc('read_booking_offer_state', { p_token: token });
  if (error) return jsonResponse({ error: 'unavailable' }, 503);
  if (!data) return jsonResponse({ error: 'not_found' }, 404);
  return jsonResponse({ data: publicBookingOfferResponse(data) });
});
