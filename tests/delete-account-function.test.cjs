const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

/**
 * Runs the real delete-account Edge Function against mocked Clerk, Supabase Storage, the deletion
 * RPC and RevenueCat. Tokens are shaped like JWTs; the jose mock checks the key id against the
 * instance's JWKS exactly as signature verification would, so a token from an instance whose keys
 * are not configured is rejected the same way the deployed function rejects it.
 */
const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/delete-account/index.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;

const PROD = 'sk_live_PRODSECRET';
const DEV = 'sk_test_DEVSECRET';
const DEV_ISSUER = 'https://splendid-pangolin-4730.clerk.accounts.dev';
const PROD_ISSUER = 'https://clerk.bookflow.my';
const DEV_ENV = { CLERK_DEVELOPMENT_SECRET_KEY: DEV, CLERK_DEVELOPMENT_ISSUER: DEV_ISSUER, CLERK_ISSUER: PROD_ISSUER };
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = ({ kid, sub = 'user_owner', iss = kid === 'dev' ? 'https://splendid-pangolin-4730.clerk.accounts.dev' : 'https://clerk.bookflow.my', act, expired }) =>
  `${b64({ alg: 'RS256', kid })}.${b64({ sub, iss, ...(act ? { act } : {}), ...(expired ? { expired: true } : {}) })}.signature`;

