const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.BOOKFLOW_PGLITE_PATH || '@electric-sql/pglite');
const { loadTs, plain } = require('./helpers/load-ts.cjs');

const { applyInvoiceEdit, getInvoiceEditSource, syncLinkedBookingSchedule } = loadTs('lib/invoice-edit.ts');
const { canEditInvoice } = loadTs('lib/invoice-lifecycle.ts');

const invoice = (over = {}) => ({
  id: 'inv-1',
  invoiceNumber: 'INV-2026-0007',
  bookingId: 'bk-1',
  customerId: 'cust-1',
  customerSnapshot: { name: 'Siti', email: 'siti@example.my', phone: '' },
  amount: 1200,
  dueDate: '2026-11-01',
  status: 'Sent',
  sentAt: '2026-10-20',
  serviceName: 'Wedding',
  packageDetails: 'Full day',
  eventLocation: 'KL',
  eventDate: '2026-11-20',
  eventTime: '10:00',
  eventStartTime: '10:00',
  eventEndTime: '14:00',
  terms: 'Original terms',
  snapshot: { businessName: 'Studio', paymentTermDays: 7 },
  ...over,
});

/** What the form returns when every field is left as it was prefilled. */
const unchangedInput = (source) => ({
  customerId: source.customerId,
  serviceName: source.packageName,
  packageDetails: 'Full day',
  price: source.price,
  basePrice: source.basePrice,
  charges: source.charges,
  depositAmount: source.depositAmount,
  depositDueDate: source.depositDueDate,
  dueDate: '2026-11-01',
  terms: source.terms,
  location: source.location,
  date: source.date,
  startTime: source.startTime,
  endTime: source.endTime,
});

const edit = (over = {}) => ({ ...unchangedInput(plain(getInvoiceEditSource(invoice()))), ...over });

test('an unaccepted and an accepted invoice are both editable; closed or trashed ones are not', () => {
  for (const status of ['Draft', 'Sent', 'Overdue', 'Accepted', 'Partially Paid', 'Paid']) {
    assert.equal(canEditInvoice(invoice({ status })), true, status);
  }
  for (const status of ['Cancelled', 'Declined', 'Void']) assert.equal(canEditInvoice(invoice({ status })), false, status);
  assert.equal(canEditInvoice(invoice({ deletedAt: '2026-10-20T00:00:00Z' })), false);
  const refused = applyInvoiceEdit(invoice({ status: 'Void' }), edit(), []);
  assert.deepEqual(plain(refused), { ok: false, error: 'invoice.edit.error.closed' });
});

test('saving keeps the same record: id, number, status, acceptance, snapshot and booking link', () => {
  for (const status of ['Sent', 'Accepted']) {
    const original = invoice({ status, sourceOfferId: 'offer-1' });
    const result = applyInvoiceEdit(original, edit({ price: 1500, terms: 'New terms', location: 'Penang', dueDate: '2026-12-01' }), []);
    assert.equal(result.ok, true);
    const saved = plain(result.invoice);
    assert.equal(saved.id, 'inv-1');
    assert.equal(saved.invoiceNumber, 'INV-2026-0007');
    assert.equal(saved.status, status, 'editing never resets acceptance');
    assert.equal(saved.bookingId, 'bk-1');
    assert.equal(saved.sentAt, '2026-10-20');
    assert.equal(saved.sourceOfferId, 'offer-1');
    assert.deepEqual(saved.snapshot, original.snapshot);
    assert.equal(saved.amount, 1500);
    assert.equal(saved.terms, 'New terms');
    assert.equal(saved.eventLocation, 'Penang');
    assert.equal(saved.dueDate, '2026-12-01');
  }
});

test('an untouched form saves the invoice back unchanged', () => {
  const lineItems = [
    { kind: 'package', description: 'Wedding', detail: 'Full day', quantity: 1, unitPrice: 1000, amount: 1000 },
    { kind: 'charge', description: 'Transport', quantity: 2, unit: 'trip', unitPrice: 100, amount: 200 },
  ];
  const original = invoice({ lineItems, depositDue: 300, depositDueDate: '2026-11-05' });
  const source = plain(getInvoiceEditSource(original));
  assert.equal(source.basePrice, 1000);
  assert.equal(source.charges.length, 1);
  assert.equal(source.depositAmount, 300);
  const result = applyInvoiceEdit(original, unchangedInput(source), []);
  assert.equal(result.ok, true);
  assert.deepEqual(plain(result.invoice), plain(original));
});

