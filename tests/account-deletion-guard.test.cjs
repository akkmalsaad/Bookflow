const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.BOOKFLOW_PGLITE_PATH || '@electric-sql/pglite');

/**
 * Account deletion: deleted accounts stay deleted (20261026000000_account_deletion_guard).
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
const record = (user, event, instance = 'production') => db.query('select public.record_account_deletion($1, $2, $3)', [user, instance, event]);
const count = async (table, user) => Number((await call(`select count(*) from ${table} where user_id = $1`, [user])).count);

async function seedAccount(user) {
  await asOwner();
  await db.query('insert into bookflow_workspaces(user_id, data) values ($1, $2)', [user, JSON.stringify({ bookings: [{ id: 'bk-1' }], invoices: [], customers: [] })]);
  await db.query(`insert into public_invoice_links(user_id, invoice_id, status, payload) values ($1, 'inv-1', 'Sent', '{}')`, [user]);
  await db.query(`insert into public_booking_offers(user_id, offer_id, kind, offer, status) values ($1, 'ofr-1', 'booking_form', '{}', 'sent')`, [user]);
  await db.query(`insert into support_requests(user_id, topic, message) values ($1, 'other', 'Please help with this')`, [user]);
}
async function reset() {
  await asOwner();
  await db.exec('delete from public_booking_offers; delete from public_invoice_links; delete from support_requests; delete from user_feedback; delete from bookflow_workspaces; delete from deleted_accounts;');
}

test('the release is production’s baseline plus this migration only, byte-for-byte as in the source', () => {
  assert.deepEqual(migrations.map((file) => file.slice(0, 14)), [...PRODUCTION_BASELINE, '20261026000000']);
  for (const file of migrations) {
    assert.ok(fs.readFileSync(path.join(releaseDir, file)).equals(fs.readFileSync(path.join(project, 'supabase/migrations', file))), file);
  }
  assert.ok(fs.readFileSync(path.join(bundle, 'release-workdir/supabase/config.toml')).equals(fs.readFileSync(path.join(project, 'supabase/config.toml'))));
  // No RevenueCat erasure machinery is part of this release.
  assert.equal(/revenuecat/i.test(fs.readFileSync(path.join(releaseDir, '20261026000000_account_deletion_guard.sql'), 'utf8').replace(/^--.*$/gm, '')), false);
});

test('deleting an account removes all its data — booking forms and submissions included — and nobody else’s', async () => {
  await reset();
  await seedAccount('user_a');
  await seedAccount('user_other');
  const result = (await call(`select public.delete_bookflow_account_data('user_a') as r`)).r;
  assert.deepEqual(result, { public_invoice_links: 1, public_booking_offers: 1, support_requests: 1, user_feedback: 0, bookflow_workspaces: 1 });
  for (const table of ['bookflow_workspaces', 'public_invoice_links', 'public_booking_offers', 'support_requests']) {
    assert.equal(await count(table, 'user_a'), 0, table);
    assert.equal(await count(table, 'user_other'), 1, `${table}: another account is untouched`);
  }
  // A retry is a no-op.
  assert.equal((await call(`select public.delete_bookflow_account_data('user_a') as r`)).r.bookflow_workspaces, 0);
});

test('once recorded as deleted, a stale token — or any role — can never write the account back', async () => {
  await reset();
  await seedAccount('user_a');
  await db.query(`select public.delete_bookflow_account_data('user_a')`);
  await record('user_a', 'data_deleted');
  // The deleted user's still-valid session token: every table refuses.
  await as('authenticated', 'user_a');
  await assert.rejects(db.query(`insert into bookflow_workspaces(user_id, data) values ('user_a', '{}')`), /account has been deleted/);
  await assert.rejects(db.query(`insert into support_requests(user_id, topic, message) values ('user_a', 'other', 'Please help with this')`), /account has been deleted|permission denied/);
  // And reads find nothing: the data is gone.
  assert.deepEqual((await db.query('select user_id from bookflow_workspaces')).rows, []);
  // The service role and the database owner are refused too.
  await asOwner();
  await assert.rejects(db.query(`insert into bookflow_workspaces(user_id, data) values ('user_a', '{}')`), /account has been deleted/);
  await assert.rejects(db.query(`insert into public_invoice_links(user_id, invoice_id, status, payload) values ('user_a', 'inv-9', 'Sent', '{}')`), /account has been deleted/);
  await assert.rejects(db.query(`insert into public_booking_offers(user_id, offer_id, kind, offer, status) values ('user_a', 'ofr-9', 'booking_form', '{}', 'sent')`), /account has been deleted/);
  await assert.rejects(db.query(`insert into support_requests(user_id, topic, message) values ('user_a', 'other', 'Please help with this')`), /account has been deleted/);
  await assert.rejects(db.query(`insert into user_feedback(user_id, category, message) values ('user_a', 'other', 'Great app, thanks')`), /account has been deleted/);
  // Another account is unaffected.
  await as('authenticated', 'user_b');
  await db.query(`insert into bookflow_workspaces(user_id, data) values ('user_b', '{}')`);
  await asOwner();
});

test('a deletion that has not reached its data yet does not lock the account', async () => {
  await reset();
  await seedAccount('user_a');
  // e.g. the storage step failed: nothing recorded, so the person can keep using the account or retry.
  await as('authenticated', 'user_a');
  await db.query(`update bookflow_workspaces set data = '{"bookings":[]}' where user_id = 'user_a'`);
  await asOwner();
});

test('the record holds only the id and dates, repeats are harmless, and it ages out after 30 days', async () => {
  await reset();
  await record('user_a', 'data_deleted');
  await record('user_a', 'data_deleted', 'development');
  await record('user_a', 'login_deleted');
  const row = await call(`select * from deleted_accounts where user_id = 'user_a'`);
  assert.equal(row.clerk_instance, 'production', 'a repeat changes nothing');
  assert.ok(row.login_deleted_at);
  const firstLogin = row.login_deleted_at.getTime();
  await record('user_a', 'login_deleted');
  assert.equal((await call(`select login_deleted_at from deleted_accounts where user_id = 'user_a'`)).login_deleted_at.getTime(), firstLogin);
  const columns = (await db.query(`select column_name from information_schema.columns where table_name = 'deleted_accounts' order by ordinal_position`)).rows.map((item) => item.column_name);
  assert.deepEqual(columns, ['user_id', 'clerk_instance', 'data_deleted_at', 'login_deleted_at']);

  // Older than 30 days since the login went: purged the next time any account is deleted.
  await db.query(`update deleted_accounts set login_deleted_at = now() - interval '31 days' where user_id = 'user_a'`);
  await record('user_b', 'data_deleted');
  assert.deepEqual((await db.query('select user_id from deleted_accounts order by user_id')).rows.map((item) => item.user_id), ['user_b']);
  // A record whose login is not yet gone is never purged.
  await db.query(`update deleted_accounts set data_deleted_at = now() - interval '90 days' where user_id = 'user_b'`);
  await record('user_c', 'data_deleted');
  assert.equal(Number((await call(`select count(*) from deleted_accounts where user_id = 'user_b'`)).count), 1);
  await assert.rejects(record('', 'data_deleted'), /user id is required/);
  await assert.rejects(record('user_d', 'erased'), /Unknown deletion event/);
});

test('no client role can read or write the deletion record or call its function', async () => {
  await reset();
  await record('user_a', 'data_deleted');
  for (const role of ['anon', 'authenticated']) {
    await as(role, 'user_a');
    await assert.rejects(db.query('select * from deleted_accounts'), /permission denied/, role);
    await assert.rejects(db.query(`delete from deleted_accounts`), /permission denied/, role);
    await assert.rejects(db.query(`insert into deleted_accounts(user_id, clerk_instance) values ('user_x', 'production')`), /permission denied/, role);
    await assert.rejects(db.query(`select public.record_account_deletion('user_x', 'production', 'data_deleted')`), /permission denied/, role);
  }
  // The Edge Function's role may call the function only — it cannot read the table.
  await as('service_role');
  await db.query(`select public.record_account_deletion('user_y', 'production', 'data_deleted')`);
  await assert.rejects(db.query('select * from deleted_accounts'), /permission denied/);
  await asOwner();
});

test('the rollback restores the previous deletion function and removes the guards', async () => {
  const fresh = await freshDatabase(migrations.filter((file) => !file.startsWith('20261026')));
  try {
    const definition = async () => (await fresh.query(`select prosrc from pg_proc where proname = 'delete_bookflow_account_data'`)).rows[0].prosrc;
    const baseline = await definition();
    await fresh.exec(fs.readFileSync(path.join(releaseDir, '20261026000000_account_deletion_guard.sql'), 'utf8'));
    await fresh.query(`select public.record_account_deletion('user_a', 'production', 'data_deleted')`);
    await fresh.exec(fs.readFileSync(path.join(bundle, 'rollback/20261026_rollback.sql'), 'utf8'));
    assert.equal(await definition(), baseline);
    assert.deepEqual((await fresh.query(`select proname from pg_proc where proname in ('refuse_writes_for_deleted_accounts', 'record_account_deletion')`)).rows, []);
    assert.equal(Number((await fresh.query(`select count(*) from pg_trigger where tgname like '%deleted_account_guard'`)).rows[0].count), 0);
    // With the guards gone the account could be written again — which is what rolling back means.
    await fresh.query(`insert into bookflow_workspaces(user_id, data) values ('user_a', '{}')`);
  } finally {
    await fresh.close();
  }
});
