const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

/**
 * Runs the real delete-account Edge Function against mocked Clerk, Supabase Storage, the database
 * RPCs and RevenueCat. Tokens are shaped like JWTs; the jose mock checks the key id against the
 * instance's JWKS exactly as signature verification would, so a token from an instance whose keys
 * are not configured is rejected the same way the deployed function rejects it.
 *
 * The deletion record RPC is simulated with the same idempotency the SQL has;
 * tests/account-deletion-guard.test.cjs runs the real SQL.
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
/** What production has today: the public iOS SDK key stored as the RevenueCat "secret". */
const PUBLIC_KEY = 'appl_publicSdkKey';
const SECRET_KEY = 'sk_rc-SECRET';
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = ({ kid, sub = 'user_owner', iss = kid === 'dev' ? 'https://splendid-pangolin-4730.clerk.accounts.dev' : 'https://clerk.bookflow.my', act, expired }) =>
  `${b64({ alg: 'RS256', kid })}.${b64({ sub, iss, ...(act ? { act } : {}), ...(expired ? { expired: true } : {}) })}.signature`;

function setup({ env = {}, clerkDelete = 200, jwksStatus = {}, storage = { files: ['business-logo'] }, deleteFailures = 0, deleteFailsOn = [], recordFails = [], records = new Map() } = {}) {
  // `steps` is every side effect in order; `records` is the simulated deleted_accounts table.
  const calls = { steps: [], deletes: [], removed: [], clerkDeletes: [], revenuecat: [], logs: [], records };
  let deleteFailuresLeft = deleteFailures;
  let storageFiles = [...storage.files];
  const environment = { CLERK_SECRET_KEY: PROD, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-SECRET', REVENUECAT_SECRET_API_KEY: PUBLIC_KEY, ...env };

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
          calls.steps.push('storage');
          calls.removed.push(...files);
          storageFiles = [];
          return { error: null };
        },
      }),
    },
    rpc: async (name, args) => {
      if (name === 'record_account_deletion') {
        calls.steps.push(`record:${args.p_event}`);
        if (recordFails.includes(args.p_event)) return { error: { message: 'db down' } };
        const row = records.get(args.p_user_id) ?? { instance: args.p_clerk_instance, loginDeleted: false };
        if (args.p_event === 'login_deleted') row.loginDeleted = true;
        records.set(args.p_user_id, row);
        return { data: null, error: null };
      }
      if (name === 'delete_bookflow_account_data') {
        calls.deletes.push(args.p_user_id);
        // deleteFailsOn: 1-based delete calls that fail (e.g. [2, 3, 4] fails the final sweep three times).
        if (deleteFailsOn.includes(calls.deletes.length)) return { error: { message: 'db down' } };
        if (deleteFailuresLeft > 0) {
          deleteFailuresLeft -= 1;
          return { error: { message: 'db down' } };
        }
        calls.steps.push('database');
        return { error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
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
      const status = typeof clerkDelete === 'function' ? clerkDelete() : clerkDelete;
      if (status < 300 || status === 404) calls.steps.push('clerk');
      return new Response('{}', { status });
    }
    if (url.startsWith('https://api.revenuecat.com/')) {
      calls.steps.push('revenuecat_api');
      calls.revenuecat.push({ url, method: init.method, key: auth.replace('Bearer ', '') });
      return new Response('{}', { status: revenuecat });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const log = (...args) => calls.logs.push(JSON.stringify(args));

  let handler;
  vm.runInNewContext(source, {
    exports: {}, Response, URL, Date, JSON, Map, Promise, atob, Error, Number,
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
const DONE = { deleted: true };

// --- The deletion ----------------------------------------------------------------------------------

test('a successful deletion: data, then the deleted-account record, then the login — success only after both', async () => {
  const { request, calls } = setup();
  assert.deepEqual(await read(await request(token({ kid: 'prod' }))), { status: 200, body: DONE });
  assert.deepEqual(calls.steps, ['storage', 'database', 'record:data_deleted', 'clerk', 'record:login_deleted', 'database']);
  assert.deepEqual(calls.removed, ['user_owner/business-logo']);
  assert.equal(calls.records.get('user_owner').loginDeleted, true);
});

test('RevenueCat is never called — with today’s public key or with a secret key', async () => {
  for (const key of [PUBLIC_KEY, SECRET_KEY, undefined]) {
    const { request, calls } = setup({ env: { REVENUECAT_SECRET_API_KEY: key } });
    assert.deepEqual(await read(await request(token({ kid: 'prod' }))), { status: 200, body: DONE }, String(key));
    assert.deepEqual(calls.revenuecat, [], String(key));
  }
  assert.equal(/api\.revenuecat\.com/.test(fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/delete-account/index.ts'), 'utf8')), false);
});

test('a failure before the data is gone keeps everything retryable and nothing locked', async () => {
  const failing = setup({ storage: { files: ['business-logo'], removeFails: true } });
  assert.deepEqual(await read(await failing.request(token({ kid: 'prod' }))), { status: 500, body: { error: 'deletion_failed', step: 'storage_remove' } });
  assert.equal(failing.calls.clerkDeletes.length, 0);
  assert.equal(failing.calls.records.size, 0, 'not recorded as deleted: the account can still be used or retried');

  const database = setup({ deleteFailures: 1 });
  assert.deepEqual(await read(await database.request(token({ kid: 'prod' }))), { status: 500, body: { error: 'deletion_failed', step: 'database' } });
  assert.equal(database.calls.clerkDeletes.length, 0);
  // Retry: storage is already empty and the rest runs.
  assert.deepEqual(await read(await database.request(token({ kid: 'prod' }))), { status: 200, body: DONE });
  assert.equal(database.calls.clerkDeletes.length, 1);
});

test('if the account cannot be recorded as deleted, the login is kept and the person is told to retry', async () => {
  const { request, calls } = setup({ recordFails: ['data_deleted'] });
  assert.deepEqual(await read(await request(token({ kid: 'prod' }))), { status: 500, body: { error: 'deletion_failed', step: 'deletion_record', dataDeleted: true } });
  assert.equal(calls.clerkDeletes.length, 0, 'the login is never removed while stale tokens could still write');
});

test('the login failing after the data is gone says so, and a retry finishes it', async () => {
  let clerkStatus = 503;
  const records = new Map();
  const { request, calls } = setup({ clerkDelete: () => clerkStatus, records });
  assert.deepEqual(await read(await request(token({ kid: 'prod' }))), { status: 500, body: { error: 'deletion_failed', step: 'clerk_production', dataDeleted: true } });
  assert.equal(records.get('user_owner').loginDeleted, false);
  clerkStatus = 200;
  assert.deepEqual(await read(await request(token({ kid: 'prod' }))), { status: 200, body: DONE });
  assert.equal(records.size, 1);
  assert.equal(records.get('user_owner').loginDeleted, true);
  assert.equal(calls.clerkDeletes.length, 2);
});

test('a Clerk user that is already gone counts as deleted', async () => {
  assert.deepEqual(await read(await setup({ clerkDelete: 404 }).request(token({ kid: 'prod' }))), { status: 200, body: DONE });
});

test('if only the after-login bookkeeping fails, the completed deletion is still reported, accurately', async () => {
  const { request, calls } = setup({ recordFails: ['login_deleted'] });
  assert.deepEqual(await read(await request(token({ kid: 'prod' }))), { status: 200, body: DONE });
  assert.ok(calls.logs.some((line) => line.includes('"loginRecorded":false')));
});

test('the final sweep is retried; if it still fails after the login is gone, completion is reported and logged', async () => {
  // Delete call 1 is the main database step; calls 2–4 are the post-login sweep.
  const recovered = setup({ deleteFailsOn: [2, 3] });
  assert.equal((await recovered.request(token({ kid: 'prod' }))).status, 200);
  assert.equal(recovered.calls.deletes.length, 4);
  assert.ok(recovered.calls.logs.some((line) => line.includes('"sweep":"clean"')));

  const pending = setup({ deleteFailsOn: [2, 3, 4] });
  assert.deepEqual(await read(await pending.request(token({ kid: 'prod' }))), { status: 200, body: DONE });
  assert.ok(pending.calls.logs.some((line) => line.includes('final sweep failed')));
});

// --- Authentication (unchanged) -------------------------------------------------------------------

test('root cause: a development-instance token is refused when only the production key is configured', async () => {
  const { request, calls } = setup();
  const result = await read(await request(token({ kid: 'dev' })));
  assert.deepEqual(result, { status: 401, body: { error: 'unauthorized', reason: 'unknown_issuer' } });
  assert.deepEqual(calls.steps, [], 'refused before anything was touched');
  assert.ok(calls.logs.some((line) => line.includes('splendid-pangolin-4730.clerk.accounts.dev')));
});

test('with the development key configured, a development user is deleted completely, through its own instance', async () => {
  const { request, calls } = setup({ env: DEV_ENV });
  const result = await read(await request(token({ kid: 'dev', sub: 'user_dev1' })));
  assert.deepEqual(result, { status: 200, body: DONE });
  assert.deepEqual(calls.removed, ['user_dev1/business-logo']);
  assert.deepEqual(calls.deletes, ['user_dev1', 'user_dev1']);
  assert.deepEqual(calls.clerkDeletes, [{ secret: DEV, user: 'user_dev1' }]);
  assert.equal(calls.records.get('user_dev1').instance, 'development');
});

test('production users still verify and delete through the production instance', async () => {
  const { request, calls } = setup({ env: DEV_ENV });
  assert.equal((await request(token({ kid: 'prod', sub: 'user_prod1' }))).status, 200);
  assert.deepEqual(calls.clerkDeletes, [{ secret: PROD, user: 'user_prod1' }]);
});

test('the deleted user comes only from the verified token; the body cannot name someone else', async () => {
  const { request, calls } = setup();
  await request(token({ kid: 'prod', sub: 'user_me' }), JSON.stringify({ user_id: 'user_victim', p_user_id: 'user_victim', p_app_user_id: 'user_victim' }));
  assert.ok(calls.deletes.every((id) => id === 'user_me'));
  assert.ok(calls.clerkDeletes.every((call) => call.user === 'user_me'));
  assert.deepEqual([...calls.records.keys()], ['user_me']);
});

test('missing, expired and impersonated tokens are refused with a reason and touch nothing', async () => {
  for (const [jwt, reason] of [[null, 'missing_token'], [token({ kid: 'prod', expired: true }), 'token_expired'], [token({ kid: 'prod', act: { sub: 'support' } }), 'impersonation']]) {
    const { request, calls } = setup();
    assert.deepEqual(await read(await request(jwt)), { status: 401, body: { error: 'unauthorized', reason } });
    assert.deepEqual(calls.steps, []);
    assert.equal(calls.records.size, 0);
  }
});

test('a key server outage for one instance does not hide a token another instance signed', async () => {
  const { request } = setup({ env: DEV_ENV, jwksStatus: { [PROD]: 503 } });
  assert.equal((await request(token({ kid: 'dev' }))).status, 200);
  const allDown = setup({ jwksStatus: { [PROD]: 503 } });
  assert.deepEqual(await read(await allDown.request(token({ kid: 'prod' }))), { status: 503, body: { error: 'unavailable' } });
  assert.deepEqual(allDown.calls.steps, []);
});

test('logs and responses never contain tokens, secrets or the user id', async () => {
  const { request, calls } = setup({ env: { ...DEV_ENV, REVENUECAT_SECRET_API_KEY: SECRET_KEY }, storage: { files: ['x'], removeFails: true } });
  const jwt = token({ kid: 'dev', sub: 'user_dev9' });
  const responseText = JSON.stringify(await (await request(jwt)).json());
  await request(token({ kid: 'nobody' }));
  const succeeded = setup({ env: { REVENUECAT_SECRET_API_KEY: SECRET_KEY } });
  const okText = JSON.stringify(await (await succeeded.request(token({ kid: 'prod', sub: 'user_private42' }))).json());
  const everything = calls.logs.join('\n') + responseText + succeeded.calls.logs.join('\n') + okText;
  for (const secret of [PROD, DEV, 'service-role-SECRET', SECRET_KEY, PUBLIC_KEY, jwt, jwt.split('.')[2], 'user_dev9', 'user_private42']) {
    assert.equal(everything.includes(secret), false, `leaked ${secret.slice(0, 12)}`);
  }
});

test('issuer pinning: the development instance stays off without its issuer, and a wrong iss is refused', async () => {
  const noIssuer = setup({ env: { CLERK_DEVELOPMENT_SECRET_KEY: DEV } });
  assert.deepEqual(await read(await noIssuer.request(token({ kid: 'dev' }))), { status: 401, body: { error: 'unauthorized', reason: 'unknown_issuer' } });
  assert.equal(noIssuer.calls.clerkDeletes.length, 0);

  const forged = setup({ env: DEV_ENV });
  assert.deepEqual(await read(await forged.request(token({ kid: 'dev', iss: 'https://evil.example' }))), { status: 401, body: { error: 'unauthorized', reason: 'wrong_issuer' } });
  assert.equal((await read(await forged.request(token({ kid: 'prod', iss: DEV_ISSUER })))).body.reason, 'wrong_issuer');
  assert.deepEqual(forged.calls.steps, []);
});

test('without CLERK_ISSUER set, production keeps working exactly as deployed today', async () => {
  const { request } = setup();
  assert.equal((await request(token({ kid: 'prod' }))).status, 200);
});

test('released app versions read `deleted: true` as success; failures never carry it', async () => {
  // The released 1.0.0 client treats exactly `deleted === true` as a completed deletion.
  assert.equal((await read(await setup().request(token({ kid: 'prod' })))).body.deleted, true);
  for (const options of [{ recordFails: ['data_deleted'] }, { storage: { files: ['x'], removeFails: true } }, { clerkDelete: 503 }]) {
    assert.equal((await read(await setup(options).request(token({ kid: 'prod' })))).body.deleted, undefined);
  }
});
