const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const { loadTs, plain } = require('./helpers/load-ts.cjs');

/**
 * The owner's Pro entitlement is verified with RevenueCat server-side on every booking-form
 * submission (booking-public) and on request after a purchase or restore (entitlement-status).
 * RevenueCat is a test double here; the Edge Functions and the shared check run as written.
 */
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const compile = (file) => ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

function loadEntitlement(fetchImpl) {
  const exports = {};
  vm.runInNewContext(compile('supabase/functions/_shared/pro-entitlement.ts'), {
    exports, fetch: fetchImpl, AbortController, setTimeout, clearTimeout, Date, Number, encodeURIComponent,
  });
  return exports;
}
const json = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });
const entitlements = (value) => json({ subscriber: { entitlements: value } });
const NOW = Date.parse('2026-10-25T12:00:00Z');

// --- The shared check -------------------------------------------------------------------------

test('RevenueCat decides: active, expired, grace period, lifetime, none', async () => {
  const check = (fetchImpl, options = {}) => loadEntitlement(fetchImpl).getVerifiedPlan('user_owner', { apiKey: 'sk_test', now: NOW, ...options });
  assert.equal(await check(entitlements({ bookflow_pro: { expires_date: '2026-11-25T00:00:00Z' } })), 'pro');
  assert.equal(await check(entitlements({ bookflow_pro: { expires_date: '2026-10-01T00:00:00Z' } })), 'free', 'expired → downgrade applies');
  assert.equal(await check(entitlements({ bookflow_pro: { expires_date: '2026-10-20T00:00:00Z', grace_period_expires_date: '2026-11-01T00:00:00Z' } })), 'pro', 'billing grace period');
  assert.equal(await check(entitlements({ bookflow_pro: { expires_date: null } })), 'pro', 'lifetime');
  assert.equal(await check(entitlements({})), 'free');
  assert.equal(await check(entitlements({ other_entitlement: { expires_date: null } })), 'free', 'only the Pro entitlement counts');
  assert.equal(await check(json({}, 404)), 'free', 'no customer record');
  // Configurable to match lib/revenuecat.ts; the default is the app's own id.
  assert.equal(loadEntitlement(json({})).DEFAULT_PRO_ENTITLEMENT_ID, loadTs('lib/revenuecat.ts', { process: { env: {} } }, { 'expo-constants': { ExecutionEnvironment: {} }, 'react-native': { Platform: {} }, 'react-native-purchases': {} }).PRO_ENTITLEMENT_ID);
});

