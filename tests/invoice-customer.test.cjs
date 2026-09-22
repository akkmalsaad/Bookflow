const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadInvoiceCustomer() {
  const code = ts.transpileModule(read(path.join('lib', 'invoice-customer.ts')), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({}), Map, Boolean, Object });
  return exports;
}

const {
  backfillInvoiceCustomerSnapshots,
  createInvoiceCustomerSnapshot,
  getInvoiceClientName,
  isSameInvoiceCustomerSnapshot,
  refreshInvoiceCustomerSnapshots,
  resolveInvoiceCustomer,
} = loadInvoiceCustomer();

const customer = (over = {}) => ({
  id: 'cust-1',
  name: 'Nur Aina binti Rahman',
  email: 'aina@example.com',
  phone: '+60 12-345 6789',
  location: '18 Jalan Bukit Bintang, Kuala Lumpur',
  notes: 'Prefers WhatsApp',
  ...over,
});

const invoice = (over = {}) => ({
  id: 'inv-1',
  bookingId: 'bk-1',
  customerId: 'cust-1',
  amount: 850,
  dueDate: '2026-09-30',
  sentAt: '2026-09-05',
  status: 'Sent',
  ...over,
});

test('a snapshot copies the client details an invoice prints, and nothing else', () => {
  const snapshot = createInvoiceCustomerSnapshot(customer({ name: '  Aina  ' }));

  // Field by field: the module runs in its own VM realm, so a deep-equal would compare prototypes.
  assert.equal(snapshot.name, 'Aina');
  assert.equal(snapshot.email, 'aina@example.com');
  assert.equal(snapshot.phone, '+60 12-345 6789');
  assert.equal(snapshot.address, '18 Jalan Bukit Bintang, Kuala Lumpur');
  assert.equal(Object.keys(snapshot).length, 4);
  // Internal notes are not part of the document.
  assert.equal('notes' in snapshot, false);
});

test('the live client record wins while it exists, so editing a client still updates their invoices', () => {
  const stored = invoice({ customerSnapshot: { name: 'Old Name', email: 'old@example.com', phone: '', address: '' } });
  const details = resolveInvoiceCustomer(stored, customer({ name: 'Renamed Client' }));

  assert.equal(details.name, 'Renamed Client');
  assert.equal(details.source, 'customer');
  assert.equal(details.customerId, 'cust-1');
});

test('a deleted client falls back to the snapshot frozen onto the invoice', () => {
  const stored = invoice({
    customerSnapshot: { name: 'Aina', email: 'aina@example.com', phone: '+60123456789', address: 'KL' },
  });
  const details = resolveInvoiceCustomer(stored, undefined);

  assert.equal(details.name, 'Aina');
  assert.equal(details.phone, '+60123456789');
  assert.equal(details.source, 'snapshot');
  // Nothing downstream may look the client up again.
  assert.equal(details.customerId, null);
});

test('an invoice with neither a client nor a snapshot still resolves rather than throwing', () => {
  const details = resolveInvoiceCustomer(invoice({ customerId: '' }), null);

  assert.equal(details.source, 'missing');
  assert.equal(details.name, '');
  assert.equal(getInvoiceClientName(invoice({ customerId: '' }), null, 'Deleted client'), 'Deleted client');
});

test('an empty snapshot counts as no snapshot', () => {
  const stored = invoice({ customerSnapshot: { name: '  ', email: '', phone: '', address: '' } });

  assert.equal(resolveInvoiceCustomer(stored, undefined).source, 'missing');
  assert.equal(getInvoiceClientName(stored, undefined, 'Deleted client'), 'Deleted client');
});

test('the backfill stamps only invoices whose client still exists, and invents nothing for the rest', () => {
  const withClient = invoice({ id: 'inv-live' });
  const clientGone = invoice({ id: 'inv-orphan', customerId: 'cust-gone' });
  const alreadyStamped = invoice({
    id: 'inv-stamped',
    customerId: 'cust-gone',
    customerSnapshot: { name: 'Kept', email: '', phone: '', address: '' },
  });

  const result = backfillInvoiceCustomerSnapshots([withClient, clientGone, alreadyStamped], [customer()]);

  assert.equal(result[0].customerSnapshot.name, 'Nur Aina binti Rahman');
  assert.equal(result[1].customerSnapshot, undefined);
  // An existing snapshot is never rewritten from anywhere else.
  assert.equal(result[2].customerSnapshot.name, 'Kept');
});