function setup({ env = {}, clerkDelete = 200, jwksStatus = {}, storage = { files: ['business-logo'] }, rpcFailures = 0, rpcFailsOn = [], revenuecat = 200 } = {}) {
  const calls = { rpc: [], removed: [], clerkDeletes: [], revenuecat: [], logs: [] };
  let rpcFailuresLeft = rpcFailures;
  let storageFiles = [...storage.files];
  const environment = { CLERK_SECRET_KEY: PROD, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-SECRET', REVENUECAT_SECRET_API_KEY: 'sk_rc-SECRET', ...env };

  const jose = {
    createLocalJWKSet: (jwks) => jwks,
    jwtVerify: async (jwt, keys, options = {}) => {
      const [header, payload] = jwt.split('.').slice(0, 2).map((part) => JSON.parse(Buffer.from(part, 'base64url').toString()));
      if (!keys.keys.some((key) => key.kid === header.kid)) throw Object.assign(new Error('no key'), { code: 'ERR_JWKS_NO_MATCHING_KEY' });
      if (payload.expired) throw Object.assign(new Error('expired'), { code: 'ERR_JWT_EXPIRED' });
      if (options.issuer && payload.iss !== options.issuer) throw Object.assign(new Error('iss'), { code: 'ERR_JWT_CLAIM_VALIDATION_FAILED' });
      return { payload };
    },
  };
  const admin = {
    storage: {
      from: () => ({
        list: async (folder) => (storage.listFails ? { data: null, error: { message: 'boom' } } : { data: folder.includes('/') ? [] : storageFiles.map((name) => ({ id: name, name })), error: null }),
        remove: async (files) => {
          if (storage.removeFails) return { error: { message: 'boom' } };
          calls.removed.push(...files);
          storageFiles = [];
          return { error: null };
        },
      }),
    },
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      // rpcFailsOn: 1-based call numbers that fail (e.g. [2, 3, 4] fails the final sweep three times).
      if (rpcFailsOn.includes(calls.rpc.length)) return { error: { message: 'db down' } };
      if (rpcFailuresLeft > 0) {
        rpcFailuresLeft -= 1;
        return { error: { message: 'db down' } };
      }
      return { error: null };
    },
  };
  const fetchMock = async (url, init = {}) => {
    const auth = init.headers?.authorization ?? '';
    if (url === 'https://api.clerk.com/v1/jwks') {
      const secret = auth.replace('Bearer ', '');
      const status = jwksStatus[secret] ?? 200;
      if (status !== 200) return new Response('{}', { status });
      return Response.json({ keys: [{ kid: secret === DEV ? 'dev' : 'prod' }] });
    }
    if (url.startsWith('https://api.clerk.com/v1/users/')) {
      calls.clerkDeletes.push({ secret: auth.replace('Bearer ', ''), user: decodeURIComponent(url.split('/').pop()) });
      return new Response('{}', { status: typeof clerkDelete === 'function' ? clerkDelete() : clerkDelete });
    }
    if (url.startsWith('https://api.revenuecat.com/')) {
      calls.revenuecat.push(url);
      return new Response('{}', { status: revenuecat });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const log = (...args) => calls.logs.push(JSON.stringify(args));

  let handler;
  vm.runInNewContext(source, {
    exports: {}, Response, URL, Date, JSON, Map, Promise, atob, Error,
    fetch: fetchMock,
    console: { log, warn: log, error: log },
    Deno: { env: { get: (key) => environment[key] }, serve: (fn) => { handler = fn; } },
    require: (name) => (name.includes('jose') ? jose : { createClient: () => admin }),
  });
  const request = (jwt, body = '{}') => handler(new Request('https://example.com/delete-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
    body,
  }));
  return { request, calls };
}

const read = async (response) => ({ status: response.status, body: await response.json() });

test('root cause: a development-instance token is refused when only the production key is configured', async () => {
  const { request, calls } = setup();
  const result = await read(await request(token({ kid: 'dev' })));
  assert.deepEqual(result, { status: 401, body: { error: 'unauthorized', reason: 'unknown_issuer' } });
  // Refused before anything was touched.
  assert.equal(calls.rpc.length, 0);
  assert.equal(calls.removed.length, 0);
  assert.equal(calls.clerkDeletes.length, 0);
  assert.ok(calls.logs.some((line) => line.includes('splendid-pangolin-4730.clerk.accounts.dev')));
});

test('with the development key configured, a development user is deleted completely, through its own instance', async () => {
  const { request, calls } = setup({ env: DEV_ENV });
  const result = await read(await request(token({ kid: 'dev', sub: 'user_dev1' })));
  assert.deepEqual(result, { status: 200, body: { deleted: true } });
  assert.deepEqual(calls.removed, ['user_dev1/business-logo']);
  assert.deepEqual(calls.rpc.map((call) => call.args.p_user_id), ['user_dev1', 'user_dev1']);
  assert.deepEqual(calls.clerkDeletes, [{ secret: DEV, user: 'user_dev1' }]);
  assert.equal(calls.revenuecat.length, 1);
});

test('production users still verify and delete through the production instance', async () => {
  const { request, calls } = setup({ env: DEV_ENV });
  assert.equal((await request(token({ kid: 'prod', sub: 'user_prod1' }))).status, 200);
  assert.deepEqual(calls.clerkDeletes, [{ secret: PROD, user: 'user_prod1' }]);
});

test('the deleted user comes only from the verified token; the body cannot name someone else', async () => {
  const { request, calls } = setup();
  await request(token({ kid: 'prod', sub: 'user_me' }), JSON.stringify({ user_id: 'user_victim', p_user_id: 'user_victim' }));
  assert.ok(calls.rpc.every((call) => call.args.p_user_id === 'user_me'));
  assert.ok(calls.clerkDeletes.every((call) => call.user === 'user_me'));
});

test('missing, expired and impersonated tokens are refused with a reason and touch nothing', async () => {
  for (const [jwt, reason] of [[null, 'missing_token'], [token({ kid: 'prod', expired: true }), 'token_expired'], [token({ kid: 'prod', act: { sub: 'support' } }), 'impersonation']]) {
    const { request, calls } = setup();
    assert.deepEqual(await read(await request(jwt)), { status: 401, body: { error: 'unauthorized', reason } });
    assert.equal(calls.rpc.length + calls.clerkDeletes.length + calls.removed.length, 0);
  }
});

test('a failure before the login is removed keeps the login, so the same request can simply be retried', async () => {
  const failing = setup({ storage: { files: ['business-logo'], removeFails: true } });
  const first = await read(await failing.request(token({ kid: 'prod' })));
  assert.deepEqual(first, { status: 500, body: { error: 'deletion_failed', step: 'storage_remove' } });
  assert.equal(failing.calls.clerkDeletes.length, 0);

  const database = setup({ rpcFailures: 1 });
  assert.deepEqual(await read(await database.request(token({ kid: 'prod' }))), { status: 500, body: { error: 'deletion_failed', step: 'database' } });
  assert.equal(database.calls.clerkDeletes.length, 0);
  // Retry: storage is already empty and the database step now succeeds.
  assert.equal((await database.request(token({ kid: 'prod' }))).status, 200);
  assert.equal(database.calls.clerkDeletes.length, 1);
});

test('RevenueCat refusing stops the request before any BookFlow data is removed; an unknown customer is fine', async () => {
  const refused = setup({ revenuecat: 401 });
  assert.deepEqual(await read(await refused.request(token({ kid: 'prod' }))), { status: 500, body: { error: 'deletion_failed', step: 'revenuecat' } });
  // Nothing destructive ran: no storage removal, no database deletion, no Clerk deletion.
  assert.equal(refused.calls.removed.length + refused.calls.rpc.length + refused.calls.clerkDeletes.length, 0);
  assert.equal((await setup({ revenuecat: 404 }).request(token({ kid: 'prod' }))).status, 200);
});

test('a Clerk user that is already gone counts as deleted; a Clerk outage is a failure', async () => {
  assert.equal((await setup({ clerkDelete: 404 }).request(token({ kid: 'prod' }))).status, 200);
  const outage = await read(await setup({ clerkDelete: 503 }).request(token({ kid: 'prod' })));
  assert.deepEqual(outage, { status: 500, body: { error: 'deletion_failed', step: 'clerk_production' } });
});

test('the final sweep is retried; if it still fails after the login is gone, completion is reported and logged', async () => {
  // Call 1 is the main database step; calls 2–4 are the post-login sweep.
  const recovered = setup({ rpcFailsOn: [2, 3] });
  assert.equal((await recovered.request(token({ kid: 'prod' }))).status, 200);
  assert.equal(recovered.calls.rpc.length, 4);
  assert.ok(recovered.calls.logs.some((line) => line.includes('"sweep":"clean"')));

  const pending = setup({ rpcFailsOn: [2, 3, 4] });
  // Every row was already removed in step 2 and the login is gone, so the person sees it complete…
  assert.deepEqual(await read(await pending.request(token({ kid: 'prod' }))), { status: 200, body: { deleted: true } });
  // …and the unfinished sweep is logged for follow-up rather than hidden.
  assert.ok(pending.calls.logs.some((line) => line.includes('final sweep failed')));
});

test('a key server outage for one instance does not hide a token another instance signed', async () => {
  const { request } = setup({ env: DEV_ENV, jwksStatus: { [PROD]: 503 } });
  assert.equal((await request(token({ kid: 'dev' }))).status, 200);
  const allDown = setup({ jwksStatus: { [PROD]: 503 } });
  assert.deepEqual(await read(await allDown.request(token({ kid: 'prod' }))), { status: 503, body: { error: 'unavailable' } });
});

test('logs and responses never contain tokens or secrets', async () => {
  const { request, calls } = setup({ env: DEV_ENV, storage: { files: ['x'], removeFails: true } });
  const jwt = token({ kid: 'dev', sub: 'user_dev9' });
  const responseText = JSON.stringify(await (await request(jwt)).json());
  await request(token({ kid: 'nobody' }));
  const everything = calls.logs.join('\n') + responseText;
  for (const secret of [PROD, DEV, 'service-role-SECRET', 'sk_rc-SECRET', jwt, jwt.split('.')[2]]) {
    assert.equal(everything.includes(secret), false, `leaked ${secret.slice(0, 12)}`);
  }
});

test('issuer pinning: the development instance stays off without its issuer, and a wrong iss is refused', async () => {
  const noIssuer = setup({ env: { CLERK_DEVELOPMENT_SECRET_KEY: DEV } });
  assert.deepEqual(await read(await noIssuer.request(token({ kid: 'dev' }))), { status: 401, body: { error: 'unauthorized', reason: 'unknown_issuer' } });
  assert.equal(noIssuer.calls.clerkDeletes.length, 0);

  // Signed with the development keys but claiming another issuer.
  const forged = setup({ env: DEV_ENV });
  assert.deepEqual(await read(await forged.request(token({ kid: 'dev', iss: 'https://evil.example' }))), { status: 401, body: { error: 'unauthorized', reason: 'wrong_issuer' } });
  // A production-signed token carrying the development issuer is refused by the production pin.
  assert.equal((await read(await forged.request(token({ kid: 'prod', iss: DEV_ISSUER })))).body.reason, 'wrong_issuer');
  assert.equal(forged.calls.clerkDeletes.length + forged.calls.rpc.length, 0);
});

test('without CLERK_ISSUER set, production keeps working exactly as deployed today', async () => {
  const { request } = setup();
  assert.equal((await request(token({ kid: 'prod' }))).status, 200);
});

test('production root cause: a public SDK key configured as the RevenueCat secret is refused up front', async () => {
  // Supabase's REVENUECAT_SECRET_API_KEY currently has the same fingerprint as the app's public appl_ key.
  const { request, calls } = setup({ env: { REVENUECAT_SECRET_API_KEY: 'appl_publicSdkKey' } });
  assert.deepEqual(await read(await request(token({ kid: 'prod' }))), { status: 500, body: { error: 'deletion_failed', step: 'revenuecat_config' } });
  assert.equal(calls.revenuecat.length, 0);
  assert.equal(calls.removed.length + calls.rpc.length + calls.clerkDeletes.length, 0);
  assert.ok(calls.logs.some((line) => line.includes('revenuecat_config')));
  assert.ok(!calls.logs.join('').includes('appl_publicSdkKey'));
});
