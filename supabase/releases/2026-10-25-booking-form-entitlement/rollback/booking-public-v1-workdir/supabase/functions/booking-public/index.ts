import { createClient } from 'npm:@supabase/supabase-js@2';

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

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
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

    const { data, error } = await admin.rpc('respond_to_booking_offer', {
      p_token: token,
      p_action: action,
      p_payload: payload,
      p_idempotency_key: idempotencyKey,
    });
    if (error?.code === 'P0002') return jsonResponse({ error: 'not_found' }, 404);
    if (error || !data || typeof data !== 'object') return jsonResponse({ error: 'unavailable' }, 503);

    const result = data as { ok?: boolean; error?: string; state?: unknown };
    if (!result.ok) {
      const code = typeof result.error === 'string' && result.error in RESPONSE_ERRORS ? result.error : 'unavailable';
      return jsonResponse({ error: code }, RESPONSE_ERRORS[code] ?? 503);
    }
    if (!result.state) return jsonResponse({ error: 'not_found' }, 404);
    return jsonResponse({ data: publicBookingOfferResponse(result.state) });
  }

  const { data, error } = await admin.rpc('read_booking_offer_state', { p_token: token });
  if (error) return jsonResponse({ error: 'unavailable' }, 503);
  if (!data) return jsonResponse({ error: 'not_found' }, 404);
  return jsonResponse({ data: publicBookingOfferResponse(data) });
});