test('an untouched save through the real form keeps legacy and hidden values exactly', () => {
  // What AddBookingModal + the details screen send when nothing is changed: the location and terms
  // trimmed (an empty location stays empty), a custom-amount invoice keeps its own (absent) service.
  const legacy = invoice({
    serviceName: undefined,
    packageDetails: undefined,
    eventLocation: undefined,
    terms: '  Deposit is non-refundable.\n',
    dueDate: '01/11/2026',
    depositPaid: 0,
    statusBeforeTrash: null,
    removedBooking: null,
    customerSnapshot: { name: 'Siti (old)', email: 'old@example.my', phone: '012' },
  });
  const source = plain(getInvoiceEditSource(legacy));
  const sent = {
    customerId: source.customerId,
    serviceName: legacy.serviceName ?? '',
    packageDetails: legacy.packageDetails,
    price: source.price,
    dueDate: legacy.dueDate,
    terms: source.terms.trim() || undefined,
    location: source.location.trim() || '',
    date: source.date,
    startTime: source.startTime,
    endTime: source.endTime,
  };
  const result = applyInvoiceEdit(legacy, sent, []);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(plain(result.invoice), plain(legacy));
});

test('totals are recalculated with the booking pricing rules', () => {
  const charges = [
    { id: 'c1', description: 'Transport', quantity: 2, unitPrice: 50.25, amount: 100.5 },
    { id: 'c2', description: 'Extra hour', quantity: 1.5, unit: 'hour', unitPrice: 80, amount: 120 },
  ];
  const result = applyInvoiceEdit(invoice(), edit({ price: 1000, basePrice: 1000, charges, depositAmount: 200 }), []);
  assert.equal(result.ok, true);
  const saved = plain(result.invoice);
  assert.equal(saved.amount, 1220.5, 'package + 100.50 + 120.00');
  assert.deepEqual(saved.lineItems.map((line) => [line.kind, line.amount]), [['package', 1000], ['charge', 100.5], ['charge', 120]]);
  assert.equal(saved.depositDue, 200);

  // Removing every charge and the deposit really removes them.
  const cleared = plain(applyInvoiceEdit(result.invoice, edit({ price: 900, basePrice: undefined, charges: [], depositAmount: undefined }), []).invoice);
  assert.equal(cleared.amount, 900);
  assert.equal('lineItems' in cleared, false);
  assert.equal('depositDue' in cleared, false);
});

test('payments are respected: never edited below what was received, money statuses follow the total', () => {
  const payments = [{ id: 'p1', invoiceId: 'inv-1', amount: 1200, kind: 'payment', method: 'Cash', date: '2026-10-21', recordedAt: '' }];
  const paid = invoice({ status: 'Paid', depositPaid: 1200 });
  assert.deepEqual(plain(applyInvoiceEdit(paid, edit({ price: 1000 }), payments)), { ok: false, error: 'invoice.edit.error.belowPaid' });
  const raised = plain(applyInvoiceEdit(paid, edit({ price: 1500 }), payments).invoice);
  assert.equal(raised.status, 'Partially Paid');
  assert.equal(raised.depositPaid, 1200, 'the cached paid total is untouched');
  // An accepted invoice with no money against it keeps Accepted whatever its total becomes.
  assert.equal(plain(applyInvoiceEdit(invoice({ status: 'Accepted' }), edit({ price: 50 }), []).invoice).status, 'Accepted');
});

test('invalid edits are refused before anything is built', () => {
  const cases = [
    [{ price: 0 }, 'bookings.error.fields'],
    [{ price: Number.NaN }, 'bookings.error.fields'],
    [{ customerId: '' }, 'bookings.error.fields'],
    [{ endTime: '09:00' }, 'bookings.error.fields'],
    [{ date: 'tomorrow' }, 'bookings.error.fields'],
    [{ dueDate: '1/11/2026' }, 'invoice.edit.error.dueDate'],
    [{ charges: [{ id: 'x', description: '', quantity: 1, unitPrice: 5, amount: 5 }] }, 'bm.error.charges'],
  ];
  for (const [over, error] of cases) assert.deepEqual(plain(applyInvoiceEdit(invoice(), edit(over), [])), { ok: false, error }, JSON.stringify(over));
});