test('anything short of a clear answer is "unknown", never "free"', async () => {
  const check = (fetchImpl, options = {}) => loadEntitlement(fetchImpl).getVerifiedPlan('user_owner', { apiKey: 'sk_test', now: NOW, ...options });
  assert.equal(await check(json({}, 500)), 'unknown');
  assert.equal(await check(json({}, 401)), 'unknown', 'misconfigured key');
  assert.equal(await check(json({ unexpected: true })), 'unknown');
  assert.equal(await check(async () => { throw new Error('offline'); }), 'unknown');
  assert.equal(await check(entitlements({ bookflow_pro: { expires_date: null } }), { apiKey: undefined }), 'unknown', 'no secret configured');
  const slow = (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  assert.equal(await check(slow, { timeoutMs: 20 }), 'unknown', 'timeout');
});

test('every answer carries a reason code that tells key, network, identity and entitlement apart', async () => {
  const check = (fetchImpl, options = {}) => loadEntitlement(fetchImpl).checkProEntitlement('user_owner', { apiKey: 'sk_test', now: NOW, ...options });
  const reason = async (...args) => plain(await check(...args));
  assert.deepEqual(await reason(entitlements({ bookflow_pro: { expires_date: null } })), { plan: 'pro', reason: 'entitlement_active' });
  assert.deepEqual(await reason(entitlements({})), { plan: 'free', reason: 'entitlement_missing' });
  assert.deepEqual(await reason(entitlements({ bookflow_pro: { expires_date: '2026-01-01T00:00:00Z' } })), { plan: 'free', reason: 'entitlement_expired' });
  assert.deepEqual(await reason(json({}, 404)), { plan: 'free', reason: 'customer_not_found' });
  assert.deepEqual(await reason(json({}, 401)), { plan: 'unknown', reason: 'key_rejected' }, 'e.g. a v2 key on the v1 endpoint');
  assert.deepEqual(await reason(json({}, 403)), { plan: 'unknown', reason: 'key_rejected' });
  assert.deepEqual(await reason(json({}, 429)), { plan: 'unknown', reason: 'http_429' });
  assert.deepEqual(await reason(json({ nope: 1 })), { plan: 'unknown', reason: 'malformed_response' });
  assert.deepEqual(await reason(async () => { throw new Error('offline'); }), { plan: 'unknown', reason: 'network' });
  const slow = (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  assert.deepEqual(await reason(slow, { timeoutMs: 20 }), { plan: 'unknown', reason: 'timeout' });
  assert.deepEqual(await reason(json({}), { apiKey: '' }), { plan: 'unknown', reason: 'no_api_key' });
});

test('asks about the owner by id, with the secret key', async () => {
  const seen = [];
  await loadEntitlement(async (url, init) => { seen.push({ url, init }); return new Response('{"subscriber":{"entitlements":{}}}'); })
    .getVerifiedPlan('user_2abc/../x', { apiKey: 'sk_secret', now: NOW });
  assert.equal(seen[0].url, 'https://api.revenuecat.com/v1/subscribers/user_2abc%2F..%2Fx');
  assert.equal(seen[0].init.headers.authorization, 'Bearer sk_secret');
});

// --- booking-public -----------------------------------------------------------------------------

function bookingPublic({ revenueCat = entitlements({ bookflow_pro: { expires_date: '2999-01-01T00:00:00Z' } }), owner = { user_id: 'owner-a' }, env = {}, result } = {}) {
  const payload = {};
  vm.runInNewContext(compile('supabase/functions/booking-public/payload.ts'), { exports: payload, Intl, Date, Math, Number, Array, Object, String });
  const rpc = [];
  const revenueCatCalls = [];
  const entitlement = loadEntitlement(async (url, init) => { revenueCatCalls.push(url); return revenueCat(url, init); });
  const values = { REVENUECAT_SECRET_API_KEY: 'sk_test', REVENUECAT_PRO_ENTITLEMENT_ID: '', SUPABASE_URL: 'https://x', SUPABASE_SERVICE_ROLE_KEY: 'service', ...env };
  let handler;
  const logs = [];
  vm.runInNewContext(compile('supabase/functions/booking-public/index.ts'), {
    exports: {}, Request, Response, URL, Date, JSON, Number, Object, Math, String,
    console: { warn: (...args) => logs.push(args), log: (...args) => logs.push(args) },
    Deno: { env: { get: (name) => values[name] }, serve: (fn) => { handler = fn; } },
    require: (name) => name === './payload.ts' ? payload : name === '../_shared/pro-entitlement.ts' ? entitlement : {
      createClient: () => ({
        rpc: async (fn, args) => { rpc.push({ fn, args }); const answer = typeof result === 'function' ? result(args) : result; return answer ?? { data: { ok: false, error: 'closed' }, error: null }; },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: owner, error: null }) }) }) }),
      }),
    },
  });
  const token = '6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b';
  const post = (body) => handler(new Request(`https://example.com/booking-public?format=json&token=${token}`, { method: 'POST', body: JSON.stringify(body) }));
  return { post, rpc, revenueCatCalls, logs, token, get: () => handler(new Request(`https://example.com/booking-public?format=json&token=${token}`)) };
}
const submitBody = (extra = {}) => ({ action: 'submit', idempotencyKey: 'k'.repeat(20), payload: { name: 'Siti', ownerPlan: 'pro', plan: 'pro', ...extra } });

