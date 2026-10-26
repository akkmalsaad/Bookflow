const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.BOOKFLOW_PGLITE_PATH || '@electric-sql/pglite');

/**
 * Runs every migration, in order, against an isolated in-memory Postgres (PGlite) — never a hosted
 * database — and exercises the booking-offer RPCs and the owner write guard the way the Edge
 * Function and the app would.
 */
const project = path.resolve(__dirname, '..');
const migrations = fs.readdirSync(path.join(project, 'supabase/migrations')).filter((file) => file.endsWith('.sql')).sort();
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
  for (const file of migrations) await db.exec(fs.readFileSync(path.join(project, 'supabase/migrations', file), 'utf8'));
});
test.after(async () => db?.close());

const TOKEN = '6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b';
const OTHER = '7a2e3d4c-5b6a-4f70-9b8c-0d1e2f3a4b5c';
const KEY = (n = 1) => `idem-key-000000000${n}`.padEnd(20, 'x');
const snapshot = (over = {}) => ({
  v: 1, kind: 'booking_form', version: 1, currency: 'MYR', locale: 'en', timeZone: 'Asia/Kuala_Lumpur',
  business: { name: 'Studio', phone: '', email: '', logoUrl: null }, title: 'Wedding', packageName: 'Wedding',
  packageDetails: '', includedServices: [], lines: [], subtotalCents: 320000, chargesCents: 0, totalCents: 320000,
  deposit: null, date: '2026-11-20', startTime: '10:00', endTime: '14:00', bufferMinutes: 0, location: '',
  terms: 'Terms', termsVersion: 't1-abc', validUntil: null, requireEmail: false, customerName: '',
  allowConflicts: false, acceptedConflictIds: [], ...over,
});
const goodForm = { version: 1, name: 'Siti Nur', phone: '+60 12-345 6789', email: 'siti@example.my', location: 'KL', notes: '', acceptTerms: true, termsVersion: 't1-abc' };

async function reset({ workspace = {}, plan = 'pro', kind = 'booking_form', offer = {}, status = 'sent', expires = "now() + interval '7 days'", customerId = null } = {}) {
  await db.exec('reset role; delete from public_booking_offers; delete from bookflow_workspaces;');
  await db.query('insert into bookflow_workspaces(user_id, data) values ($1, $2)', ['owner-a', JSON.stringify({ bookings: [], invoices: [], customers: [], payments: [], ...workspace })]);
  await db.query('insert into bookflow_workspaces(user_id, data) values ($1, $2)', ['owner-b', JSON.stringify({ bookings: [{ id: 'secret-booking', date: '2026-11-20', startTime: '10:00', endTime: '14:00', status: 'Confirmed', notes: 'PRIVATE' }] })]);
  await db.query(`insert into public_booking_offers(token, user_id, offer_id, kind, offer, status, owner_plan, customer_id, expires_at) values ($1, 'owner-a', 'ofr-1', $2, $3, $4, $5, $6, ${expires})`,
    [TOKEN, kind, JSON.stringify(snapshot({ kind, ...offer })), status, plan, customerId]);
}
const respond = async (action, payload, key = KEY()) => (await db.query('select respond_to_booking_offer($1, $2, $3, $4) as r', [TOKEN, action, JSON.stringify(payload), key])).rows[0].r;
const read = async (token = TOKEN) => (await db.query('select read_booking_offer_state($1) as r', [token])).rows[0].r;
const row = async () => (await db.query('select * from public_booking_offers where token = $1', [TOKEN])).rows[0];

test('a valid submission is recorded once; a retry with the same key is idempotent', async () => {
  await reset();
  const first = await respond('submit', goodForm);
  assert.equal(first.ok, true);
  assert.equal(first.state.status, 'submitted');
  const stored = await row();
  assert.equal(stored.response.email, 'siti@example.my');
  assert.ok(stored.terms_accepted_at);
  assert.equal(stored.terms_version, 't1-abc');
  // A network retry with the same idempotency key succeeds without changing anything.
  const retry = await respond('submit', goodForm);
  assert.equal(retry.ok, true);
  // A second, different submission is refused: the form is closed.
  const second = await respond('submit', { ...goodForm, name: 'Someone Else' }, KEY(2));
  assert.deepEqual({ ...second }, { ok: false, error: 'closed' });
  assert.equal((await row()).response.name, 'Siti Nur');
});

