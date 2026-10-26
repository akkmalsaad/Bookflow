const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.BOOKFLOW_PGLITE_PATH || '@electric-sql/pglite');

/**
 * Account deletion with a tracked RevenueCat erasure (20261026000000_revenuecat_erasure_queue).
 *
 * Runs the exact release combination — production's applied migrations plus this one, from the
 * release bundle — against an isolated in-memory Postgres (PGlite), never a hosted database.
 */
const project = path.resolve(__dirname, '..');
const bundle = path.join(project, 'supabase/releases/2026-10-26-account-deletion');
const releaseDir = path.join(bundle, 'release-workdir/supabase/migrations');
const migrations = fs.readdirSync(releaseDir).filter((file) => file.endsWith('.sql')).sort();
const PRODUCTION_BASELINE = ['20260824000000', '20260824001000', '20260828000000', '20260830000000', '20260915000000',
  '20260916000000', '20260916010000', '20261016000000', '20261019000000'];

async function freshDatabase(files = migrations) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid, bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.jwt() to authenticated, anon;
    grant usage on schema public to authenticated, anon, service_role;`);
  for (const file of files) await db.exec(fs.readFileSync(path.join(releaseDir, file), 'utf8'));
  return db;
}

let db;
test.before(async () => { db = await freshDatabase(); });
test.after(async () => db?.close());

const as = async (role, sub) => db.exec(`reset role; set role ${role}; set request.jwt.claims = '${JSON.stringify(sub ? { sub } : {})}'`);
const asOwner = () => db.exec('reset role');
const call = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const requestErasure = (user, instance = 'production') => call('select public.request_revenuecat_erasure($1, $2) as r', [user, instance]).then((row) => row.r);
const progress = (user, event) => call('select public.record_revenuecat_erasure_progress($1, $2) as r', [user, event]).then((row) => row.r);
const queue = (all = false) => db.query('select * from bookflow_admin.revenuecat_erasure_queue($1)', [all]).then((result) => result.rows);
const complete = (user, by) => call('select bookflow_admin.complete_revenuecat_erasure($1, $2) as r', [user, by]).then((row) => row.r);

async function seedAccount(user) {
  await asOwner();
  await db.query('insert into bookflow_workspaces(user_id, data) values ($1, $2)', [user, JSON.stringify({ bookings: [{ id: 'bk-1' }], invoices: [], customers: [] })]);
  await db.query(`insert into public_invoice_links(user_id, invoice_id, status, payload) values ($1, 'inv-1', 'Sent', '{}')`, [user]);
  await db.query(`insert into public_booking_offers(user_id, offer_id, kind, offer, status) values ($1, 'ofr-1', 'booking_form', '{}', 'sent')`, [user]);
}
async function reset() {
  await asOwner();
  await db.exec('delete from public_booking_offers; delete from public_invoice_links; delete from support_requests; delete from user_feedback; delete from bookflow_workspaces; delete from revenuecat_erasure_requests;');
}
const count = async (table, user) => Number((await call(`select count(*) from ${table} where user_id = $1`, [user])).count);

test('the release is production’s baseline plus this migration only, byte-for-byte as in the source', () => {
  assert.deepEqual(migrations.map((file) => file.slice(0, 14)), [...PRODUCTION_BASELINE, '20261026000000']);
  for (const file of migrations) {
    assert.ok(fs.readFileSync(path.join(releaseDir, file)).equals(fs.readFileSync(path.join(project, 'supabase/migrations', file))), file);
  }
  assert.ok(fs.readFileSync(path.join(bundle, 'release-workdir/supabase/config.toml')).equals(fs.readFileSync(path.join(project, 'supabase/config.toml'))));
});

test('the queue and its functions are unreachable from every client role', async () => {
  await reset();
  await requestErasure('user_a');
  for (const role of ['anon', 'authenticated']) {
    await as(role, 'user_a');
    await assert.rejects(db.query('select * from revenuecat_erasure_requests'), /permission denied/, role);
    await assert.rejects(db.query(`insert into revenuecat_erasure_requests(app_user_id, clerk_instance) values ('x', 'production')`), /permission denied/, role);
    await assert.rejects(db.query(`delete from revenuecat_erasure_requests`), /permission denied/, role);
    await assert.rejects(db.query(`select public.request_revenuecat_erasure('user_b', 'production')`), /permission denied/, role);
    await assert.rejects(db.query(`select public.record_revenuecat_erasure_progress('user_a', 'erased_by_api')`), /permission denied/, role);
    await assert.rejects(db.query('select * from bookflow_admin.revenuecat_erasure_queue()'), /permission denied/, role);
    await assert.rejects(db.query(`select bookflow_admin.complete_revenuecat_erasure('user_a', 'Mallory')`), /permission denied/, role);
  }
  // The Edge Function's role can open and progress a request, but cannot read the table or act as admin.
  await as('service_role');
  assert.equal((await requestErasure('user_b')).status, 'requested');
  await assert.rejects(db.query('select * from revenuecat_erasure_requests'), /permission denied/);
  await assert.rejects(db.query('select * from bookflow_admin.revenuecat_erasure_queue()'), /permission denied/);
  await assert.rejects(db.query(`select bookflow_admin.complete_revenuecat_erasure('user_a', 'Service')`), /permission denied/);
  await asOwner();
});

test('one request per account: repeating it returns the same request; the deadline is 30 days', async () => {
  await reset();
  const first = await requestErasure('user_a');
  const again = await requestErasure('user_a', 'development');
  assert.equal(again.reference, first.reference);
  assert.equal(Number((await call('select count(*) from revenuecat_erasure_requests')).count), 1);
  const row = await call('select * from revenuecat_erasure_requests');
  assert.equal(row.clerk_instance, 'production', 'a repeat changes nothing');
  assert.equal(row.deadline_at.getTime() - row.requested_at.getTime(), 30 * 24 * 3600 * 1000);
  // Only the identifier BookFlow gives RevenueCat is stored — no name, email or other detail.
  const columns = (await db.query(`select column_name from information_schema.columns where table_name = 'revenuecat_erasure_requests' order by ordinal_position`)).rows.map((item) => item.column_name);
  assert.deepEqual(columns, ['id', 'app_user_id', 'clerk_instance', 'status', 'requested_at', 'deadline_at', 'account_deleted_at', 'completed_at', 'completed_by']);
  await assert.rejects(requestErasure(''), /app user id is required/);
});

test('deleting the account removes its data, booking forms included, but never the erasure request', async () => {
  await reset();
  await seedAccount('user_a');
  await seedAccount('user_other');
  await requestErasure('user_a');
  await requestErasure('user_other');
  const result = (await call(`select public.delete_bookflow_account_data('user_a') as r`)).r;
  assert.deepEqual(result, { public_invoice_links: 1, public_booking_offers: 1, support_requests: 0, user_feedback: 0, bookflow_workspaces: 1 });
  for (const table of ['bookflow_workspaces', 'public_invoice_links', 'public_booking_offers']) {
    assert.equal(await count(table, 'user_a'), 0, table);
    assert.equal(await count(table, 'user_other'), 1, `${table}: another account is untouched`);
  }
  assert.equal(Number((await call(`select count(*) from revenuecat_erasure_requests where app_user_id = 'user_a'`)).count), 1);
  // Running it again (a retry) is a no-op.
  assert.deepEqual((await call(`select public.delete_bookflow_account_data('user_a') as r`)).r.bookflow_workspaces, 0);
});

test('once the deletion is carried out, nothing can write the account back — while requested, it still can', async () => {
  await reset();
  await seedAccount('user_a');
  await requestErasure('user_a');
  // Still 'requested' (e.g. deletion failed before anything was removed): the account works as before.
  await as('authenticated', 'user_a');
  await db.query(`update bookflow_workspaces set data = '{"bookings":[]}' where user_id = 'user_a'`);
  await asOwner();
  await db.query(`select public.delete_bookflow_account_data('user_a')`);
  await progress('user_a', 'account_deleted');
  // A session token still valid for a few seconds cannot recreate anything…
  await as('authenticated', 'user_a');
  await assert.rejects(db.query(`insert into bookflow_workspaces(user_id, data) values ('user_a', '{}')`), /account has been deleted/);
  await assert.rejects(db.query(`insert into support_requests(user_id, topic, message) values ('user_a', 'other', 'Please help with this')`), /account has been deleted|permission denied/);
  // …nor can a server role.
  await asOwner();
  await assert.rejects(db.query(`insert into bookflow_workspaces(user_id, data) values ('user_a', '{}')`), /account has been deleted/);
  await assert.rejects(db.query(`insert into public_invoice_links(user_id, invoice_id, status, payload) values ('user_a', 'inv-9', 'Sent', '{}')`), /account has been deleted/);
  await assert.rejects(db.query(`insert into support_requests(user_id, topic, message) values ('user_a', 'other', 'Please help with this')`), /account has been deleted/);
  // Other accounts are unaffected.
  await as('authenticated', 'user_b');
  await db.query(`insert into bookflow_workspaces(user_id, data) values ('user_b', '{}')`);
  await asOwner();
});

test('progress only moves forward; an API erasure completes the request once', async () => {
  await reset();
  await requestErasure('user_a');
  assert.equal((await progress('user_a', 'account_deleted')).status, 'account_deleted');
  assert.equal((await progress('user_a', 'account_deleted')).status, 'account_deleted');
  const done = await progress('user_a', 'erased_by_api');
  assert.equal(done.status, 'completed');
  const row = await call(`select * from revenuecat_erasure_requests where app_user_id = 'user_a'`);
  assert.equal(row.completed_by, 'revenuecat_api');
  // Repeats never reopen or re-stamp it.
  assert.equal((await progress('user_a', 'account_deleted')).status, 'completed');
  await progress('user_a', 'erased_by_api');
  assert.equal((await call(`select completed_at from revenuecat_erasure_requests where app_user_id = 'user_a'`)).completed_at.getTime(), row.completed_at.getTime());
  await assert.rejects(progress('user_unknown', 'account_deleted'), /No erasure request/);
  await assert.rejects(progress('user_a', 'something_else'), /Unknown erasure event/);
});

test('admin queue: urgency, ordering and the 30-day deadline', async () => {
  await reset();
  for (const user of ['user_requested', 'user_pending', 'user_due', 'user_late', 'user_done']) await requestErasure(user);
  for (const user of ['user_pending', 'user_due', 'user_late', 'user_done']) await progress(user, 'account_deleted');
  await progress('user_done', 'erased_by_api');
  await db.query(`update revenuecat_erasure_requests set deadline_at = now() + interval '5 days' where app_user_id = 'user_due'`);
  await db.query(`update revenuecat_erasure_requests set deadline_at = now() - interval '1 day' where app_user_id = 'user_late'`);
  const open = await queue();
  assert.deepEqual(open.map((item) => [item.app_user_id, item.urgency]), [
    ['user_late', 'overdue'], ['user_due', 'due_soon'], ['user_requested', 'awaiting_account_deletion'], ['user_pending', 'pending'],
  ].sort((a, b) => open.findIndex((item) => item.app_user_id === a[0]) - open.findIndex((item) => item.app_user_id === b[0])));
  assert.equal(open[0].app_user_id, 'user_late', 'most urgent first');
  assert.ok(open.find((item) => item.app_user_id === 'user_pending').days_left >= 29);
  assert.equal(open.some((item) => item.app_user_id === 'user_done'), false, 'completed hidden by default');
  assert.equal((await queue(true)).find((item) => item.app_user_id === 'user_done').urgency, 'completed');
});

test('admin completion: only after the account deletion finished, with who verified it, once', async () => {
  await reset();
  await requestErasure('user_requested');
  await requestErasure('user_a');
  await progress('user_a', 'account_deleted');
  await assert.rejects(complete('user_a', ''), /Say who verified/);
  await assert.rejects(complete('user_a', ' '), /Say who verified/);
  await assert.rejects(complete('user_requested', 'Akkmal'), /has not finished/);
  await assert.rejects(complete('user_unknown', 'Akkmal'), /No erasure request/);
  const done = await complete('user_a', '  Akkmal  ');
  assert.equal(done.status, 'completed');
  assert.equal(done.completed_by, 'Akkmal');
  // Repeating it — even by someone else — changes nothing.
  const again = await complete('user_a', 'Someone else');
  assert.equal(again.completed_by, 'Akkmal');
  assert.equal(new Date(again.completed_at).getTime(), new Date(done.completed_at).getTime());
  // The table's own constraints back this up.
  await assert.rejects(db.query(`update revenuecat_erasure_requests set status = 'completed' where app_user_id = 'user_requested'`), /violates check constraint/);
});

test('the rollback restores the previous deletion function and removes everything else, keeping owed erasures', async () => {
  const fresh = await freshDatabase(migrations.filter((file) => !file.startsWith('20261026')));
  try {
    const definition = async () => (await fresh.query(`select prosrc from pg_proc where proname = 'delete_bookflow_account_data'`)).rows[0].prosrc;
    const baseline = await definition();
    await fresh.exec(fs.readFileSync(path.join(releaseDir, '20261026000000_revenuecat_erasure_queue.sql'), 'utf8'));
    await fresh.query(`select public.request_revenuecat_erasure('user_a', 'production')`);
    assert.notEqual(await definition(), baseline);
    await fresh.exec(fs.readFileSync(path.join(bundle, 'rollback/20261026_rollback.sql'), 'utf8'));
    assert.equal(await definition(), baseline);
    const leftovers = (await fresh.query(`select proname from pg_proc where proname in ('refuse_writes_for_deleted_accounts', 'request_revenuecat_erasure', 'record_revenuecat_erasure_progress', 'revenuecat_erasure_queue', 'complete_revenuecat_erasure')`)).rows;
    assert.deepEqual(leftovers, []);
    assert.equal((await fresh.query(`select count(*) from pg_trigger where tgname like '%deleted_account_guard'`)).rows[0].count, 0);
    assert.equal((await fresh.query(`select count(*) from pg_namespace where nspname = 'bookflow_admin'`)).rows[0].count, 0);
    assert.equal(Number((await fresh.query('select count(*) from revenuecat_erasure_requests')).rows[0].count), 1, 'owed erasures are kept');
  } finally {
    await fresh.close();
  }
});