test('every submit attempt verifies the owner’s current plan and passes it to the database', async () => {
  const pro = bookingPublic();
  await pro.post(submitBody());
  await pro.post(submitBody());
  assert.equal(pro.revenueCatCalls.length, 2, 'checked again on every attempt, never cached');
  assert.equal(pro.revenueCatCalls[0], 'https://api.revenuecat.com/v1/subscribers/owner-a');
  assert.equal(pro.rpc[0].args.p_verified_plan, 'pro');
  // Whatever the client claims about a plan never reaches the database.
  assert.equal('ownerPlan' in pro.rpc[0].args.p_payload || 'plan' in pro.rpc[0].args.p_payload, false);

  const free = bookingPublic({ revenueCat: entitlements({}) });
  await free.post(submitBody());
  assert.equal(free.rpc[0].args.p_verified_plan, 'free');

  for (const revenueCat of [json({}, 503), async () => { throw new Error('offline'); }]) {
    const failing = bookingPublic({ revenueCat });
    await failing.post(submitBody());
    assert.equal(failing.rpc[0].args.p_verified_plan, 'unknown');
  }
  const unconfigured = bookingPublic({ env: { REVENUECAT_SECRET_API_KEY: undefined } });
  await unconfigured.post(submitBody());
  assert.equal(unconfigured.rpc[0].args.p_verified_plan, 'unknown');
  // An unknown token still reaches the RPC, which answers "not found" as before.
  const unknownLink = bookingPublic({ owner: null });
  await unknownLink.post(submitBody());
  assert.equal(unknownLink.revenueCatCalls.length, 0);
  assert.equal(unknownLink.rpc[0].args.p_verified_plan, 'unknown');
});

test('reading a form and the other actions do not call RevenueCat', async () => {
  const s = bookingPublic({ result: { data: { kind: 'booking_form', status: 'sent', version: 1, offer: {} }, error: null } });
  await s.get();
  for (const action of ['accept', 'decline', 'request_change']) await s.post({ action, idempotencyKey: 'k'.repeat(20), payload: {} });
  assert.equal(s.revenueCatCalls.length, 0);
  assert.equal(s.rpc.filter((call) => 'p_verified_plan' in call.args).length, 0);
});

test('a temporary entitlement failure is reported as such, distinct from a confirmed limit', async () => {
  const unavailable = await bookingPublic({ result: { data: { ok: false, error: 'entitlement_unavailable' }, error: null } }).post(submitBody());
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error, 'entitlement_unavailable');
  const limited = await bookingPublic({ result: { data: { ok: false, error: 'plan_limit' }, error: null } }).post(submitBody());
  assert.equal(limited.status, 409);
  assert.equal((await limited.json()).error, 'plan_limit');
});

test('a temporary throttle tells the client how long to wait; a permanent limit does not', async () => {
  const throttled = await bookingPublic({ result: { data: { ok: false, error: 'rate_limited', retry_after_seconds: 412 }, error: null } }).post(submitBody());
  assert.equal(throttled.status, 429);
  assert.equal(throttled.headers.get('retry-after'), '412');
  assert.deepEqual(await throttled.json(), { error: 'rate_limited', retryAfterSeconds: 412 });
  // The change-request allowance is permanent: no wait is promised.
  const permanent = await bookingPublic({ result: { data: { ok: false, error: 'rate_limited' }, error: null } }).post(submitBody());
  assert.equal(permanent.status, 429);
  assert.equal(permanent.headers.get('retry-after'), null);
  assert.deepEqual(await permanent.json(), { error: 'rate_limited' });
  // Nonsense from the database is never passed on, and the wait is capped.
  const odd = await bookingPublic({ result: { data: { ok: false, error: 'rate_limited', retry_after_seconds: 'soon' }, error: null } }).post(submitBody());
  assert.deepEqual(await odd.json(), { error: 'rate_limited' });
  const capped = await bookingPublic({ result: { data: { ok: false, error: 'rate_limited', retry_after_seconds: 999999 }, error: null } }).post(submitBody());
  assert.equal((await capped.json()).retryAfterSeconds, 3600);
});

test('a failed entitlement check is logged by reason code only', async () => {
  const s = bookingPublic({ revenueCat: json({}, 401) });
  await s.post(submitBody());
  assert.equal(s.rpc[0].args.p_verified_plan, 'unknown');
  assert.equal(s.logs.length, 1);
  const logged = JSON.stringify(s.logs);
  assert.match(logged, /key_rejected/);
  assert.equal(logged.includes(s.token) || logged.includes('owner-a') || logged.includes('sk_test'), false, 'no token, owner id or key');
});

