const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

/** The status rules are pure and carry only type-level imports, so they load standalone. */
function loadBookingStatus() {
  const file = path.join(__dirname, '..', 'lib', 'booking-status.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({}) });
  return exports;
}

const { syncBookingStatuses } = loadBookingStatus();

const booking = (id, status) => ({ id, status, title: id, customerId: 'cus-1', date: '2026-09-06', location: '', packageName: 'Wedding Package', price: 3200, notes: '' });
const invoice = (id, bookingId, status, extra = {}) => ({ id, bookingId, customerId: 'cus-1', amount: 3200, dueDate: '2026-09-13', sentAt: '2026-09-01', status, ...extra });
const deposit = (invoiceId, amount = 960) => ({ id: `pay-${invoiceId}`, invoiceId, amount, method: 'Bank transfer', date: '2026-09-02', kind: 'deposit', recordedAt: '2026-09-02T00:00:00.000Z' });
const payment = (invoiceId, amount = 500) => ({ id: `full-${invoiceId}`, invoiceId, amount, method: 'Cash', date: '2026-09-02', kind: 'payment', recordedAt: '2026-09-02T00:00:00.000Z' });

const statusOf = (bookings, invoices, payments, id = 'bk-1') =>
  syncBookingStatuses(bookings, invoices, payments).find((item) => item.id === id).status;

test('A: a new booking with no invoice stays Inquiry', () => {
  assert.equal(statusOf([booking('bk-1', 'Inquiry')], [], []), 'Inquiry');
});

test('B: an invoice that has been sent but not accepted leaves the booking alone', () => {
  const invoices = [invoice('inv-1', 'bk-1', 'Sent')];
  assert.equal(statusOf([booking('bk-1', 'Inquiry')], invoices, []), 'Inquiry');
});

test('C: the customer accepting the invoice confirms the booking', () => {
  const invoices = [invoice('inv-1', 'bk-1', 'Accepted')];
  assert.equal(statusOf([booking('bk-1', 'Inquiry')], invoices, []), 'Confirmed');
});

test('D: a recorded deposit moves the booking to Deposit Paid', () => {
  const invoices = [invoice('inv-1', 'bk-1', 'Accepted')];
  assert.equal(statusOf([booking('bk-1', 'Confirmed')], invoices, [deposit('inv-1')]), 'Deposit Paid');
  // Straight from Inquiry too: a deposit is evidence of acceptance whatever the invoice now says.
  assert.equal(statusOf([booking('bk-1', 'Inquiry')], invoices, [deposit('inv-1')]), 'Deposit Paid');
});

test('E: a manual In Progress is never pulled back by an earlier acceptance or deposit', () => {
  const invoices = [invoice('inv-1', 'bk-1', 'Accepted')];
  assert.equal(statusOf([booking('bk-1', 'In Progress')], invoices, [deposit('inv-1')]), 'In Progress');
});

test('G/H: Completed and Cancelled survive acceptance and deposits untouched', () => {
  const invoices = [invoice('inv-1', 'bk-1', 'Accepted')];
  assert.equal(statusOf([booking('bk-1', 'Completed')], invoices, [deposit('inv-1')]), 'Completed');
  assert.equal(statusOf([booking('bk-1', 'Cancelled')], invoices, [deposit('inv-1')]), 'Cancelled');
});

test('an invoice that moves on to Paid does not undo the booking it already confirmed', () => {
  // applyInvoicePayments rewrites the invoice's own status once money lands, which is exactly why
  // the advance is persisted on the booking rather than derived from the invoice each render.
  const invoices = [invoice('inv-1', 'bk-1', 'Paid')];
  assert.equal(statusOf([booking('bk-1', 'Confirmed')], invoices, []), 'Confirmed');
});

test('a plain payment is not a deposit', () => {
  const invoices = [invoice('inv-1', 'bk-1', 'Accepted')];
  assert.equal(statusOf([booking('bk-1', 'Inquiry')], invoices, [payment('inv-1')]), 'Confirmed');
});

test('a trashed invoice stops being evidence, and never reverses what it already did', () => {
  const trashed = [invoice('inv-1', 'bk-1', 'Accepted', { deletedAt: '2026-09-03' })];
  assert.equal(statusOf([booking('bk-1', 'Inquiry')], trashed, []), 'Inquiry');
  assert.equal(statusOf([booking('bk-1', 'Confirmed')], trashed, []), 'Confirmed');
});

test('each booking only ever reads its own invoices', () => {
  const bookings = [booking('bk-1', 'Inquiry'), booking('bk-2', 'Inquiry')];
  const invoices = [invoice('inv-1', 'bk-1', 'Accepted'), invoice('inv-2', 'bk-2', 'Sent')];
  const synced = syncBookingStatuses(bookings, invoices, [deposit('inv-1')]);
  assert.equal(synced.find((item) => item.id === 'bk-1').status, 'Deposit Paid');
  assert.equal(synced.find((item) => item.id === 'bk-2').status, 'Inquiry');
});

test('an already consistent workspace is returned unchanged, so no render or save is queued', () => {
  const bookings = [booking('bk-1', 'Deposit Paid')];
  const invoices = [invoice('inv-1', 'bk-1', 'Accepted')];
  assert.equal(syncBookingStatuses(bookings, invoices, [deposit('inv-1')]), bookings);
  assert.equal(syncBookingStatuses(bookings, [], []), bookings);
});

test('a legacy status is only rewritten by a real advance, never by the display fallback', () => {
  const legacy = [booking('bk-1', 'Pending')];
  assert.equal(syncBookingStatuses(legacy, [invoice('inv-1', 'bk-1', 'Sent')], []), legacy);
  assert.equal(statusOf(legacy, [invoice('inv-1', 'bk-1', 'Accepted')], []), 'Confirmed');
});
