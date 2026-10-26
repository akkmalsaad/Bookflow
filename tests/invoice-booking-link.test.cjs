const assert = require('node:assert/strict');
const test = require('node:test');
const { execSync } = require('node:child_process');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const { loadTs, plain } = require('./helpers/load-ts.cjs');

const link = loadTs('lib/invoice-booking-link.ts');

/** Loads a module exactly as it is in the released build (git HEAD), not the working tree. */
function loadReleased(file) {
  const source = execSync(`git show HEAD:${file}`, { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require: () => ({}) });
  return exports;
}

const NOW = '2026-10-16T08:00:00.000Z';
const booking = (id, over = {}) => ({ id, customerId: 'cust-1', title: 'Wedding', date: '2026-11-20', startTime: '10:00', endTime: '14:00', location: 'KL', packageName: 'Wedding', price: 3200, status: 'Confirmed', notes: '', ...over });
const invoice = (id, bookingId, over = {}) => ({ id, bookingId, customerId: 'cust-1', amount: 3200, dueDate: '2026-11-19', sentAt: '2026-10-01', status: 'Sent', ...over });
/** What the context does on a plain Delete: the invoice is trashed and keeps the booking. */
function deleteInvoice(inv, invoices, bookings) {
  const linked = link.removeLinkedBooking(inv, invoices, bookings);
  return {
    linked,
    bookings: linked.bookings,
    invoices: invoices.map((item) => (item.id === inv.id ? { ...item, deletedAt: NOW, ...(linked.removedBooking ? { removedBooking: linked.removedBooking } : {}) } : item)),
  };
}
function restoreInvoice(inv, invoices, bookings) {
  const linked = link.restoreLinkedBooking(inv, invoices, bookings);
  const clear = new Set(linked.clearOn);
  return {
    linked,
    bookings: linked.bookings,
    invoices: invoices.map((item) => (item.id === inv.id ? { ...item, deletedAt: null, ...(clear.has(item.id) ? { removedBooking: null } : {}) } : clear.has(item.id) ? { ...item, removedBooking: null } : item)),
  };
}

test('Delete removes exactly the invoice’s linked booking, found by its stored bookingId', () => {
  const twin = booking('bk-twin'); // same customer, date and amount — must never be touched
  const inv = invoice('inv-1', 'bk-1');
  const result = deleteInvoice(inv, [inv], [booking('bk-1'), twin]);
  assert.equal(result.linked.impact.kind, 'remove');
  assert.deepEqual(plain(result.bookings.map((item) => item.id)), ['bk-twin']);
  assert.equal(result.invoices[0].removedBooking.id, 'bk-1');
});

test('an invoice without a booking (or with a dangling id) deletes cleanly and changes no booking', () => {
  const bookings = [booking('bk-1')];
  for (const inv of [invoice('inv-x', ''), invoice('inv-y', undefined), invoice('inv-z', 'bk-missing')]) {
    const result = link.removeLinkedBooking(inv, [inv], bookings);
    assert.equal(result.impact.kind, 'none');
    assert.equal(result.bookings, bookings);
    assert.equal(result.removedBooking, null);
  }
});

test('a booking shared with another active invoice is kept, so no active invoice is left broken', () => {
  const a = invoice('inv-a', 'bk-1');
  const b = invoice('inv-b', 'bk-1');
  const bookings = [booking('bk-1')];
  const result = link.removeLinkedBooking(a, [a, b], bookings);
  assert.equal(result.impact.kind, 'keep_shared');
  assert.deepEqual(plain(result.impact.sharedWith.map((item) => item.id)), ['inv-b']);
  assert.equal(result.bookings, bookings);
});

test('Undo / Dustbin restore puts the booking back exactly as it was', () => {
  const inv = invoice('inv-1', 'bk-1');
  const original = booking('bk-1', { charges: [{ id: 'c', description: 'Parking', quantity: 1, unitPrice: 20, amount: 20 }] });
  const deleted = deleteInvoice(inv, [inv], [original]);
  const restored = restoreInvoice(deleted.invoices[0], deleted.invoices, deleted.bookings);
  assert.equal(restored.linked.restored, true);
  assert.deepEqual(plain(restored.bookings), plain([original]));
  assert.equal(restored.invoices[0].removedBooking, null);
});

test('restoring never revives a booking that an invoice deletion did not remove', () => {
  // The booking was removed some other way (it is simply not in the list, and no invoice holds it).
  const inv = invoice('inv-1', 'bk-gone', { deletedAt: NOW });
  const result = link.restoreLinkedBooking(inv, [inv], [booking('bk-other')]);
  assert.equal(result.restored, false);
  assert.deepEqual(plain(result.bookings.map((item) => item.id)), ['bk-other']);
});

test('two invoices on one booking: delete A (kept), delete B (removed), restore A → booking back', () => {
  const a = invoice('inv-a', 'bk-1');
  const b = invoice('inv-b', 'bk-1');
  let state = deleteInvoice(a, [a, b], [booking('bk-1')]);
  assert.equal(state.bookings.length, 1); // kept: B still active
  state = deleteInvoice(state.invoices[1], state.invoices, state.bookings);
  assert.equal(state.bookings.length, 0);
  assert.equal(state.invoices[1].removedBooking.id, 'bk-1');
  // Restoring A must not leave an active invoice pointing at a booking that is not there.
  const restored = restoreInvoice(state.invoices[0], state.invoices, state.bookings);
  assert.equal(restored.linked.restored, true);
  assert.deepEqual(plain(restored.bookings.map((item) => item.id)), ['bk-1']);
  assert.equal(restored.invoices[1].removedBooking, null); // B no longer holds a copy
});