test('rollout: before the migration, booking-public answers through the previous signature', async () => {
  const missing = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
  const ok = { data: { ok: true, state: { kind: 'booking_form', status: 'submitted', version: 1, offer: {} } }, error: null };
  // Database not yet migrated: the five-argument call is not found (it did not run), so the same
  // request is made without the plan, exactly as the previous function did.
  const before = bookingPublic({ result: (args) => ('p_verified_plan' in args ? missing : ok) });
  const response = await before.post(submitBody());
  assert.equal(response.status, 200);
  assert.equal(before.rpc.length, 2);
  assert.equal(before.rpc[0].args.p_verified_plan, 'pro');
  assert.equal('p_verified_plan' in before.rpc[1].args, false);
  // Any other failure is never retried, and nothing but a missing signature triggers the fallback.
  const failing = bookingPublic({ result: { data: null, error: { code: '57014', message: 'timeout' } } });
  assert.equal((await failing.post(submitBody())).status, 503);
  assert.equal(failing.rpc.length, 1);
  const limited = bookingPublic({ result: { data: { ok: false, error: 'plan_limit' }, error: null } });
  await limited.post(submitBody());
  assert.equal(limited.rpc.length, 1);
});

// --- entitlement-status (owner's app, after a purchase or restore) -------------------------------

/** A token shaped like a Clerk session JWT. Its signature is checked by Supabase, not here. */
const jwt = (claims) => ['{"alg":"RS256"}', JSON.stringify(claims), 'sig'].map((part, i) => (i < 2 ? Buffer.from(part).toString('base64url') : part)).join('.');

function entitlementStatus({ workspace, revenueCat = entitlements({ bookflow_pro: { expires_date: '2999-01-01T00:00:00Z' } }), env = {} } = {}) {
  const clientOptions = [];
  const queries = [];
  const revenueCatCalls = [];
  const logs = [];
  const entitlement = loadEntitlement(async (url, init) => { revenueCatCalls.push(url); return revenueCat(url, init); });
  const values = { SUPABASE_URL: 'https://x', SUPABASE_ANON_KEY: 'anon', REVENUECAT_SECRET_API_KEY: 'sk_test', REVENUECAT_PRO_ENTITLEMENT_ID: '', ...env };
  let handler;
  vm.runInNewContext(compile('supabase/functions/entitlement-status/index.ts'), {
    exports: {}, Request, Response, Object, JSON, Math, atob,
    console: { warn: (...args) => logs.push(args) },
    Deno: { env: { get: (name) => values[name] }, serve: (fn) => { handler = fn; } },
    require: (name) => name === '../_shared/pro-entitlement.ts' ? entitlement : {
      createClient: (url, key, options) => {
        clientOptions.push({ key, options });
        return {
          from: (table) => ({
            select: (columns) => ({
              eq: (column, value) => ({
                maybeSingle: async () => {
                  queries.push({ table, columns, column, value });
                  // Default: PostgREST accepted the token and RLS returned the caller's own row.
                  return workspace ?? { data: { user_id: value }, error: null };
                },
              }),
            }),
          }),
        };
      },
    },
  });
  const call = (headers = { authorization: `Bearer ${jwt({ sub: 'owner-a' })}` }, method = 'POST', body = '{"userId":"owner-b","user_id":"owner-b"}') =>
    handler(new Request('https://example.com/entitlement-status', { method, headers, body: method === 'POST' ? body : undefined }));
  return { call, clientOptions, queries, revenueCatCalls, logs };
}

test('entitlement-status validates the caller’s session itself and answers only for that caller', async () => {
  const s = entitlementStatus();
  const response = await s.call();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { plan: 'pro', reason: 'entitlement_active' });
  // The caller's own token goes to Supabase with the anon key (never the service role), and the
  // row asked for is the token's subject — the body naming owner-b is never read.
  assert.equal(s.clientOptions[0].key, 'anon');
  assert.match(s.clientOptions[0].options.global.headers.Authorization, /^Bearer ey/);
  assert.deepEqual(plain(s.queries), [{ table: 'bookflow_workspaces', columns: 'user_id', column: 'user_id', value: 'owner-a' }]);
  assert.deepEqual(plain(s.revenueCatCalls), ['https://api.revenuecat.com/v1/subscribers/owner-a']);
});

