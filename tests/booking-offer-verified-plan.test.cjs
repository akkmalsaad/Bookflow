const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.BOOKFLOW_PGLITE_PATH || '@electric-sql/pglite');

/**
 * Regression: a booking form published while the business was on Free stayed blocked after the
 * owner bought Pro, because submissions were limited by the plan stored on the link when it was
 * published (`owner_plan`). Now the Edge Function verifies the owner's current entitlement on every
 * attempt and passes it in (p_verified_plan).
 *
 * Runs every migration against an isolated in-memory Postgres (PGlite) — never a hosted database.
 * The RevenueCat check itself is the Edge Function's; here the verified plan is supplied directly.
 */
const project = path.resolve(__dirname, '..');
// The exact release combination: production's applied migrations plus this fix only — the pending
// invoice-edit guard (20261021000000) is deliberately not part of this release. Read from the release
// bundle, so the files tested are the files that will be pushed.
const bundle = path.join(project, 'supabase/releases/2026-10-25-booking-form-entitlement');
const releaseDir = path.join(bundle, 'release-workdir/supabase/migrations');
const migrations = fs.readdirSync(releaseDir).filter((file) => file.endsWith('.sql')).sort();
let db;

test.before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid, bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.jwt() to authenticated, anon;
    grant usage on schema public to authenticated, anon, service_role;`);
  for (const file of migrations) await db.exec(fs.readFileSync(path.join(releaseDir, file), 'utf8'));
});
test.after(async () => db?.close());

const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);
const TOKENS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const KEY = (n) => `regression-key-${String(n).padStart(4, '0')}`.padEnd(20, 'x');
const snapshot = (date) => ({
  v: 1, kind: 'booking_form', version: 1, currency: 'MYR', locale: 'en', timeZone: 'UTC',
  business: { name: 'Studio' }, title: 'Wedding', packageName: 'Wedding', lines: [], totalCents: 320000,
  date, startTime: '10:00', endTime: '12:00', bufferMinutes: 0, location: 'KL', terms: 'Terms', termsVersion: 't1',
  validUntil: null, requireEmail: true, acceptedConflictIds: [],
});
const form = { version: 1, name: 'Siti Nur', phone: '+60 12-345 6789', email: 'siti@example.my', location: 'KL', acceptTerms: true, termsVersion: 't1' };
/** `n` bookings created this month — the Free plan allows 5. */
const bookingsThisMonth = (n) => Array.from({ length: n }, (_, i) => ({ id: `bk-${i}`, createdAt: today, date: '2027-01-0' + (i + 1), startTime: '09:00', endTime: '10:00', status: 'Confirmed' }));

async function reset({ bookings = 5, links = 1, ownerPlan = 'free', status = 'sent', expires = "now() + interval '7 days'" } = {}) {
  await db.exec('reset role; delete from public_booking_offers; delete from bookflow_workspaces;');
  await db.query('insert into bookflow_workspaces(user_id, data) values ($1, $2)', ['owner-a', JSON.stringify({ bookings: bookingsThisMonth(bookings), invoices: [], customers: [], payments: [] })]);
  for (let i = 0; i < links; i += 1) {
    // Published while on Free: the stored owner_plan says 'free', exactly as before the upgrade.
    await db.query(`insert into public_booking_offers(token, user_id, offer_id, kind, offer, status, owner_plan, expires_at)
      values ($1, 'owner-a', $2, 'booking_form', $3, $4, $5, ${expires})`, [TOKENS[i], `ofr-${i}`, JSON.stringify(snapshot(`2027-02-1${i}`)), status, ownerPlan]);
  }
}
/** What booking-public sends: the verified plan, or nothing at all (the previous Edge Function). */
async function submit(token, key, plan) {
  const args = [token, 'submit', JSON.stringify(form), key];
  const sql = plan === undefined
    ? 'select respond_to_booking_offer($1, $2, $3, $4) as r'
    : 'select respond_to_booking_offer($1, $2, $3, $4, $5) as r';
  return (await db.query(sql, plan === undefined ? args : [...args, plan])).rows[0].r;
}
const row = async (token = TOKENS[0]) => (await db.query('select * from public_booking_offers where token = $1', [token])).rows[0];

test('the exact regression: blocked on Free, then the same open page retries after Pro and succeeds once', async () => {
  await reset();
  // 1–3. Form created on Free, the Free booking limit is reached, the client's submit is refused.
  const blocked = await submit(TOKENS[0], KEY(1), 'free');
  assert.deepEqual(blocked, { ok: false, error: 'plan_limit' });
  let stored = await row();
  assert.equal(stored.status, 'sent');
  assert.equal(stored.response, null, 'nothing about the client was stored');
  assert.equal(stored.idempotency_key, null, 'a refused attempt does not consume the key');

  // 4–5. Pro is now verified; the already-open page taps Submit again with the same idempotency key.
  const retried = await submit(TOKENS[0], KEY(1), 'pro');
  assert.equal(retried.ok, true);
  assert.equal(retried.state.status, 'submitted');
  stored = await row();
  assert.equal(stored.status, 'submitted');
  assert.equal(stored.response.email, 'siti@example.my');
  assert.equal(stored.owner_plan, 'free', 'the stale stored plan no longer decides anything');

  // 6. Repeats of the same request return the same result and change nothing: one submission.
  const again = await submit(TOKENS[0], KEY(1), 'pro');
  assert.equal(again.ok, true);
  assert.equal((await row()).submitted_at.getTime(), stored.submitted_at.getTime());
  assert.equal(Number((await db.query(`select count(*) from public_booking_offers where status = 'submitted'`)).rows[0].count), 1);
});

test('every previously published active form becomes eligible once Pro is verified', async () => {
  await reset({ links: 3 });
  for (const [i, token] of TOKENS.entries()) {
    assert.deepEqual(await submit(token, KEY(10 + i), 'free'), { ok: false, error: 'plan_limit' });
  }
  for (const [i, token] of TOKENS.entries()) {
    const result = await submit(token, KEY(20 + i), 'pro');
    assert.equal(result.ok, true, token);
  }
});

test('Free owners at the limit stay blocked; under the limit they can still take bookings', async () => {
  await reset({ bookings: 5 });
  assert.deepEqual(await submit(TOKENS[0], KEY(30), 'free'), { ok: false, error: 'plan_limit' });
  await reset({ bookings: 4, links: 2 });
  assert.equal((await submit(TOKENS[0], KEY(31), 'free')).ok, true);
  // The response still waiting to become a booking counts, so the next client is refused.
  assert.deepEqual(await submit(TOKENS[1], KEY(32), 'free'), { ok: false, error: 'plan_limit' });
});

test('a failed entitlement check is a temporary failure, not "limit reached"', async () => {
  await reset({ bookings: 5 });
  assert.deepEqual(await submit(TOKENS[0], KEY(40), 'unknown'), { ok: false, error: 'entitlement_unavailable' });
  assert.equal((await row()).status, 'sent');
  // Retried once the check works again.
  assert.equal((await submit(TOKENS[0], KEY(40), 'pro')).ok, true);
  // Within the Free allowance the plan does not matter, so an unverified check does not block.
  await reset({ bookings: 0 });
  assert.equal((await submit(TOKENS[0], KEY(41), 'unknown')).ok, true);
  // Anything else passed in is unverified, never a plan.
  await reset({ bookings: 5 });
  assert.deepEqual(await submit(TOKENS[0], KEY(42), 'premium'), { ok: false, error: 'entitlement_unavailable' });
});

test('no verified plan (the previous Edge Function) is unverified: a stored "pro" never lifts a limit', async () => {
  // owner_plan is written by the owner's app, so a client could set it; it decides nothing now.
  await reset({ bookings: 5, ownerPlan: 'pro' });
  assert.deepEqual(await submit(TOKENS[0], KEY(50)), { ok: false, error: 'entitlement_unavailable' });
  await reset({ bookings: 5, ownerPlan: 'free' });
  assert.deepEqual(await submit(TOKENS[0], KEY(51)), { ok: false, error: 'entitlement_unavailable' });
  // Within the Free allowance the old caller keeps working during the rollout.
  await reset({ bookings: 0, ownerPlan: 'free' });
  assert.equal((await submit(TOKENS[0], KEY(52))).ok, true);
  // Only the five-argument function exists, so old and new calls resolve to it unambiguously.
  const overloads = (await db.query(`select pg_get_function_identity_arguments(p.oid) as args from pg_proc p where p.proname = 'respond_to_booking_offer'`)).rows;
  assert.deepEqual(overloads.map((item) => item.args), ['p_token uuid, p_action text, p_payload jsonb, p_idempotency_key text, p_verified_plan text']);
  // Execution is service_role only: no public or signed-in client can call it, with any plan.
  const grants = (await db.query(`select grantee from information_schema.routine_privileges where routine_name = 'respond_to_booking_offer' and privilege_type = 'EXECUTE'`)).rows.map((item) => item.grantee).sort();
  assert.equal(grants.includes('anon') || grants.includes('authenticated') || grants.includes('PUBLIC'), false, grants.join(','));
  assert.ok(grants.includes('service_role'));
});

test('upgrading never reopens turned-off, expired, deleted, submitted or converted forms', async () => {
  await reset({ status: 'revoked' });
  await assert.rejects(submit(TOKENS[0], KEY(60), 'pro'), /not found or expired/);
  await reset({ expires: "now() - interval '1 minute'" });
  await assert.rejects(submit(TOKENS[0], KEY(61), 'pro'), /not found or expired/);
  await reset();
  await db.exec('delete from public_booking_offers');
  await assert.rejects(submit(TOKENS[0], KEY(62), 'pro'), /not found or expired/);
  for (const status of ['submitted', 'converted']) {
    await reset({ status: 'sent' });
    await db.query(`update public_booking_offers set status = $1 where token = $2`, [status, TOKENS[0]]);
    assert.deepEqual(await submit(TOKENS[0], KEY(63), 'pro'), { ok: false, error: 'closed' }, status);
    assert.equal((await row()).status, status, 'its submission state is kept');
  }
});

test('the server-only function stays closed to clients', async () => {
  await reset();
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`reset role; set role ${role}`);
    await assert.rejects(db.query(`select respond_to_booking_offer($1, 'submit', '{}'::jsonb, $2, 'pro')`, [TOKENS[0], KEY(70)]), /permission denied/, role);
  }
  await db.exec('reset role');
  assert.equal(month, today.slice(0, 7));
});

// --- Attempts: a fixed-window throttle instead of a lifetime cap --------------------------------

/** Moves a link's throttle window into the past, as if the wait had elapsed. */
const expireWindow = (token = TOKENS[0]) => db.query(`update public_booking_offers set attempt_window_started_at = now() - interval '16 minutes' where token = $1`, [token]);

test('a link with 30+ blocked attempts under the old cap recovers once Pro is verified', async () => {
  await reset({ bookings: 5 });
  // As left by the previous lifetime limit: 35 attempts, no window yet.
  await db.query(`update public_booking_offers set attempt_count = 35 where token = $1`, [TOKENS[0]]);
  const result = await submit(TOKENS[0], KEY(80), 'pro');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal((await row()).status, 'submitted');
  assert.equal((await row()).attempt_count, 36, 'still tallied, no longer limiting');
});

test('blocked attempts throttle for a while, never for good; after the wait one submission is made', async () => {
  await reset({ bookings: 5 });
  for (let i = 0; i < 10; i += 1) {
    assert.deepEqual(await submit(TOKENS[0], KEY(81), 'free'), { ok: false, error: 'plan_limit' });
  }
  const throttled = await submit(TOKENS[0], KEY(81), 'pro');
  assert.equal(throttled.ok, false);
  assert.equal(throttled.error, 'rate_limited');
  assert.ok(throttled.retry_after_seconds >= 1 && throttled.retry_after_seconds <= 900, String(throttled.retry_after_seconds));
  assert.equal((await row()).status, 'sent', 'a throttled attempt changes nothing');

  await expireWindow();
  // The same open page, same idempotency key, now on Pro.
  const retried = await submit(TOKENS[0], KEY(81), 'pro');
  assert.equal(retried.ok, true);
  for (let i = 0; i < 15; i += 1) assert.equal((await submit(TOKENS[0], KEY(81), 'pro')).ok, true, 'replays of a success are never throttled');
  assert.equal(Number((await db.query(`select count(*) from public_booking_offers where status = 'submitted'`)).rows[0].count), 1);
  assert.equal((await row()).response.email, 'siti@example.my');
});

test('repeated entitlement-service failures never disable a link', async () => {
  await reset({ bookings: 5 });
  for (let round = 0; round < 3; round += 1) {
    for (let i = 0; i < 10; i += 1) {
      assert.deepEqual(await submit(TOKENS[0], KEY(82), 'unknown'), { ok: false, error: 'entitlement_unavailable' });
    }
    assert.equal((await submit(TOKENS[0], KEY(82), 'unknown')).error, 'rate_limited');
    await expireWindow();
  }
  // 30 failed attempts later — the old lifetime cap — the service recovers and the link works.
  assert.equal((await row()).attempt_count, 30);
  assert.equal((await submit(TOKENS[0], KEY(82), 'pro')).ok, true);
});

test('abusive bursts are still throttled, per link, without extending the wait', async () => {
  await reset({ bookings: 0, links: 2 });
  for (let i = 0; i < 10; i += 1) {
    assert.equal((await respondRaw(TOKENS[0], { ...form, name: 'x' }, KEY(90 + i))).error, 'invalid_name');
  }
  const first = await respondRaw(TOKENS[0], form, KEY(200));
  assert.equal(first.error, 'rate_limited');
  const startedAt = (await row()).attempt_window_started_at.getTime();
  for (let i = 0; i < 20; i += 1) assert.equal((await respondRaw(TOKENS[0], form, KEY(300 + i))).error, 'rate_limited');
  const after = await row();
  assert.equal(after.attempt_window_count, 10, 'throttled attempts are not counted again');
  assert.equal(after.attempt_window_started_at.getTime(), startedAt, 'the wait is not pushed back');
  assert.equal(after.status, 'sent');
  // Another link of the same owner is unaffected.
  assert.equal((await respondRaw(TOKENS[1], form, KEY(400))).ok, true);
});

test('concurrent submissions on one link: one succeeds, the rest change nothing', async () => {
  await reset({ bookings: 0 });
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => respondRaw(TOKENS[0], form, KEY(500 + i))));
  assert.equal(results.filter((item) => item.ok).length, 1);
  assert.ok(results.filter((item) => !item.ok).every((item) => item.error === 'closed'), JSON.stringify(results));
  assert.equal(Number((await db.query(`select count(*) from public_booking_offers where status = 'submitted'`)).rows[0].count), 1);
});

/** booking-public's call on a verified Pro owner, with any payload. */
async function respondRaw(token, payload, key) {
  return (await db.query('select respond_to_booking_offer($1, $2, $3, $4, $5) as r', [token, 'submit', JSON.stringify(payload), key, 'pro'])).rows[0].r;
}

test('the workspace lookup entitlement-status relies on returns only the verified caller’s own row', async () => {
  await reset();
  await db.query(`insert into bookflow_workspaces(user_id, data) values ('owner-b', '{}')`);
  const lookup = async (role, sub, target) => {
    await db.exec(`reset role; set role ${role}; set request.jwt.claims = '${JSON.stringify(sub ? { sub, role } : { role })}'`);
    try {
      return (await db.query('select user_id from bookflow_workspaces where user_id = $1', [target])).rows;
    } finally {
      await db.exec('reset role');
    }
  };
  assert.deepEqual(await lookup('authenticated', 'owner-a', 'owner-a'), [{ user_id: 'owner-a' }]);
  // Signed in as owner-b, asking for owner-a — what a forged `sub` would need — returns nothing.
  assert.deepEqual(await lookup('authenticated', 'owner-b', 'owner-a'), []);
  // No signed-in user at all is refused outright.
  await assert.rejects(lookup('anon', null, 'owner-a'), /permission denied/);
});

// --- The release bundle ---------------------------------------------------------------------------

/** Applied in production (supabase migration list, 2026-10-25) — the baseline this release builds on. */
const PRODUCTION_BASELINE = ['20260824000000', '20260824001000', '20260828000000', '20260830000000', '20260915000000',
  '20260916000000', '20260916010000', '20261016000000', '20261019000000'];

test('the release pushes exactly the production baseline plus this fix, byte-for-byte as in the source', () => {
  assert.deepEqual(migrations.map((file) => file.slice(0, 14)), [...PRODUCTION_BASELINE, '20261025000000']);
  assert.equal(migrations.some((file) => file.startsWith('20261021000000')), false, 'invoice-edit guard excluded');
  for (const file of migrations) {
    assert.ok(fs.readFileSync(path.join(releaseDir, file)).equals(fs.readFileSync(path.join(project, 'supabase/migrations', file))), file);
  }
  assert.ok(fs.readFileSync(path.join(bundle, 'release-workdir/supabase/config.toml')).equals(fs.readFileSync(path.join(project, 'supabase/config.toml'))));
  // The fix's own SQL names nothing that only the skipped migration creates.
  const fix = fs.readFileSync(path.join(releaseDir, '20261025000000_booking_offer_verified_plan.sql'), 'utf8');
  assert.equal(/guard_bookflow_workspace_invoice_write|bookflow_workspaces_invoice_guard/.test(fix), false);
});

test('owners cannot set or reset the throttle; legitimate re-sharing still works', async () => {
  await reset({ bookings: 0 });
  for (let i = 0; i < 10; i += 1) await respondRaw(TOKENS[0], { ...form, name: 'x' }, KEY(600 + i));
  assert.equal((await respondRaw(TOKENS[0], form, KEY(611))).error, 'rate_limited');
  const before = await row();

  await db.exec(`reset role; set role authenticated; set request.jwt.claims = '{"sub":"owner-a"}'`);
  try {
    await assert.rejects(db.query(`update public_booking_offers set attempt_window_count = 0 where token = $1`, [TOKENS[0]]), /not writable/);
    await assert.rejects(db.query(`update public_booking_offers set attempt_window_started_at = null where token = $1`, [TOKENS[0]]), /not writable/);
    await assert.rejects(db.query(`update public_booking_offers set attempt_window_started_at = now() - interval '1 day' where token = $1`, [TOKENS[0]]), /not writable/);
    await assert.rejects(db.query(`insert into public_booking_offers(user_id, offer_id, kind, offer, status, attempt_window_count) values ('owner-a', 'ofr-new', 'booking_form', '{}', 'sent', 3)`), /not writable/);
    await assert.rejects(db.query(`insert into public_booking_offers(user_id, offer_id, kind, offer, status, attempt_window_started_at) values ('owner-a', 'ofr-new', 'booking_form', '{}', 'sent', now())`), /not writable/);
    // What the app does when it re-shares a form: an upsert of the owner's own fields.
    await db.query(`insert into public_booking_offers(user_id, offer_id, kind, version, offer, status, owner_plan, expires_at, updated_at)
      values ('owner-a', 'ofr-0', 'booking_form', 2, $1, 'sent', 'pro', now() + interval '10 days', now())
      on conflict (user_id, offer_id) do update set version = excluded.version, offer = excluded.offer, status = excluded.status,
        owner_plan = excluded.owner_plan, expires_at = excluded.expires_at, updated_at = excluded.updated_at`, [JSON.stringify(snapshot('2027-02-10'))]);
    // And a brand-new form starts clean.
    await db.query(`insert into public_booking_offers(user_id, offer_id, kind, offer, status) values ('owner-a', 'ofr-new', 'booking_form', '{}', 'sent')`);
  } finally {
    await db.exec('reset role');
  }
  const after = await row();
  assert.equal(after.version, 2, 'the re-share landed');
  assert.equal(after.attempt_window_count, before.attempt_window_count);
  assert.equal(after.attempt_window_started_at.getTime(), before.attempt_window_started_at.getTime());
  // The throttle is still in force; a verified upgrade does not lift it either.
  const stillThrottled = await submit(TOKENS[0], KEY(612), 'pro');
  assert.equal(stillThrottled.error, 'rate_limited');
});

test('the rollback restores the previous function and guard exactly', async () => {
  const fresh = new PGlite();
  try {
    await fresh.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid, bucket_id text, name text);
      create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
      create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      grant usage on schema public to authenticated, anon, service_role;`);
    const definitions = async () => Object.fromEntries((await fresh.query(`select proname, pg_get_function_identity_arguments(oid) as args, prosrc from pg_proc
      where proname in ('respond_to_booking_offer', 'guard_public_booking_offer_owner_write') order by proname`)).rows.map((item) => [item.proname, { args: item.args, src: item.prosrc }]));
    for (const file of migrations.filter((name) => !name.startsWith('20261025'))) await fresh.exec(fs.readFileSync(path.join(releaseDir, file), 'utf8'));
    const baseline = await definitions();
    await fresh.exec(fs.readFileSync(path.join(releaseDir, '20261025000000_booking_offer_verified_plan.sql'), 'utf8'));
    assert.notDeepEqual(await definitions(), baseline);
    await fresh.exec(fs.readFileSync(path.join(bundle, 'rollback/20261025_rollback.sql'), 'utf8'));
    assert.deepEqual(await definitions(), baseline);
    const grants = (await fresh.query(`select grantee from information_schema.routine_privileges where routine_name = 'respond_to_booking_offer' and privilege_type = 'EXECUTE'`)).rows.map((item) => item.grantee);
    assert.equal(grants.includes('anon') || grants.includes('authenticated'), false);
  } finally {
    await fresh.close();
  }
});