test('permanent delete / purge removes the booking for good, unless another invoice still references it', () => {
  const a = invoice('inv-a', 'bk-1');
  const deleted = deleteInvoice(a, [a], [booking('bk-1'), booking('bk-other')]);
  const purged = link.purgeLinkedBookings(['inv-a'], deleted.invoices, deleted.bookings);
  assert.deepEqual(plain(purged.bookings.map((item) => item.id)), ['bk-other']);
  assert.equal(purged.handOver.size, 0);

  // B is in the Dustbin and references bk-1: it takes over the booking, so restoring B brings it back.
  const b = invoice('inv-b', 'bk-1', { deletedAt: NOW });
  const handed = link.purgeLinkedBookings(['inv-a'], [...deleted.invoices, b], deleted.bookings);
  assert.equal(handed.handOver.get('inv-b').id, 'bk-1');
  // B is active (restored by an older app): the booking is put straight back.
  const active = link.purgeLinkedBookings(['inv-a'], [...deleted.invoices, invoice('inv-b', 'bk-1')], deleted.bookings);
  assert.ok(active.bookings.some((item) => item.id === 'bk-1'));
});

test('released App Store version: it never sees a removed booking, and keeps it on the invoice when it saves', () => {
  const released = loadReleased('lib/invoice-customer.ts');
  const releasedConflicts = loadReleased('lib/booking-conflicts.ts');
  const inv = invoice('inv-1', 'bk-1'); // no customerSnapshot, so the released backfill rewrites it
  const deleted = deleteInvoice(inv, [inv], [booking('bk-1')]);
  // Its load path maps every invoice; unknown fields survive the spread.
  const loaded = released.backfillInvoiceCustomerSnapshots(JSON.parse(JSON.stringify(deleted.invoices)), [{ id: 'cust-1', name: 'Siti', email: 's@x.my', phone: '', location: '' }]);
  assert.equal(loaded[0].removedBooking.id, 'bk-1');
  // Its conflict check and schedule read `bookings`, which no longer contains the removed booking.
  assert.equal(releasedConflicts.findBookingTimeConflict(deleted.bookings, '2026-11-20', '10:00', '14:00'), null);
});

test('released App Store version restores the invoice: this version puts the booking back on next load', () => {
  const inv = invoice('inv-1', 'bk-1');
  const deleted = deleteInvoice(inv, [inv], [booking('bk-1')]);
  // The released restore spreads the invoice and clears deletedAt; it knows nothing about bookings.
  const restoredByReleased = deleted.invoices.map((item) => ({ ...item, deletedAt: null, statusBeforeTrash: null }));
  const reconciled = link.reconcileLinkedBookings(restoredByReleased, deleted.bookings);
  assert.deepEqual(plain(reconciled.bookings.map((item) => item.id)), ['bk-1']);
  assert.equal(reconciled.invoices[0].removedBooking, null);
  // A consistent workspace is returned untouched, so loading queues no save.
  const again = link.reconcileLinkedBookings(reconciled.invoices, reconciled.bookings);
  assert.equal(again.invoices, reconciled.invoices);
  assert.equal(again.bookings, reconciled.bookings);
  // While the invoice is still in the Dustbin, nothing is changed.
  const untouched = link.reconcileLinkedBookings(deleted.invoices, deleted.bookings);
  assert.equal(untouched.bookings, deleted.bookings);
});

test('backups carry the removed booking on its invoice, sanitised like any booking', () => {
  const backup = loadTs('lib/workspace-backup.ts', {}, { '@/context/app-data-context': { getCurrencyFormatter: () => new Intl.NumberFormat('en-US') } });
  const file = JSON.stringify({
    bookflowBackup: true, backupVersion: 1, createdAt: NOW, appVersion: 'test', workspace: { businessName: 'S', currency: 'MYR' },
    data: { packages: [], customers: [], bookings: [], payments: [], financeEntries: [], reminders: [],
      invoices: [{ ...invoice('inv-1', 'bk-1', { deletedAt: NOW }), removedBooking: { ...booking('bk-1'), injected: 'nope' } }] },
  });
  const [restored] = plain(backup.parseWorkspaceBackup(file).backup.data.invoices);
  assert.equal(restored.removedBooking.id, 'bk-1');
  assert.equal(restored.removedBooking.injected, undefined);
});

test('only a plain Delete takes the booking; Cancel and Void keep their previous behaviour', () => {
  assert.equal(link.removalTakesLinkedBooking('delete'), true);
  assert.equal(link.removalTakesLinkedBooking('cancel'), false);
  assert.equal(link.removalTakesLinkedBooking('void'), false);
  // A cancelled or voided invoice holds no booking, so its restore, permanent delete and purge leave
  // bookings untouched, exactly as before.
  const cancelled = invoice('inv-c', 'bk-1', { deletedAt: NOW, status: 'Cancelled' });
  const bookings = [booking('bk-1')];
  assert.equal(link.restoreLinkedBooking(cancelled, [cancelled], bookings).bookings, bookings);
  assert.equal(link.purgeLinkedBookings(['inv-c'], [cancelled], bookings).bookings, bookings);
});