test('server-side validation rejects bad input and unaccepted or stale terms', async () => {
  await reset({ offer: { requireEmail: true } });
  const cases = [
    [{ ...goodForm, name: 'S' }, 'invalid_name'],
    [{ ...goodForm, phone: 'call me' }, 'invalid_phone'],
    [{ ...goodForm, email: '' }, 'invalid_email'],
    [{ ...goodForm, email: 'nope' }, 'invalid_email'],
    [{ ...goodForm, location: '' }, 'invalid_location'],
    [{ ...goodForm, acceptTerms: false }, 'terms_required'],
    [{ ...goodForm, termsVersion: 't0-old' }, 'terms_required'],
    [{ ...goodForm, version: 2 }, 'offer_changed'],
  ];
  for (const [payload, error] of cases) {
    const result = await respond('submit', payload, KEY(3));
    assert.equal(result.error, error, JSON.stringify(payload));
  }
  assert.equal((await row()).status, 'sent');
  assert.equal((await respond('submit', goodForm, 'short')).error, 'invalid_request');
  assert.equal((await respond('pay', goodForm)).error, 'unsupported_action');
});

test('email is mandatory on every booking form, whatever the snapshot says', async () => {
  await reset({ offer: { requireEmail: false } });
  assert.equal((await respond('submit', { ...goodForm, email: '' })).error, 'invalid_email');
  assert.equal((await respond('submit', { ...goodForm, email: '   ' }, KEY(2))).error, 'invalid_email');
  assert.equal((await row()).status, 'sent');
});

test('only the five customer fields are stored; owner-configured values in the payload are ignored', async () => {
  await reset();
  assert.equal((await respond('submit', { ...goodForm, customerLocation: 'x'.repeat(301) })).error, 'invalid_customer_location');
  const result = await respond('submit', { ...goodForm, customerLocation: ' Klang ', notes: 'PRIVATE', price: 1, totalCents: 1, date: '2030-01-01', packageName: 'Free' }, KEY(2));
  assert.equal(result.ok, true);
  const stored = await row();
  assert.deepEqual(Object.keys(stored.response).sort(), ['customerLocation', 'email', 'location', 'name', 'phone']);
  assert.equal(stored.response.customerLocation, 'Klang');
  assert.equal(stored.offer.totalCents, 320000);
  assert.equal(stored.offer.date, '2026-11-20');
  // Without a customer location the key is simply absent.
  await reset();
  assert.equal((await respond('submit', goodForm)).ok, true);
  assert.equal((await row()).response.customerLocation, undefined);
});

test('invalid, expired and revoked links fail without exposing data', async () => {
  await reset({ expires: "now() - interval '1 second'" });
  assert.equal(await read(), null);
  await assert.rejects(respond('submit', goodForm), /not found or expired/);
  await reset({ status: 'revoked' });
  assert.equal(await read(), null);
  await assert.rejects(respond('submit', goodForm), /not found or expired/);
  await reset();
  assert.equal(await read(OTHER), null);
  await assert.rejects(db.query('select respond_to_booking_offer($1, $2, $3, $4)', [OTHER, 'submit', '{}', KEY()]), /not found or expired/);
});

test('availability is rechecked: clashing bookings, buffers and pending submissions block', async () => {
  await reset({ workspace: { bookings: [{ id: 'bk-1', date: '2026-11-20', startTime: '13:00', endTime: '15:00', status: 'Confirmed' }] } });
  assert.equal((await respond('submit', goodForm)).error, 'slot_unavailable');
  // A cancelled booking reserves nothing.
  await reset({ workspace: { bookings: [{ id: 'bk-1', date: '2026-11-20', startTime: '13:00', endTime: '15:00', status: 'Cancelled' }] } });
  assert.equal((await respond('submit', goodForm)).ok, true);
  // A buffer on the existing booking blocks a near miss.
  await reset({ workspace: { bookings: [{ id: 'bk-1', date: '2026-11-20', startTime: '14:30', endTime: '16:00', status: 'Confirmed', bufferMinutes: 45 }] } });
  assert.equal((await respond('submit', goodForm)).error, 'slot_unavailable');
  // A clash the owner saw and accepted while preparing does not block; a new one would.
  await reset({ workspace: { bookings: [{ id: 'bk-1', date: '2026-11-20', startTime: '13:00', endTime: '15:00', status: 'Confirmed' }] }, offer: { acceptedConflictIds: ['bk-1'], allowConflicts: true } });
  assert.equal((await respond('submit', goodForm)).ok, true);
  // Another customer's pending submission holds its slot until it becomes a booking.
  await reset();
  await db.query(`insert into public_booking_offers(token, user_id, offer_id, kind, offer, status, expires_at) values ($1, 'owner-a', 'ofr-2', 'booking_form', $2, 'sent', now() + interval '1 day')`, [OTHER, JSON.stringify(snapshot())]);
  await db.query(`update public_booking_offers set status = 'submitted' where token = $1`, [OTHER]);
  assert.equal((await respond('submit', goodForm)).error, 'slot_unavailable');
  // Other owners' bookings never matter.
  await reset();
  assert.equal((await respond('submit', goodForm)).ok, true);
});