test('entitlement-status refuses anything but a verified session for an existing workspace', async () => {
  const status = async (options, headers) => {
    const response = await entitlementStatus(options).call(headers);
    return [response.status, (await response.json()).reason];
  };
  assert.deepEqual(await status({}, {}), [401, 'missing_token']);
  assert.deepEqual(await status({}, { authorization: 'Bearer not-a-jwt' }), [401, 'malformed_token']);
  // A legacy anon key is a JWT without a user: refused before any lookup.
  assert.deepEqual(await status({}, { authorization: `Bearer ${jwt({ role: 'anon' })}` }), [401, 'malformed_token']);
  // A forged or expired token naming someone else: Supabase rejects its signature.
  assert.deepEqual(await status({ workspace: { data: null, error: { code: 'PGRST301', message: 'JWSInvalidSignature' } } }, { authorization: `Bearer ${jwt({ sub: 'owner-b' })}` }), [401, 'invalid_session']);
  assert.deepEqual(await status({ workspace: { data: null, error: { code: 'PGRST303', message: 'JWT expired' } } }), [401, 'invalid_session']);
  assert.deepEqual(await status({ workspace: { data: null, error: { code: '42501', message: 'permission denied' } } }), [401, 'invalid_session']);
  // RLS returned nothing (not this user, or no workspace) — or, defensively, someone else's row.
  assert.deepEqual(await status({ workspace: { data: null, error: null } }), [401, 'no_verified_workspace']);
  assert.deepEqual(await status({ workspace: { data: { user_id: 'owner-b' }, error: null } }), [401, 'no_verified_workspace']);
  // Server-side faults are not the caller's: 503, with the reason.
  assert.deepEqual(await status({ workspace: { data: null, error: { code: '57014', message: 'timeout' } } }), [503, 'workspace_lookup_failed']);
  assert.deepEqual(await status({ revenueCat: json({}, 401) }), [503, 'key_rejected']);
  assert.deepEqual(await status({ revenueCat: json({}, 500) }), [503, 'http_500']);
  const free = await entitlementStatus({ revenueCat: entitlements({}) }).call();
  assert.deepEqual(await free.json(), { plan: 'free', reason: 'entitlement_missing' });
  assert.equal((await entitlementStatus().call({}, 'GET')).status, 405);
  assert.match(read('supabase/config.toml'), /\[functions\.entitlement-status\]\s*\n(#.*\n)*verify_jwt = false/);
});

// --- The app: confirm with the server before saying existing links are ready ------------------

function activation() {
  return loadTs('lib/pro-activation.ts', { AbortController, setTimeout, clearTimeout, process: { env: {} } }, {
    '@/lib/supabase': { isSupabaseConfigured: true, getSupabaseFunctionUrl: (name) => `https://x/functions/v1/${name}` },
  });
}
const answers = (...list) => {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => { calls.push({ url, init }); const next = list[Math.min(calls.length - 1, list.length - 1)]; if (next instanceof Error) throw next; return new Response(JSON.stringify(next.body), { status: next.status ?? 200 }); } };
};
const noWait = { sleep: async () => {}, retryDelaysMs: [1, 1, 1] };

test('activation is only "active" once the server confirms, retrying a delayed record', async () => {
  const { confirmProActivation } = activation();
  const run = async (fetchImpl, token = 'token') => plain(await confirmProActivation(async () => token, { fetchImpl, ...noWait }));
  const delayed = answers({ body: { plan: 'free', reason: 'entitlement_missing' } }, { body: { plan: 'free', reason: 'entitlement_missing' } }, { body: { plan: 'pro', reason: 'entitlement_active' } });
  assert.deepEqual(await run(delayed.fetchImpl), { outcome: 'active', reason: 'entitlement_active' });
  assert.equal(delayed.calls.length, 3);
  assert.equal(delayed.calls[0].url, 'https://x/functions/v1/entitlement-status');
  assert.equal(delayed.calls[0].init.headers.authorization, 'Bearer token');
  const once = answers({ body: { plan: 'pro' } });
  await run(once.fetchImpl);
  assert.equal(once.calls.length, 1, 'stops as soon as it is confirmed');
});

test('a failed activation says which failure it was — never assumed', async () => {
  const { confirmProActivation } = activation();
  const run = async (fetchImpl, token = 'token') => plain(await confirmProActivation(async () => token, { fetchImpl, ...noWait }));
  // RevenueCat answered without Pro for this app user id (identity mismatch, or entitlement not visible).
  assert.deepEqual(await run(answers({ body: { plan: 'free', reason: 'entitlement_missing' } }).fetchImpl), { outcome: 'not_active', reason: 'entitlement_missing' });
  assert.deepEqual(await run(answers({ body: { plan: 'free', reason: 'customer_not_found' } }).fetchImpl), { outcome: 'not_active', reason: 'customer_not_found' });
  // The server key, the session, the network.
  assert.deepEqual(await run(answers({ status: 503, body: { error: 'unavailable', reason: 'key_rejected' } }).fetchImpl), { outcome: 'unavailable', reason: 'key_rejected' });
  assert.deepEqual(await run(answers({ status: 401, body: { error: 'unauthorized', reason: 'invalid_session' } }).fetchImpl), { outcome: 'unavailable', reason: 'session_rejected' });
  assert.deepEqual(await run(answers(new Error('offline')).fetchImpl), { outcome: 'unavailable', reason: 'network' });
  assert.deepEqual(await run(answers({ status: 502, body: null }).fetchImpl), { outcome: 'unavailable', reason: 'http_502' });
  assert.deepEqual(await run(answers({ body: { plan: 'pro' } }).fetchImpl, null), { outcome: 'unavailable', reason: 'no_session' });
  // A reason that is not a plain code is never passed through.
  assert.deepEqual(await run(answers({ status: 503, body: { reason: 'user owner-a <script>' } }).fetchImpl), { outcome: 'unavailable', reason: 'http_503' });
});

test('the paywall says "Activating Pro…" and only announces ready links after confirmation', () => {
  const paywall = read('app/paywall.tsx');
  const finish = paywall.slice(paywall.indexOf('const finishActivation = useCallback'), paywall.indexOf('const isBusy ='));
  assert.match(finish, /const \{ outcome, reason \} = await confirmProActivation\(getAccessToken\);/);
  assert.match(finish, /if \(outcome === 'active'\) \{\s*showSnackbar\(\{ message: t\('pro\.activation\.ready'\), tone: 'success' \}\);/);
  assert.match(finish, /Alert\.alert\(t\('pro\.activation\.pendingTitle'\), t\('pro\.activation\.pendingBody'\), \[/);
  assert.match(finish, /t\('pro\.activation\.retry'\), onPress: \(\) => \{ void finishActivation\(\); \}/);
  // Both a purchase and a restore that the store verified go through the server confirmation.
  assert.equal((paywall.match(/await finishActivation\(\);/g) ?? []).length, 2);
  // The screen does not close on the device's own isPro while that confirmation is running.
  assert.match(paywall, /if \(!isPro \|\| activationOwned\.current\) return;/);
  assert.match(paywall, /\{isActivating \? <>\s*<ActivityIndicator color="#FFFFFF" \/>\s*<Text style=\{styles\.primaryButtonText\}>\{t\('pro\.activation\.activating'\)\}<\/Text>/);
});

// --- Public page and owner messaging ------------------------------------------------------------

test('the public page retries cleanly and never mentions plans or billing', () => {
  const page = read('app/booking-public.tsx');
  assert.match(page, /plan_limit: 'pub\.error\.limit',/);
  assert.match(page, /entitlement_unavailable: 'pub\.error\.unavailable',/);
  const send = page.slice(page.indexOf('const send = async'), page.indexOf('const validateForm'));
  // A retry clears the previous error before asking again, reuses the same idempotency key, and the
  // entered details and terms selection are never reset by a failure. Nothing auto-submits.
  assert.match(send, /setPending\(action\);\s*setError\(null\);/);
  assert.match(send, /idempotencyKey: keyFor\(action\)/);
  assert.equal(/setForm\(|setAcceptTerms\(|localStorage|sessionStorage/.test(send), false);
  const i18n = loadTs('lib/i18n.ts');
  const en = i18n.translate('en', 'pub.error.limit');
  assert.equal(en, 'The business cannot take new online bookings right now. Your details have not been submitted. Please try again later or contact the business.');
  for (const locale of ['en', 'ms-MY']) {
    for (const key of ['pub.error.limit', 'pub.error.unavailable']) {
      assert.equal(/pro|plan|pelan|subscri|langgan|billing|upgrade|naik taraf/i.test(i18n.translate(locale, key)), false, `${locale} ${key}`);
    }
  }
  assert.notEqual(i18n.translate('en', 'pub.error.unavailable'), en, 'a failed check is not worded as a limit');
});

test('the owner sees a Free-limit block on the form card, explained, with the way out', () => {
  const screen = read('app/(tabs)/bookings.tsx');
  assert.match(screen, /const limitBlocked = \(form\.status === 'sent' \|\| changeRequested\) && \(/);
  assert.match(screen, /!checkPlanLimit\('bookings'\)\.allowed/);
  assert.match(screen, /!checkPlanLimit\('invoices'\)\.allowed/);
  assert.match(screen, /\(!form\.customerId && !checkPlanLimit\('customers'\)\.allowed\)/);
  assert.match(screen, /onPress=\{\(\) => router\.push\('\/paywall'\)\}/);
  // Text only: no icon in the notice.
  const notice = screen.slice(screen.indexOf('{limitBlocked ? ('), screen.indexOf('{changeRequested ? (', screen.indexOf('{limitBlocked ? (')));
  assert.equal(/<Ionicons/.test(notice), false);
  const i18n = loadTs('lib/i18n.ts');
  const keys = ['bk.form.limitBlocked', 'pro.activation.activating', 'pro.activation.ready', 'pro.activation.pendingTitle', 'pro.activation.pendingBody', 'pro.activation.retry', 'pro.activation.later', 'pub.error.unavailable'];
  for (const key of keys) {
    const en = i18n.translate('en', key);
    const ms = i18n.translate('ms-MY', key);
    assert.ok(en && en !== key && ms && ms !== key && ms !== en, key);
  }
  assert.equal(i18n.translate('en', 'pro.activation.activating'), 'Activating Pro…');
  assert.equal(i18n.translate('en', 'pro.activation.ready'), 'Pro is active. Existing booking links are ready to use.');
  assert.equal(i18n.translate('en', 'bk.form.limitBlocked'), 'Free plan limit reached. Upgrade to Pro to continue receiving bookings.');
  assert.equal(i18n.translate('ms-MY', 'bk.form.limitBlocked'), 'Had pelan Percuma dicapai. Naik taraf ke Pro untuk terus menerima tempahan.');
  // It states the limit the app's own counts show, and never claims what a client can or cannot do.
  assert.equal(/can’t submit|can't submit|tidak dapat menghantar borang ini buat masa ini/.test(i18n.translate('en', 'bk.form.limitBlocked') + i18n.translate('ms-MY', 'bk.form.limitBlocked')), false);
});

test('a throttled client is told how long to wait, in English and Malay', () => {
  const page = read('app/booking-public.tsx');
  assert.match(page, /const retryAfter = code === 'rate_limited' && typeof body\?\.retryAfterSeconds === 'number' && body\.retryAfterSeconds > 0 \? body\.retryAfterSeconds : 0;/);
  // The wait shown is the server's, never shorter: seconds under a minute, else minutes rounded up.
  assert.match(page, /retryAfter < 60\s*\? t\('pub\.error\.rateWaitSeconds', \{ seconds: Math\.ceil\(retryAfter\) \}\)\s*: t\('pub\.error\.rateWait', \{ minutes: Math\.ceil\(retryAfter \/ 60\) \}\)/);
  const i18n = loadTs('lib/i18n.ts');
  assert.equal(i18n.translate('en', 'pub.error.rateWait', { minutes: 7 }), 'Too many attempts in a short time. Your details have not been submitted. Please wait 7 min and try again.');
  assert.match(i18n.translate('ms-MY', 'pub.error.rateWait', { minutes: 7 }), /tunggu 7 minit/);
  assert.equal(i18n.translate('en', 'pub.error.rateWaitSeconds', { seconds: 40 }), 'Too many attempts in a short time. Your details have not been submitted. Please wait 40 seconds and try again.');
  assert.match(i18n.translate('ms-MY', 'pub.error.rateWaitSeconds', { seconds: 40 }), /tunggu 40 saat/);
  // The permanent change-request limit keeps its own wording.
  assert.equal(i18n.translate('en', 'pub.error.rate'), 'Too many attempts. Please contact the business directly.');
});
