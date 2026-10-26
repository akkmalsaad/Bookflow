const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.BOOKFLOW_PGLITE_PATH || '@electric-sql/pglite');
const { loadTs, plain } = require('./helpers/load-ts.cjs');

/**
 * Regression: deleting an invoice left its booking card on the Bookings screen (shown as "Unknown
 * customer" once that client had been deleted). Only a plain Delete takes the booking, and it was
 * offered only to drafts, closed invoices and unpaid accepted ones — every other status could only be
 * cancelled or voided, which keep the booking by design.
 */
const lifecycle = loadTs('lib/invoice-lifecycle.ts');
const link = loadTs('lib/invoice-booking-link.ts');
const project = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(project, file), 'utf8');

const NOW = '2026-10-25T08:00:00.000Z';
const STATUSES = ['Draft', 'Sent', 'Accepted', 'Declined', 'Paid', 'Partially Paid', 'Overdue', 'Cancelled', 'Void'];
const booking = (id, over = {}) => ({ id, customerId: 'cust-1', title: 'Wedding', date: '2026-11-20', startTime: '10:00', endTime: '14:00', location: 'KL', packageName: 'Wedding', price: 3200, status: 'Confirmed', notes: '', ...over });
const invoice = (id, bookingId, over = {}) => ({ id, bookingId, customerId: 'cust-1', invoiceNumber: `INV-${id}`, amount: 3200, dueDate: '2026-11-19', sentAt: '2026-10-01', status: 'Sent', ...over });
const paymentsFor = (status, invoiceId) =>
  status === 'Paid' ? [{ id: 'p-full', invoiceId, amount: 3200, date: '2026-10-05', kind: 'payment' }]
    : status === 'Partially Paid' ? [{ id: 'p-dep', invoiceId, amount: 800, date: '2026-10-05', kind: 'deposit' }]
      : [];

/** The Delete the invoice screen offers: the default removal when it is a Delete, otherwise the extra one. */
function deleteActionFor(inv, payments) {
  const fallback = lifecycle.getInvoiceRemovalAction(inv, payments);
  return fallback.mode === 'delete' ? fallback : lifecycle.getInvoiceDeleteAction(inv, payments);
}

/** What trashInvoice does on a Delete, in one step: the invoice is trashed and holds the booking it removed. */
function trash(state, invoiceId) {
  const inv = state.invoices.find((item) => item.id === invoiceId);
  const linked = link.removeLinkedBooking(inv, state.invoices, state.bookings);
  return {
    ...state,
    linked,
    bookings: linked.bookings,
    invoices: state.invoices.map((item) => (item.id === invoiceId
      ? { ...item, deletedAt: NOW, statusBeforeTrash: null, ...(linked.removedBooking ? { removedBooking: linked.removedBooking } : {}) }
      : item)),
  };
}

/** What restoreInvoice does, reading the given invoice list (the live one, after the fix). */
function restore(state, invoiceId, invoices = state.invoices) {
  const inv = invoices.find((item) => item.id === invoiceId);
  if (!inv.deletedAt) return state; // what the stale closure saw: "already active", nothing to do
  const linked = link.restoreLinkedBooking(inv, invoices, state.bookings);
  const clear = new Set(linked.clearOn);
  return {
    ...state,
    bookings: linked.bookings,
    invoices: invoices.map((item) => (item.id === invoiceId
      ? { ...item, deletedAt: null, ...(clear.has(item.id) ? { removedBooking: null } : {}) }
      : clear.has(item.id) ? { ...item, removedBooking: null } : item)),
  };
}

function workspace(status) {
  return {
    customers: [{ id: 'cust-1', name: 'Siti' }, { id: 'cust-2', name: 'Aminah' }],
    bookings: [booking('bk-1'), booking('bk-other', { customerId: 'cust-2' }), booking('bk-standalone', { customerId: 'cust-gone' })],
    invoices: [invoice('inv-1', 'bk-1', { status }), invoice('inv-other', 'bk-other', { customerId: 'cust-2', status: 'Paid' })],
    payments: paymentsFor(status, 'inv-1'),
  };
}