test('Free plan limits are enforced server-side, counting pending submissions', async () => {
  const thisMonth = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 7);
  // The plan is the one booking-public verified with RevenueCat on this attempt, never the stored
  // owner_plan (written by the owner's app).
  const submitAs = async (plan, payload, key = KEY()) =>
    (await db.query('select respond_to_booking_offer($1, $2, $3, $4, $5) as r', [TOKEN, 'submit', JSON.stringify(payload), key, plan])).rows[0].r;
  const bookings = Array.from({ length: 5 }, (_, i) => ({ id: `bk-${i}`, createdAt: `${thisMonth}-01`, date: '2026-01-01', startTime: '08:00', endTime: '09:00', status: 'Confirmed' }));
  await reset({ plan: 'pro', workspace: { bookings } });
  assert.equal((await submitAs('free', goodForm)).error, 'plan_limit', 'a stored "pro" does not lift the limit');
  await reset({ plan: 'free', workspace: { bookings } });
  assert.equal((await submitAs('pro', goodForm)).ok, true);
  const invoices = Array.from({ length: 3 }, (_, i) => ({ id: `inv-${i}`, sentAt: `${thisMonth}-02` }));
  await reset({ plan: 'free', workspace: { invoices } });
  assert.equal((await submitAs('free', goodForm)).error, 'plan_limit');
  // Two pending submissions plus two invoices this month already reach three.
  await reset({ plan: 'free', workspace: { invoices: invoices.slice(0, 2) } });
  await db.query(`insert into public_booking_offers(token, user_id, offer_id, kind, offer, status, expires_at) values ($1, 'owner-a', 'ofr-2', 'booking_form', $2, 'sent', now() + interval '1 day')`, [OTHER, JSON.stringify(snapshot({ date: '2026-12-01' }))]);
  await db.query(`update public_booking_offers set status = 'submitted', submitted_at = now() where token = $1`, [OTHER]);
  assert.equal((await submitAs('free', goodForm)).error, 'plan_limit');
  // Five customers: a new email is refused, a known email is reused and allowed.
  const customers = Array.from({ length: 5 }, (_, i) => ({ id: `c-${i}`, email: i === 0 ? 'SITI@example.my' : `c${i}@x.my` }));
  await reset({ plan: 'free', workspace: { customers } });
  assert.equal((await submitAs('free', { ...goodForm, email: 'new@x.my' })).error, 'plan_limit');
  assert.equal((await submitAs('free', goodForm, KEY(4))).ok, true);
});

test('concurrent submissions for one slot: exactly one wins', async () => {
  await reset();
  await db.query(`insert into public_booking_offers(token, user_id, offer_id, kind, offer, status, expires_at) values ($1, 'owner-a', 'ofr-2', 'booking_form', $2, 'sent', now() + interval '1 day')`, [OTHER, JSON.stringify(snapshot())]);
  const [a, b] = await Promise.all([
    db.query('select respond_to_booking_offer($1, $2, $3, $4) as r', [TOKEN, 'submit', JSON.stringify(goodForm), KEY(5)]),
    db.query('select respond_to_booking_offer($1, $2, $3, $4) as r', [OTHER, 'submit', JSON.stringify(goodForm), KEY(6)]),
  ]);
  const results = [a.rows[0].r, b.rows[0].r];
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => r.error === 'slot_unavailable').length, 1);
});