test('the PDF and the customer page show the edited values, and the page stays accepted', () => {
  // The context is a React module; only its currency formatter is used here, copied verbatim.
  const getCurrencyFormatter = (code) => new Intl.NumberFormat({ MYR: 'ms-MY', IDR: 'id-ID', USD: 'en-US' }[code] ?? 'en-US', { style: 'currency', currency: code });
  const { buildInvoiceRenderData, renderInvoiceHtml, DEFAULT_INVOICE_DESIGN } = loadTs('lib/invoice-design/index.ts', {}, { '@/context/app-data-context': { getCurrencyFormatter } });
  const ts = require('typescript');
  const edge = {};
  require('node:vm').runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/invoice-public/payload.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: edge, Intl, Date });

  const payments = [{ id: 'p1', invoiceId: 'inv-1', amount: 300, kind: 'deposit', method: 'Cash', date: '2026-10-21', recordedAt: '' }];
  const charges = [{ id: 'c1', description: 'Drone footage', quantity: 1, unitPrice: 250, amount: 250 }];
  const edited = plain(applyInvoiceEdit(invoice({ status: 'Accepted' }), edit({ price: 1500, basePrice: 1500, charges, terms: 'Revised terms', location: 'Penang' }), payments).invoice);
  const render = buildInvoiceRenderData({
    invoice: edited,
    client: { name: 'Siti', email: 'siti@example.my', phone: '', address: '', source: 'customer' },
    payments, currency: 'MYR', design: DEFAULT_INVOICE_DESIGN,
    business: { name: 'Studio', registrationNumber: '', phone: '', email: '', website: '', address: '', logoUrl: null },
    paymentDetails: {}, paymentInstructions: '', serviceName: edited.serviceName, packageDetails: edited.packageDetails,
    eventLocation: edited.eventLocation, eventDate: edited.eventDate, eventStartTime: edited.eventStartTime, eventEndTime: edited.eventEndTime,
  });

  // The PDF: built by the same function saveInvoiceAsPdf uses.
  const html = renderInvoiceHtml(render);
  for (const text of ['Drone footage', 'Revised terms', 'Penang', 'INV-2026-0007']) assert.ok(html.includes(text), text);
  assert.ok(html.includes('1,750.00'), 'new total');
  assert.ok(html.includes('1,450.00'), 'balance after the 300 deposit');
  assert.equal(html.includes('Original terms'), false);

  // The customer page: the Edge Function's projection of the refreshed payload and live invoice.
  const page = edge.publicInvoiceResponse({
    status: 'Accepted',
    payload: { render, currency: 'MYR', invoice: { invoiceNumber: 'INV-2026-0007', terms: edited.terms, status: 'Accepted' } },
    invoice: { ...edited, status: 'Partially Paid' },
    payments,
  }, '2026-10-21');
  assert.equal(page.payload.invoice.amount, 1750);
  assert.equal(page.payload.invoice.terms, 'Revised terms');
  assert.deepEqual(plain(page.payload.render.items.map((item) => item.description)), ['Wedding', 'Drone footage']);
  assert.match(page.payload.render.totals.total, /1,750\.00/);
  assert.match(page.payload.render.totals.balance, /1,450\.00/);

  // With no money received, an edited accepted invoice still reads as Accepted to the customer.
  const unpaid = plain(applyInvoiceEdit(invoice({ status: 'Accepted' }), edit({ price: 999 }), []).invoice);
  assert.equal(edge.publicInvoiceResponse({ status: 'Accepted', payload: { invoice: {} }, invoice: unpaid, payments: [] }).status, 'Accepted');
});