test('every invoice status can be plainly deleted, and Delete appears exactly once', () => {
  for (const status of STATUSES) {
    for (const payments of [[], paymentsFor(status, 'inv-1')]) {
      const inv = invoice('inv-1', 'bk-1', { status });
      const action = deleteActionFor(inv, payments);
      assert.equal(action?.mode, 'delete', `${status} with ${payments.length} payment(s)`);
      const offered = [lifecycle.getInvoiceRemovalAction(inv, payments), lifecycle.getInvoiceDeleteAction(inv, payments)]
        .filter((item) => item?.mode === 'delete');
      assert.equal(offered.length, 1, `${status}: one Delete row in the menu`);
    }
  }
  // Already in the Dustbin: nothing more to delete from the invoice screen.
  assert.equal(lifecycle.getInvoiceDeleteAction(invoice('inv-1', 'bk-1', { status: 'Paid', deletedAt: NOW }), []), null);
  // The existing confirmation rules are unchanged: an accepted invoice still asks for a reason.
  assert.equal(lifecycle.removalRequiresReason({ status: 'Accepted' }, 'delete'), true);
  assert.equal(lifecycle.removalRequiresReason({ status: 'Paid' }, 'delete'), false);
  // Cancel and Void are still offered as before, and still keep the booking.
  assert.equal(lifecycle.getInvoiceRemovalAction(invoice('i', 'b', { status: 'Sent' }), []).mode, 'cancel');
  assert.equal(lifecycle.getInvoiceRemovalAction(invoice('i', 'b', { status: 'Paid' }), []).mode, 'void');
});

test('deleting an invoice of any status removes its booking by bookingId and nothing else', () => {
  for (const status of STATUSES) {
    const before = workspace(status);
    const after = trash(before, 'inv-1');
    assert.equal(after.linked.impact.kind, 'remove', status);
    // The Bookings screen renders `bookings` straight from context: the card is gone in this same step.
    assert.deepEqual(plain(after.bookings.map((item) => item.id)), ['bk-other', 'bk-standalone'], status);
    assert.equal(after.invoices[0].removedBooking.id, 'bk-1');
    // Unrelated invoice, bookings, customers and payments are the very same records.
    assert.equal(after.invoices[1], before.invoices[1]);
    assert.equal(after.bookings[0], before.bookings[1]);
    assert.equal(after.bookings[1], before.bookings[2]);
    assert.equal(after.customers, before.customers);
    assert.equal(after.payments, before.payments);
  }
});

test('the "Unknown customer" card goes with its invoice; a standalone booking without a customer stays', () => {
  // The client was deleted earlier, so bk-1 rendered as "Unknown customer". It is matched by id only.
  const before = { ...workspace('Paid'), customers: [{ id: 'cust-2', name: 'Aminah' }] };
  const after = trash(before, 'inv-1');
  assert.deepEqual(plain(after.bookings.map((item) => item.id)), ['bk-other', 'bk-standalone']);
  // bk-standalone has no invoice and no resolvable customer: no invoice deletion may touch it.
  const again = trash(after, 'inv-other');
  assert.deepEqual(plain(again.bookings.map((item) => item.id)), ['bk-standalone']);
});

test('trashInvoice removes the booking synchronously, before any network await', () => {
  const context = read('context/app-data-context.tsx');
  const body = context.slice(context.indexOf('const trashInvoice = useCallback('), context.indexOf('const restoreInvoice = useCallback('));
  const firstAwait = body.indexOf('await ');
  assert.ok(firstAwait > 0);
  for (const step of ['invoicesRef.current = trash(invoicesRef.current)', 'setInvoices(trash)', 'bookingsRef.current = linked.bookings', 'setBookings(linked.bookings)']) {
    const at = body.indexOf(step);
    assert.ok(at > 0 && at < firstAwait, step);
  }
  // No status gate on a Delete in the context either — only the existing reason rule.
  assert.equal(/status\s*===\s*'(Paid|Accepted|Partially Paid|Sent)'/.test(body), false);
});