test('quotations: accept records terms and version, decline closes, expiry is enforced', async () => {
  await reset({ kind: 'quotation' });
  assert.equal((await respond('submit', goodForm)).error, 'unsupported_action');
  const accepted = await respond('accept', { version: 1, acceptTerms: true, termsVersion: 't1-abc', name: 'Siti' });
  assert.equal(accepted.ok, true);
  const stored = await row();
  assert.equal(stored.status, 'accepted');
  assert.equal(stored.responded_version, 1);
  assert.equal(stored.response.phone, undefined);
  assert.equal((await respond('decline', { version: 1 }, KEY(7))).error, 'closed');
  await reset({ kind: 'quotation' });
  assert.equal((await respond('decline', { version: 1 })).ok, true);
  assert.equal((await row()).status, 'declined');
  await reset({ kind: 'quotation', offer: { validUntil: '2020-01-01' } });
  assert.equal((await respond('accept', { version: 1, acceptTerms: true, termsVersion: 't1-abc' })).error, 'offer_expired');
});

test('change requests keep agreed details and are limited', async () => {
  await reset();
  assert.equal((await respond('request_change', { version: 1, message: 'hi' })).error, 'invalid_change');
  for (let i = 0; i < 3; i += 1) assert.equal((await respond('request_change', { version: 1, message: 'Can we start at 11?' }, KEY(10 + i))).ok, true);
  assert.equal((await respond('request_change', { version: 1, message: 'And another?' }, KEY(20))).error, 'rate_limited');
  const stored = await row();
  assert.equal(stored.status, 'change_requested');
  assert.equal(stored.offer.startTime, '10:00');
  // The form can still be submitted after a change request.
  assert.equal((await respond('submit', goodForm, KEY(21))).ok, true);
});

test('repeated failed attempts are rate limited', async () => {
  await reset();
  for (let i = 0; i < 30; i += 1) await respond('submit', { ...goodForm, name: 'x' }, KEY(30 + i));
  assert.equal((await respond('submit', goodForm, KEY(99))).error, 'rate_limited');
});

test('anon and authenticated roles cannot call the RPCs; owners only see and change their own rows', async () => {
  await reset();
  await db.exec('set role anon');
  await assert.rejects(read(), /permission denied/);
  await assert.rejects(db.query('select * from public_booking_offers'), /permission denied/);
  await db.exec('reset role; set role authenticated');
  await db.exec(`set request.jwt.claims = '{"sub":"owner-b"}'`);
  await assert.rejects(read(), /permission denied/);
  assert.equal((await db.query('select * from public_booking_offers')).rows.length, 0);
  await db.exec(`update public_booking_offers set status = 'revoked'`);
  await db.exec(`set request.jwt.claims = '{"sub":"owner-a"}'`);
  assert.equal((await db.query('select status from public_booking_offers')).rows[0].status, 'sent');
  await db.exec('reset role');
});

test('the owner cannot forge a response or change details the customer agreed to', async () => {
  await reset();
  await db.exec(`set role authenticated; set request.jwt.claims = '{"sub":"owner-a"}'`);
  await assert.rejects(db.query(`update public_booking_offers set response = '{"name":"x"}'`), /not writable/);
  await assert.rejects(db.query(`update public_booking_offers set terms_accepted_at = now()`), /not writable/);
  await assert.rejects(db.query(`update public_booking_offers set status = 'submitted'`), /Unsupported status/);
  await assert.rejects(db.query(`update public_booking_offers set expires_at = now() + interval '200 days'`), /at most 120 days/);
  await assert.rejects(db.query(`insert into public_booking_offers(offer_id, kind, offer, status, response) values ('x', 'booking_form', '{}', 'sent', '{}')`), /not writable/);
  // Re-sharing a revised version before the customer responds is allowed.
  await db.query(`update public_booking_offers set version = 2, offer = jsonb_set(offer, '{version}', '2')`);
  await db.exec('reset role');
  await db.query(`update public_booking_offers set version = 1, offer = jsonb_set(offer, '{version}', '1')`);
  assert.equal((await respond('submit', goodForm)).ok, true);
  await db.exec(`set role authenticated; set request.jwt.claims = '{"sub":"owner-a"}'`);
  await assert.rejects(db.query(`update public_booking_offers set offer = jsonb_set(offer, '{totalCents}', '1')`), /cannot be changed/);
  await assert.rejects(db.query(`update public_booking_offers set status = 'sent'`), /Unsupported status/);
  // Marking it converted with the records it became is the one allowed move.
  await db.query(`update public_booking_offers set status = 'converted', booking_id = 'bk-ofr-ofr-1', invoice_id = 'inv-ofr-ofr-1'`);
  await db.exec('reset role');
  assert.equal((await row()).status, 'converted');
});