test('the backfill leaves an already-complete workspace untouched', () => {
  const invoices = [invoice({ customerSnapshot: { name: 'Aina', email: '', phone: '', address: '' } })];

  assert.equal(backfillInvoiceCustomerSnapshots(invoices, [customer()]), invoices);
});

test('the invoice screen opens on the invoice alone, never on its client record', () => {
  const screen = read(path.join('app', 'invoice', '[invoiceId].tsx'));

  // The bug this guards: the screen used to refuse to open when the client had been deleted.
  assert.match(screen, /if \(!invoice \|\| !client\)/);
  assert.equal(/customer\.(name|email|phone)/.test(screen), false);
  assert.match(screen, /resolveInvoiceCustomer/);
});

test('deleting a client never deletes their invoices, and stamps any still missing a snapshot', () => {
  const context = read(path.join('context', 'app-data-context.tsx'));
  const start = context.indexOf('deleteCustomer: (id: string) => {');
  const deleteCustomer = context.slice(start, context.indexOf('createBooking: (booking: CreateBookingInput)', start));

  assert.ok(start > 0);

  assert.match(deleteCustomer, /createInvoiceCustomerSnapshot\(customer\)/);
  // Nothing in this path removes an invoice, a payment or a ledger row.
  assert.equal(/setInvoices\(\(current\) => current\.filter/.test(deleteCustomer), false);
  assert.equal(/deleteInvoice|trashInvoice/.test(deleteCustomer), false);
});

// --- Keeping the snapshot in step with the client ------------------------------------------------
//
// The snapshot is stamped at creation and refreshed whenever the client is edited, so what it
// finally freezes is the client as they stood when they were deleted.

test('editing a client carries the new name onto their invoices, and a delete keeps it', () => {
  const stamped = { ...invoice(), customerSnapshot: createInvoiceCustomerSnapshot(customer()) };

  const renamed = customer({ name: 'Ahmad bin Ismail' });
  const [refreshed] = refreshInvoiceCustomerSnapshots([stamped], renamed);

  // While the client exists the live record still wins — the refresh changes nothing on screen.
  assert.equal(resolveInvoiceCustomer(refreshed, renamed).name, 'Ahmad bin Ismail');
  assert.equal(resolveInvoiceCustomer(refreshed, renamed).source, 'customer');
  // Once deleted, the invoice names them as they last were rather than as first raised.
  assert.equal(resolveInvoiceCustomer(refreshed, undefined).name, 'Ahmad bin Ismail');
  assert.equal(resolveInvoiceCustomer(refreshed, undefined).source, 'snapshot');
});

test('a changed phone, email or address survives the client being deleted', () => {
  const stamped = {
    ...invoice(),
    customerSnapshot: createInvoiceCustomerSnapshot(customer({ phone: '0121111111' })),
  };

  const edited = customer({ phone: '0129999999', email: 'new@example.com', location: 'Johor Bahru' });
  const [refreshed] = refreshInvoiceCustomerSnapshots([stamped], edited);
  const details = resolveInvoiceCustomer(refreshed, undefined);

  assert.equal(details.phone, '0129999999');
  assert.equal(details.email, 'new@example.com');
  assert.equal(details.address, 'Johor Bahru');
});

test('editing one client leaves every other client’s invoices untouched', () => {
  const clientB = customer({ id: 'cust-2', name: 'Client B', email: 'b@example.com', phone: '0132222222' });
  const invoiceA = { ...invoice({ id: 'inv-a' }), customerSnapshot: createInvoiceCustomerSnapshot(customer()) };
  const invoiceB = { ...invoice({ id: 'inv-b', customerId: 'cust-2' }), customerSnapshot: createInvoiceCustomerSnapshot(clientB) };

  const result = refreshInvoiceCustomerSnapshots([invoiceA, invoiceB], customer({ name: 'Renamed A' }));

  assert.equal(result[0].customerSnapshot.name, 'Renamed A');
  // Same object, not merely equal values: Client B's invoice was never rewritten.
  assert.equal(result[1], invoiceB);
  assert.equal(result[1].customerSnapshot.name, 'Client B');
});

test('a refresh that changes nothing rewrites nothing, so no needless save is queued', () => {
  const unchanged = { ...invoice(), customerSnapshot: createInvoiceCustomerSnapshot(customer()) };
  const otherClient = { ...invoice({ id: 'inv-b', customerId: 'cust-2' }) };
  const invoices = [unchanged, otherClient];

  // Same array reference back: the React updater bails out rather than re-rendering.
  assert.equal(refreshInvoiceCustomerSnapshots(invoices, customer()), invoices);
  // Editing a field the snapshot does not carry is likewise a no-op.
  assert.equal(refreshInvoiceCustomerSnapshots(invoices, customer({ notes: 'Called Tuesday' })), invoices);
});

test('an invoice that never had a snapshot gains one when its client is edited', () => {
  const legacy = invoice({ customerSnapshot: undefined });

  const [refreshed] = refreshInvoiceCustomerSnapshots([legacy], customer({ name: 'Renamed' }));

  assert.equal(refreshed.customerSnapshot.name, 'Renamed');
  assert.equal(isSameInvoiceCustomerSnapshot(undefined, createInvoiceCustomerSnapshot(customer())), false);
});

test('the resolver priority is unchanged: live client, then snapshot, then the deleted label', () => {
  const stamped = { ...invoice(), customerSnapshot: { name: 'Snapshot Name', email: '', phone: '', address: '' } };

  assert.equal(resolveInvoiceCustomer(stamped, customer({ name: 'Live Name' })).source, 'customer');
  assert.equal(getInvoiceClientName(stamped, customer({ name: 'Live Name' }), 'Deleted client'), 'Live Name');
  assert.equal(getInvoiceClientName(stamped, undefined, 'Deleted client'), 'Snapshot Name');
  assert.equal(getInvoiceClientName(invoice({ customerSnapshot: undefined }), undefined, 'Deleted client'), 'Deleted client');
});

test('editing a client touches only snapshots — never an invoice’s money, status or Dustbin state', () => {
  const stamped = {
    ...invoice({ status: 'Partially Paid', amount: 850, deletedAt: '2026-09-20T00:00:00.000Z', statusBeforeTrash: 'Sent' }),
    customerSnapshot: createInvoiceCustomerSnapshot(customer()),
  };

  const [refreshed] = refreshInvoiceCustomerSnapshots([stamped], customer({ name: 'Renamed' }));

  for (const field of ['id', 'bookingId', 'customerId', 'amount', 'dueDate', 'sentAt', 'status', 'deletedAt', 'statusBeforeTrash']) {
    assert.equal(refreshed[field], stamped[field], `${field} must not change`);
  }
  // A trashed invoice is refreshed in place too, so restoring it later still names the client.
  assert.equal(refreshed.customerSnapshot.name, 'Renamed');
});

test('the central update path is the one that refreshes, so every screen behaves alike', () => {
  const context = read(path.join('context', 'app-data-context.tsx'));
  const start = context.indexOf("updateCustomer: (id: string, updates: Partial<Omit<Customer, 'id'>>) => {");
  const updateCustomer = context.slice(start, context.indexOf('deleteCustomer: (id: string) => {', start));

  assert.ok(start > 0);
  assert.match(updateCustomer, /refreshInvoiceCustomerSnapshots\(current, nextCustomer\)/);
  // Snapshot construction stays in one place rather than being rebuilt here.
  assert.equal(/name:\s*nextCustomer\.name/.test(updateCustomer), false);
  // Nothing in this path trashes, restores or purges an invoice.
  assert.equal(/trashInvoice|restoreInvoice|deleteInvoicePermanently|deletedAt/.test(updateCustomer), false);
});