test('a failed save rolls the delete back: invoice active again, booking restored exactly', () => {
  const before = workspace('Accepted');
  const afterDelete = trash(before, 'inv-1');
  // The screen's restoreInvoice closure was created before the delete. Reading that render's list
  // (the old behaviour) sees the invoice as active and restores nothing.
  const stale = restore(afterDelete, 'inv-1', before.invoices);
  assert.deepEqual(plain(stale.bookings.map((item) => item.id)), ['bk-other', 'bk-standalone']);
  // Reading the live list (the fix) puts back the very booking the delete removed.
  const rolledBack = restore(afterDelete, 'inv-1');
  assert.deepEqual(plain(rolledBack.bookings.map((item) => item.id).sort()), ['bk-1', 'bk-other', 'bk-standalone']);
  assert.deepEqual(plain(rolledBack.bookings.find((item) => item.id === 'bk-1')), plain(before.bookings[0]));
  assert.equal(rolledBack.invoices[0].deletedAt, null);
  assert.equal(rolledBack.invoices[0].removedBooking, null);
  assert.equal(rolledBack.invoices[1], before.invoices[1]);

  const context = read('context/app-data-context.tsx');
  const body = context.slice(context.indexOf('const restoreInvoice = useCallback('), context.indexOf('const deleteInvoicePermanently = useCallback('));
  assert.match(body, /const currentInvoices = invoicesRef\.current;/);
  assert.match(body, /restoreLinkedBooking\(invoice, currentInvoices, bookingsRef\.current\)/);
  assert.equal(/allInvoices/.test(body), false, 'restoreInvoice must not read a render-time invoice list');

  // The screen only reports success once the save is confirmed, and rolls back otherwise.
  const screen = read('app/invoice/[invoiceId].tsx');
  assert.match(screen, /await confirmWorkspaceSave\(\);\s*\} catch \(failure\) \{\s*await restoreInvoice\(invoiceId\);/);
});

// --- Persistence: the workspace is one document, so the invoice and its booking change in one write.

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

async function seed(data) {
  await db.exec('reset role; delete from bookflow_workspaces;');
  await db.query('insert into bookflow_workspaces(user_id, data) values ($1, $2)', ['owner-a', JSON.stringify(data)]);
}
/** Saves the whole workspace the way the app does: one upsert of the full document, as the owner. */
async function save(data) {
  await db.exec(`reset role; set role authenticated; set request.jwt.claims = '{"sub":"owner-a"}'`);
  return db.query(`insert into bookflow_workspaces(user_id, data) values ('owner-a', $1)
    on conflict (user_id) do update set data = excluded.data, updated_at = now()`, [JSON.stringify(data)]);
}
async function reload() {
  await db.exec('reset role');
  const data = (await db.query(`select data from bookflow_workspaces where user_id = 'owner-a'`)).rows[0].data;
  // The load path's linked-booking repair runs on every open; it must not bring a deleted booking back.
  const reconciled = link.reconcileLinkedBookings(data.invoices, data.bookings);
  return { ...data, invoices: reconciled.invoices, bookings: reconciled.bookings };
}

test('a deleted invoice’s booking stays gone after reload, for every status the server sees', async () => {
  for (const status of STATUSES) {
    const before = workspace(status);
    await seed(before);
    const { linked, ...after } = trash(before, 'inv-1');
    await save(after);
    const loaded = await reload();
    assert.deepEqual(loaded.bookings.map((item) => item.id), ['bk-other', 'bk-standalone'], status);
    assert.equal(loaded.invoices[0].deletedAt, NOW);
    assert.equal(loaded.invoices[0].removedBooking.id, 'bk-1');
    assert.deepEqual(loaded.invoices[1], before.invoices[1]);
    assert.deepEqual(loaded.customers, before.customers);
    assert.deepEqual(loaded.payments, before.payments, 'payments stay on the invoice in the Dustbin');
  }
});

test('a save the server refuses changes neither the invoice nor its booking', async () => {
  const before = workspace('Paid');
  await seed(before);
  const { linked, ...after } = trash(before, 'inv-1');
  // Any refused write (here, a renumbered invoice) is all-or-nothing for the document.
  const refused = { ...after, invoices: after.invoices.map((item) => (item.id === 'inv-1' ? { ...item, invoiceNumber: 'INV-forged' } : item)) };
  await assert.rejects(save(refused), /invoice number cannot be changed/);
  const loaded = await reload();
  assert.deepEqual(loaded.bookings, before.bookings);
  assert.deepEqual(loaded.invoices, before.invoices);
});