test('the read state carries only the linked booking, invoice and payments', async () => {
  await reset({ workspace: {
    bookings: [{ id: 'bk-ofr-ofr-1', status: 'Inquiry', notes: 'internal', fulfilment: { status: 'in_progress', internalNotes: 'PRIVATE' } }, { id: 'bk-other', notes: 'OTHER' }],
    invoices: [{ id: 'inv-ofr-ofr-1', amount: 3200 }, { id: 'inv-other', amount: 1 }],
    payments: [{ invoiceId: 'inv-ofr-ofr-1', amount: 100 }, { invoiceId: 'inv-other', amount: 5 }],
  } });
  await db.exec(`update public_booking_offers set status = 'converted', booking_id = 'bk-ofr-ofr-1', invoice_id = 'inv-ofr-ofr-1'`);
  const state = await read();
  assert.equal(state.booking.id, 'bk-ofr-ofr-1');
  assert.equal(state.invoice.id, 'inv-ofr-ofr-1');
  assert.equal(state.payments.length, 1);
  assert.ok(!JSON.stringify(state).includes('OTHER'));
  assert.ok(!JSON.stringify(state).includes('secret-booking'));
});

test('account deletion removes booking offer links through the workspace cascade, for that owner only', async () => {
  await reset();
  await db.query(`insert into public_booking_offers(token, user_id, offer_id, kind, offer, status, expires_at) values ($1, 'owner-b', 'ofr-b', 'booking_form', $2, 'sent', now() + interval '1 day')`, [OTHER, JSON.stringify(snapshot())]);
  const result = (await db.query(`select delete_bookflow_account_data('owner-a') as r`)).rows[0].r;
  assert.equal(result.bookflow_workspaces, 1);
  assert.equal((await db.query(`select count(*)::int as n from public_booking_offers where user_id = 'owner-a'`)).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int as n from public_booking_offers where user_id = 'owner-b'`)).rows[0].n, 1);
});

test('account deletion is isolated: deleting one owner leaves every other owner untouched', async () => {
  await reset();
  await db.query(`insert into public_invoice_links(token, user_id, invoice_id, payload) values ($1, 'owner-b', 'inv-b', '{}')`, [OTHER]);
  await db.query(`insert into public_invoice_links(user_id, invoice_id, payload) values ('owner-a', 'inv-a', '{}')`);
  const before = (await db.query(`select (select count(*) from bookflow_workspaces where user_id = 'owner-b')::int as w, (select count(*) from public_invoice_links where user_id = 'owner-b')::int as l`)).rows[0];
  const result = (await db.query(`select delete_bookflow_account_data('owner-a') as r`)).rows[0].r;
  assert.equal(result.bookflow_workspaces, 1);
  assert.equal(result.public_invoice_links, 1);
  const after = (await db.query(`select (select count(*) from bookflow_workspaces where user_id = 'owner-b')::int as w, (select count(*) from public_invoice_links where user_id = 'owner-b')::int as l`)).rows[0];
  assert.deepEqual(after, before);
  assert.equal((await db.query(`select count(*)::int as n from bookflow_workspaces where user_id = 'owner-a'`)).rows[0].n, 0);
  // Safe to retry: a second run finds nothing and still succeeds.
  const again = (await db.query(`select delete_bookflow_account_data('owner-a') as r`)).rows[0].r;
  assert.equal(again.bookflow_workspaces, 0);
  // Only the service role may run it.
  await db.exec(`set role authenticated; set request.jwt.claims = '{"sub":"owner-b"}'`);
  await assert.rejects(db.query(`select delete_bookflow_account_data('owner-b')`), /permission denied/);
  await db.exec('reset role');
});

test('a booking removed with its deleted invoice holds no slot for a public submission', async () => {
  // Deleting an invoice moves its booking out of `bookings` and onto the invoice.
  const removed = { id: 'bk-removed', date: '2026-11-20', startTime: '10:00', endTime: '14:00', status: 'Confirmed' };
  await reset({ workspace: { bookings: [], invoices: [{ id: 'inv-1', bookingId: 'bk-removed', deletedAt: '2026-10-16T00:00:00Z', removedBooking: removed }] } });
  assert.equal((await respond('submit', goodForm)).ok, true);
});