test('Cancel only closes the form, and Edit is offered only where editing is allowed', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const modal = read('components/booking/AddBookingModal.tsx');
  const cancel = modal.slice(modal.indexOf('{isInvoiceEdit ? ('), modal.lastIndexOf("t('of.cancel')"));
  assert.match(cancel, /onPress=\{\(\) => setShowComposer\(false\)\}/);
  assert.match(modal, /const setShowComposer = \(visible: boolean\) => \{ if \(!visible\) onClose\(\); \};/);
  const screen = read('app/invoice/[invoiceId].tsx');
  assert.match(screen, /onClose=\{\(\) => setShowEdit\(false\)\}/);
  assert.match(screen, /\.\.\.\(canEditInvoice\(invoice\)\s*\?/);
  // The edit goes through the context mutation, never the create path.
  assert.match(screen, /onSaveInvoice=\{handleSaveEdit\}/);
  assert.match(screen, /updateInvoice\(invoice\.id,/);
});

// ------------------------------------------------------------------------------------------------
// Server: RLS (who may edit) and the owner write guard (what an edit may change), against an
// isolated in-memory Postgres running every migration in order.
// ------------------------------------------------------------------------------------------------
const project = path.resolve(__dirname, '..');
const migrations = fs.readdirSync(path.join(project, 'supabase/migrations')).filter((file) => file.endsWith('.sql')).sort();
const TOKEN = '2339ffe7-5385-400d-8c9f-2dbf07e0cdc0';
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

async function seed({ status = 'Accepted', linkStatus = 'Accepted', payments = [], extra = {} } = {}) {
  await db.exec('reset role; delete from public_invoice_links; delete from bookflow_workspaces;');
  const stored = { id: 'inv-1', invoiceNumber: 'INV-2026-0007', status, amount: 1200, dueDate: '2026-11-01', terms: 'Old', ...extra };
  await db.query('insert into bookflow_workspaces(user_id, data) values ($1, $2)', ['owner-a', JSON.stringify({ invoices: [stored], payments })]);
  await db.query('insert into bookflow_workspaces(user_id, data) values ($1, $2)', ['owner-b', JSON.stringify({ invoices: [] })]);
  await db.query(`insert into public_invoice_links(token, user_id, invoice_id, status, payload) values ($1, 'owner-a', 'inv-1', $2, $3)`,
    [TOKEN, linkStatus, JSON.stringify({ locale: 'ms-MY', invoice: { invoiceNumber: 'INV-2026-0007', status: linkStatus, terms: 'Old' } })]);
  return stored;
}
const as = (sub) => db.exec(`reset role; set role authenticated; set request.jwt.claims = '{"sub":"${sub}"}'`);
/** Saves the whole workspace the way the app does: one upsert of the full document. */
async function save(invoices, payments = []) {
  return db.query(`insert into bookflow_workspaces(user_id, data) values ('owner-a', $1)
    on conflict (user_id) do update set data = excluded.data, updated_at = now()`, [JSON.stringify({ invoices, payments })]);
}
async function stored() {
  await db.exec('reset role');
  return (await db.query(`select data from bookflow_workspaces where user_id = 'owner-a'`)).rows[0].data.invoices[0];
}

test('the owner can edit an accepted invoice; it stays accepted and keeps its number and link', async () => {
  const original = await seed();
  await as('owner-a');
  await save([{ ...original, amount: 1500, terms: 'New' }]);
  const payload = { locale: 'ms-MY', invoice: { invoiceNumber: 'INV-2026-0007', status: 'Accepted', terms: 'New' } };
  await db.query(`update public_invoice_links set payload = $1, updated_at = now() where user_id = 'owner-a' and invoice_id = 'inv-1'`, [JSON.stringify(payload)]);
  const saved = await stored();
  assert.equal(saved.amount, 1500);
  assert.equal(saved.status, 'Accepted');
  assert.equal(saved.invoiceNumber, 'INV-2026-0007');
  const link = (await db.query('select token, status, payload from public_invoice_links')).rows[0];
  assert.equal(link.token, TOKEN, 'same link the customer already has');
  assert.equal(link.status, 'Accepted', 'the acceptance record is untouched');
  assert.equal(link.payload.invoice.terms, 'New');
  // The customer page reads the edit, and cannot be answered a second time.
  const state = (await db.query('select read_public_invoice_state($1) as state', [TOKEN])).rows[0].state;
  assert.equal(state.invoice.amount, 1500);
  await assert.rejects(db.query(`select respond_to_invoice_link($1, 'Declined')`, [TOKEN]), /no longer active/);
});

test('an unaccepted invoice can be edited and the customer can still respond to it', async () => {
  const original = await seed({ status: 'Sent', linkStatus: 'Sent' });
  await as('owner-a');
  await save([{ ...original, amount: 900 }]);
  assert.equal((await stored()).amount, 900);
  const response = (await db.query(`select respond_to_invoice_link($1, 'Accepted') as result`, [TOKEN])).rows[0].result;
  assert.equal(response.status, 'Accepted');
  assert.equal((await stored()).amount, 900);
});

test('another user cannot edit the invoice or its shared copy', async () => {
  const original = await seed();
  await as('owner-b');
  const workspace = await db.query(`update bookflow_workspaces set data = jsonb_set(data, '{invoices,0,amount}', '1') where user_id = 'owner-a'`);
  assert.equal(workspace.affectedRows, 0);
  const link = await db.query(`update public_invoice_links set payload = '{"invoice":{"terms":"Forged"}}' where invoice_id = 'inv-1'`);
  assert.equal(link.affectedRows, 0);
  await db.exec(`reset role; set role anon`);
  await assert.rejects(db.query(`update bookflow_workspaces set data = '{}'`), /permission denied/);
  await assert.rejects(db.query(`update public_invoice_links set status = 'Sent'`), /permission denied/);
  assert.deepEqual(await stored(), original);
  assert.equal((await db.query('select payload from public_invoice_links')).rows[0].payload.invoice.terms, 'Old');
});

test('the server refuses edits that break an invoice: number, total, payments, closed', async () => {
  const payments = [{ id: 'p1', invoiceId: 'inv-1', amount: 400, kind: 'deposit' }];
  const original = await seed({ status: 'Partially Paid', payments });
  await as('owner-a');
  await assert.rejects(save([{ ...original, invoiceNumber: 'INV-2026-0099' }], payments), /invoice number cannot be changed/);
  await assert.rejects(save([{ ...original, amount: 0 }], payments), /greater than zero/);
  await assert.rejects(save([{ ...original, amount: '1500' }], payments), /greater than zero/);
  await assert.rejects(save([{ ...original, amount: 399.99 }], payments), /less than the payments/);
  await save([{ ...original, amount: 400 }], payments);
  assert.equal((await stored()).amount, 400, 'down to exactly what was paid is allowed');

  for (const extra of [{ status: 'Void' }, { status: 'Cancelled' }, { status: 'Declined' }, { deletedAt: '2026-10-20T00:00:00Z' }]) {
    const closed = await seed({ ...extra, extra });
    await as('owner-a');
    await assert.rejects(save([{ ...closed, amount: 1500 }]), /closed invoice/, JSON.stringify(extra));
  }
});

test('the guard leaves every other workspace write alone', async () => {
  const original = await seed({ status: 'Sent', linkStatus: 'Sent' });
  await as('owner-a');
  // Status changes, a trash and a restore, new invoices, removals: none touch number or total.
  await save([{ ...original, status: 'Accepted' }]);
  await save([{ ...original, status: 'Void', deletedAt: '2026-10-21T00:00:00Z', voidedAt: '2026-10-21T00:00:00Z' }]);
  await save([{ ...original, status: 'Sent', deletedAt: null, voidedAt: null }]);
  await save([{ ...original }, { id: 'inv-2', invoiceNumber: 'INV-2026-0008', amount: 50, status: 'Draft' }]);
  await save([]);
  await save([{ ...original }]);
  assert.deepEqual(await stored(), original);
  // A legacy invoice raised before numbering may be given one.
  const legacy = await seed({ extra: { invoiceNumber: undefined } });
  await as('owner-a');
  await save([{ ...legacy, invoiceNumber: 'INV-2026-0001' }]);
  assert.equal((await stored()).invoiceNumber, 'INV-2026-0001');
});

// --- The linked booking follows the invoice's event details ---------------------------------------

const linkedBooking = (over = {}) => ({
  id: 'bk-1', customerId: 'cust-1', title: 'Wedding', date: '2026-11-20', time: '10:00', startTime: '10:00', endTime: '14:00',
  location: 'KL', packageName: 'Wedding', price: 1200, depositAmount: 300, status: 'Confirmed', notes: 'Bring drone',
  sourceOfferId: 'ofr-9', fulfilment: { status: 'in_progress' }, ...over,
});
/** What updateInvoice does: apply the edit, then move the booking linked by the invoice's bookingId. */
function saveEdit(before, input, bookings) {
  const result = applyInvoiceEdit(before, input, []);
  assert.equal(result.ok, true, JSON.stringify(result));
  const booking = bookings.find((item) => item.id === before.bookingId);
  const synced = booking ? syncLinkedBookingSchedule(booking, before, result.invoice) : null;
  return { invoice: result.invoice, bookings: synced && synced !== booking ? bookings.map((item) => (item.id === booking.id ? synced : item)) : bookings, synced, booking };
}
const dayList = (bookings, day) => bookings.filter((item) => item.date === day).map((item) => item.id);

test('changing the event date moves the same booking to the new date — no new card', () => {
  const before = invoice({ eventDate: '2026-10-27' });
  const other = linkedBooking({ id: 'bk-other', date: '2026-10-27', startTime: '18:00', endTime: '20:00', time: '18:00' });
  const bookings = [linkedBooking({ date: '2026-10-27' }), other];
  const saved = saveEdit(before, edit({ date: '2026-10-29' }), bookings);
  assert.equal(saved.invoice.eventDate, '2026-10-29');
  assert.equal(saved.synced.date, '2026-10-29');
  assert.deepEqual(plain(dayList(saved.bookings, '2026-10-27')), ['bk-other'], 'gone from the old day; the unrelated booking stays');
  assert.deepEqual(plain(dayList(saved.bookings, '2026-10-29')), ['bk-1']);
  assert.equal(saved.bookings.length, 2, 'no duplicate');
  assert.equal(saved.bookings[1], other, 'unlinked bookings are the same records');
  // Nothing but the schedule moved: money, job status, customer, notes, delivery, form origin.
  const { date: _a, ...rest } = plain(saved.synced);
  const { date: _b, ...original } = plain(bookings[0]);
  assert.deepEqual(rest, original);
});

test('start and finish times, location, and a date in another month follow too', () => {
  const before = invoice();
  const bookings = [linkedBooking()];
  const timed = saveEdit(before, edit({ startTime: '15:00', endTime: '18:00' }), bookings).synced;
  assert.deepEqual([timed.startTime, timed.time, timed.endTime, timed.date], ['15:00', '15:00', '18:00', '2026-11-20']);
  const moved = saveEdit(before, edit({ location: 'Ipoh Convention Centre' }), bookings).synced;
  assert.equal(moved.location, 'Ipoh Convention Centre');
  const nextMonth = saveEdit(before, edit({ date: '2026-12-03' }), bookings);
  assert.equal(nextMonth.synced.date, '2026-12-03');
  assert.deepEqual(plain(dayList(nextMonth.bookings, '2026-11-20')), []);
  assert.deepEqual(plain(dayList(nextMonth.bookings, '2026-12-03')), ['bk-1']);
});

test('an edit that only changes money leaves the booking as it is — even one rescheduled since', () => {
  const before = invoice();
  // Rescheduled after the invoice was sent (updateBooking leaves issued invoices alone).
  const rescheduled = linkedBooking({ date: '2026-11-22', startTime: '09:00', time: '09:00', endTime: '11:00', location: 'Penang' });
  const saved = saveEdit(before, edit({ price: 1500, basePrice: 1500 }), [rescheduled]);
  assert.equal(saved.invoice.amount, 1500);
  assert.equal(saved.synced, rescheduled, 'the very same booking object: nothing to save for it');
  // An untouched form changes nothing either.
  const untouched = linkedBooking();
  assert.equal(saveEdit(before, edit(), [untouched]).synced, untouched);
});

test('an invoice without a booking, or whose booking is gone, saves as before', () => {
  for (const before of [invoice({ bookingId: '' }), invoice({ bookingId: 'bk-missing' })]) {
    const saved = saveEdit(before, edit({ date: '2026-12-01' }), [linkedBooking({ id: 'bk-unrelated' })]);
    assert.equal(saved.invoice.eventDate, '2026-12-01');
    assert.equal(saved.synced, null);
    assert.equal(saved.bookings[0].date, '2026-11-20', 'no other booking is touched');
  }
});

test('updateInvoice moves the linked booking in the same step as the invoice, before the save', () => {
  const context = fs.readFileSync(path.join(__dirname, '../context/app-data-context.tsx'), 'utf8');
  const body = context.slice(context.indexOf('updateInvoice: (invoiceId: string, input: InvoiceEditInput): UpdateInvoiceResult => {'), context.indexOf('refreshInvoiceStatuses,', context.indexOf('updateInvoice: (invoiceId: string')));
  // Matched by the stored bookingId only.
  assert.match(body, /const linkedBooking = invoice\.bookingId \? bookingsRef\.current\.find\(\(item\) => item\.id === invoice\.bookingId\) : undefined;/);
  const setInvoice = body.indexOf('setInvoices(');
  const setBooking = body.indexOf('setBookings(nextBookings)');
  const save = body.indexOf('confirmWorkspaceSave()');
  assert.ok(setInvoice > 0 && setBooking > setInvoice && save > setBooking, 'both change before the one save');
  // The calendar reads day lists and dots from bookings, and the selected day is screen state.
  const screen = fs.readFileSync(path.join(__dirname, '../app/(tabs)/bookings.tsx'), 'utf8');
  assert.match(screen, /const selectedDayBookings = bookings\.filter\(\(item\) => item\.date === selectedDate\);/);
  assert.match(screen, /const hasEvent = bookings\.some\(\(booking\) => booking\.date === cell\.dateKey\)/);
});

test('saved together: after reload both moved; a refused save leaves both as they were', async () => {
  const booking = linkedBooking({ date: '2026-10-27' });
  const original = { ...invoice({ eventDate: '2026-10-27' }), status: 'Partially Paid' };
  const payments = [{ id: 'p1', invoiceId: 'inv-1', amount: 400, kind: 'deposit' }];
  const workspace = (invoices, bookings) => JSON.stringify({ invoices, bookings, payments });
  await db.exec('reset role; delete from public_invoice_links; delete from bookflow_workspaces;');
  await db.query('insert into bookflow_workspaces(user_id, data) values ($1, $2)', ['owner-a', workspace([original], [booking])]);
  const upsert = (data) => db.query(`insert into bookflow_workspaces(user_id, data) values ('owner-a', $1)
    on conflict (user_id) do update set data = excluded.data, updated_at = now()`, [data]);
  const stored = async () => { await db.exec('reset role'); return (await db.query(`select data from bookflow_workspaces where user_id = 'owner-a'`)).rows[0].data; };

  // A save the server refuses (here: a total below the payment received) changes neither record.
  const refused = saveEdit(original, edit({ date: '2026-10-29' }), [booking]);
  await as('owner-a');
  await assert.rejects(upsert(workspace([{ ...refused.invoice, amount: 100 }], refused.bookings)), /less than the payments/);
  let data = await stored();
  assert.equal(data.invoices[0].eventDate, '2026-10-27');
  assert.equal(data.bookings[0].date, '2026-10-27');

  // The normal save: invoice and booking land together and read back moved, once.
  const saved = saveEdit(original, edit({ date: '2026-10-29', startTime: '15:00', endTime: '18:00', location: 'Ipoh' }), [booking]);
  await as('owner-a');
  await upsert(workspace([saved.invoice], saved.bookings));
  data = await stored();
  assert.equal(data.invoices[0].eventDate, '2026-10-29');
  assert.deepEqual([data.bookings.length, data.bookings[0].id, data.bookings[0].date, data.bookings[0].startTime, data.bookings[0].endTime, data.bookings[0].location],
    [1, 'bk-1', '2026-10-29', '15:00', '18:00', 'Ipoh']);
  assert.equal(data.bookings[0].status, 'Confirmed');
  assert.deepEqual(data.payments, payments);
  assert.equal(data.invoices[0].amount, original.amount);
});
