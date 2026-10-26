const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, plain } = require('./helpers/load-ts.cjs');

const offers = loadTs('lib/booking-offers.ts');
const pricing = loadTs('lib/booking-pricing.ts');
const fulfilment = loadTs('lib/booking-fulfilment.ts');
const money = loadTs('lib/job-financials.ts');
const messages = loadTs('lib/booking-messages.ts');
const workflowReminders = loadTs('lib/workflow-reminders.ts');

const charge = (quantity, unitPrice, description) => pricing.validateChargeDraft({ description, quantity, unitPrice }, () => `chg-${description}`).charge;
const details = (over = {}) => ({
  title: 'Wedding Package', packageId: 'pkg-1', packageName: 'Wedding Package', packageDetails: 'Two photographers',
  includedServices: ['200 photos'], basePrice: 3200, charges: [charge(2, 50, 'Parking'), charge(1.5, 200, 'Extra hours')],
  deposit: { type: 'percent', value: 30, dueDate: '2026-11-01' }, date: '2026-11-20', startTime: '10:00', endTime: '18:00',
  bufferMinutes: 30, location: 'Shah Alam', notes: 'Owner-only note', terms: 'Deposit is non-refundable.', ...over,
});

test('historical price snapshots: the public snapshot freezes prices in cents and a terms version', () => {
  const snapshot = offers.buildOfferSnapshot({
    kind: 'booking_form', version: 1, details: details(), currency: 'MYR', locale: 'en', timeZone: 'Asia/Kuala_Lumpur',
    business: { name: 'Studio', phone: '', email: '', logoUrl: null }, requireEmail: true,
  });
  assert.equal(snapshot.subtotalCents, 320000);
  assert.equal(snapshot.chargesCents, 40000);
  assert.equal(snapshot.totalCents, 360000);
  assert.equal(snapshot.deposit.amountCents, 108000);
  assert.equal(snapshot.lines.length, 3);
  assert.equal(snapshot.termsVersion, offers.computeTermsVersion(1, 'Deposit is non-refundable.'));
  assert.notEqual(snapshot.termsVersion, offers.computeTermsVersion(1, 'Different terms'));
  assert.notEqual(snapshot.termsVersion, offers.computeTermsVersion(2, 'Deposit is non-refundable.'));
  // Owner-only notes never reach the public snapshot.
  assert.ok(!JSON.stringify(snapshot).includes('Owner-only note'));
  // A later change to the service cannot reach a snapshot already taken.
  const pkg = { id: 'pkg-1', name: 'Wedding Package', details: '', duration: '8 hours', price: 9999, info: '' };
  assert.equal(snapshot.subtotalCents, 320000);
  assert.equal(offers.detailsFromPackage(pkg, { charges: [], date: '', startTime: '', endTime: '', terms: '' }).basePrice, 9999);
});

test('quotation versions are preserved and accepted terms cannot be silently overwritten', () => {
  const quote = { id: 'ofr-1', kind: 'quotation', createdAt: '2026-10-01', status: 'sent', version: 1, details: details(), sharedAt: '2026-10-01T00:00:00Z' };
  const revised = offers.reviseOffer(quote, details({ basePrice: 3500 }), '2026-10-02T00:00:00Z');
  assert.equal(revised.version, 2);
  assert.equal(revised.history[0].version, 1);
  assert.equal(revised.history[0].details.basePrice, 3200);
  // The customer accepted version 1 before seeing version 2: version 1 is what converts.
  const accepted = { ...revised, status: 'accepted', respondedVersion: 1 };
  assert.equal(offers.getRespondedDetails(accepted).basePrice, 3200);
  // Once accepted, no revision is possible.
  assert.equal(offers.canReviseOffer(accepted), false);
  assert.equal(offers.reviseOffer(accepted, details({ basePrice: 1 }), 'x'), accepted);
  // An unshared draft is edited in place.
  const draft = { ...quote, status: 'draft', sharedAt: undefined };
  assert.equal(offers.reviseOffer(draft, details({ basePrice: 10 }), 'x').version, 1);
});

test('customers are matched only on exact email or the owner’s own choice, never on a name', () => {
  const customers = [
    { id: 'c-1', name: 'Siti Nur', email: 'siti@example.my', phone: '+60123456789' },
    { id: 'c-2', name: 'Ali', email: 'ali@example.my', phone: '+60111111111' },
  ];
  assert.equal(offers.matchSubmissionCustomer(customers, { name: 'Siti Nur', email: 'other@example.my' }), null);
  assert.equal(offers.matchSubmissionCustomer(customers, { name: 'Someone', email: ' SITI@Example.my ' }).id, 'c-1');
  assert.equal(offers.matchSubmissionCustomer(customers, { name: 'Siti', phone: '+60123456789' }), null);
  assert.equal(offers.matchSubmissionCustomer(customers, { name: 'X', email: 'siti@example.my' }, 'c-2').id, 'c-2');
  assert.equal(offers.matchSubmissionCustomer(customers, { name: 'X' }, 'missing'), null);
});

test('a submission becomes one pending booking and one invoice with deterministic ids', () => {
  const ids = offers.offerRecordIds('ofr-1');
  assert.deepEqual(plain(ids), plain(offers.offerRecordIds('ofr-1')));
  const booking = offers.buildBookingFromOffer({ offerId: 'ofr-1', details: details(), customerId: 'c-1', response: { location: 'Klang', notes: 'Gate B' }, createdAt: '2026-10-16', noteLabel: 'From form' });
  assert.equal(booking.id, ids.bookingId);
  assert.equal(booking.status, 'Inquiry');
  assert.equal(booking.price, 3600);
  assert.equal(booking.basePrice, 3200);
  assert.equal(booking.depositAmount, 1080);
  assert.equal(booking.location, 'Klang');
  assert.match(booking.notes, /Gate B/);
  const invoice = offers.buildInvoiceFieldsFromBooking(booking, details(), '2026-11-19', '2026-10-16');
  assert.equal(invoice.amount, 3600);
  assert.equal(invoice.status, 'Draft');
  assert.equal(invoice.depositDue, 1080);
  assert.equal(invoice.lineItems.length, 3);
  // Creating an invoice records no payment.
  assert.equal(invoice.depositPaid, undefined);
});

test('duplicate-safe quotation numbering and expiry', () => {
  assert.equal(offers.nextQuotationNumber([{ number: 'Q-0002' }, { number: 'Q-0010' }, {}]), 'Q-0011');
  assert.equal(offers.isQuotationExpired({ kind: 'quotation', validUntil: '2026-10-01', status: 'sent' }, '2026-10-02'), true);
  assert.equal(offers.isQuotationExpired({ kind: 'quotation', validUntil: '2026-10-01', status: 'accepted' }, '2026-10-02'), false);
  assert.equal(offers.normalizeOffers([{ id: 'x' }, { id: 'ofr', kind: 'quotation', version: 1, details: {} }]).length, 1);
});

test('delivery tracking: overdue first, internal notes never public, unsafe links refused', () => {
  const bookings = [
    { id: 'a', status: 'Completed', date: '2026-09-01', fulfilment: { status: 'in_progress', promisedDate: '2026-10-20' } },
    { id: 'b', status: 'Completed', date: '2026-09-02', fulfilment: { status: 'in_progress', promisedDate: '2026-10-01' } },
    { id: 'c', status: 'Completed', date: '2026-09-03', fulfilment: { status: 'delivered', promisedDate: '2026-09-30' } },
    { id: 'd', status: 'Cancelled', date: '2026-09-03', fulfilment: { status: 'in_progress', promisedDate: '2026-09-30' } },
    { id: 'e', status: 'Confirmed', date: '2026-09-04' },
  ];
  assert.deepEqual(plain(fulfilment.filterDeliveries(bookings, 'open', '2026-10-16').map((b) => b.id)), ['b', 'a']);
  assert.deepEqual(plain(fulfilment.filterDeliveries(bookings, 'overdue', '2026-10-16').map((b) => b.id)), ['b']);
  assert.deepEqual(plain(fulfilment.filterDeliveries(bookings, 'delivered', '2026-10-16').map((b) => b.id)), ['c']);
  const pub = fulfilment.toPublicFulfilment({ status: 'delivered', internalNotes: 'secret', deliveryLink: 'https://g.example' });
  assert.ok(!JSON.stringify(pub).includes('secret'));
  assert.equal(fulfilment.normalizeDeliveryLink('javascript:alert(1)'), undefined);
  assert.equal(fulfilment.normalizeDeliveryLink('gallery.example/abc'), 'https://gallery.example/abc');
  assert.equal(fulfilment.normalizeFulfilment({ status: 'bogus' }), undefined);
});

test('job money reuses the same records, so nothing is counted twice', () => {
  const booking = { id: 'bk-1', status: 'Confirmed', price: 3600 };
  const invoices = [{ id: 'inv-1', bookingId: 'bk-1', amount: 3600, status: 'Partially Paid', dueDate: '2026-11-19' }];
  const payments = [{ id: 'p1', invoiceId: 'inv-1', amount: 1080, kind: 'deposit', date: '2026-10-20' }];
  const finance = [
    { id: 'f1', type: 'expense', amount: 150, bookingId: 'bk-1', sourceId: 'f1', date: '2026-10-21', category: 'Travel' },
    // The same source twice (a migrated duplicate) counts once, exactly as in Finance.
    { id: 'f1-dup', type: 'expense', amount: 150, bookingId: 'bk-1', sourceId: 'f1', date: '2026-10-21', category: 'Travel' },
    { id: 'f2', type: 'expense', amount: 99, bookingId: 'bk-other', sourceId: 'f2', date: '2026-10-21', category: 'Travel' },
    { id: 'f3', type: 'income', amount: 1080, bookingId: 'bk-1', sourceId: 'p1', date: '2026-10-20', category: 'Invoice deposit' },
  ];
  const summary = money.getBookingFinancialSummary(booking, invoices, payments, finance);
  assert.deepEqual(plain(summary), {
    bookingValue: 3600, collected: 1080, outstanding: 2520, linkedExpenses: 150, linkedExpenseCount: 1,
    projectedMargin: 3450, cashMargin: 930, isCancelled: false,
  });
  const cancelled = money.getBookingFinancialSummary({ ...booking, status: 'Cancelled' }, invoices, payments, finance);
  assert.equal(cancelled.bookingValue, 0);
  assert.equal(cancelled.collected, 1080);
  assert.equal(cancelled.outstanding, 0);
  // Not yet invoiced: outstanding falls back to the booking value.
  assert.equal(money.getBookingFinancialSummary(booking, [], [], []).outstanding, 3600);
});

test('prepared reminder messages follow the language and send nothing', () => {
  const en = messages.buildReminderMessage({ locale: 'en', kind: 'payment', businessName: 'Studio', customerName: 'Siti', bookingTitle: 'Wedding', eventDate: '20 Nov 2026', balanceDue: 'RM 2,520.00', invoiceNumber: 'INV-0004', link: 'https://bookflow.expo.app/b?t=x' });
  assert.match(en, /^Hi Siti,/);
  assert.match(en, /Balance outstanding: RM 2,520.00/);
  assert.match(en, /View details: https:\/\/bookflow/);
  const ms = messages.buildReminderMessage({ locale: 'ms-MY', kind: 'appointment', businessName: 'Studio', customerName: 'Siti', bookingTitle: 'Majlis', eventDate: '20 Nov 2026', location: 'Shah Alam' });
  assert.match(ms, /^Hai Siti,/);
  assert.match(ms, /Lokasi: Shah Alam/);
  const delivery = messages.buildReminderMessage({ locale: 'en', kind: 'delivery', businessName: '', customerName: '', bookingTitle: 'Wedding', eventDate: '', deliveryStatusLabel: 'Delivered', deliveryLink: 'https://g.example' });
  assert.match(delivery, /Delivery link: https:\/\/g.example/);
  assert.equal(messages.toWhatsAppNumber('012-345 6789'), null);
  assert.equal(messages.toWhatsAppNumber('+60 12-345 6789'), '60123456789');
});

test('owner reminders for overdue deliveries and due deposits are written once and respect Clear all', () => {
  const bookings = [
    { id: 'bk-1', title: 'Wedding', status: 'Completed', depositAmount: 500, depositDueDate: '2026-10-10', fulfilment: { status: 'in_progress', promisedDate: '2026-10-12' } },
    { id: 'bk-2', title: 'Paid up', status: 'Confirmed', depositAmount: 100, depositDueDate: '2026-10-10' },
  ];
  const invoices = [{ id: 'inv-2', bookingId: 'bk-2' }];
  const payments = [{ invoiceId: 'inv-2', amount: 100 }];
  const first = workflowReminders.materialiseWorkflowNotifications(bookings, invoices, payments, [], '2026-10-16');
  assert.deepEqual(plain(first.map((n) => n.id)).sort(), ['delivery-overdue-bk-1-2026-10-12', 'deposit-due-bk-1-2026-10-10']);
  const again = workflowReminders.materialiseWorkflowNotifications(bookings, invoices, payments, first, '2026-10-16');
  assert.equal(again, first);
  const cleared = workflowReminders.materialiseWorkflowNotifications(bookings, invoices, payments, [], '2026-10-16', new Date('2026-10-15T00:00:00').getTime());
  assert.equal(cleared.length, 0);
});

test('backups keep charges, deposit terms, delivery tracking and frozen invoice lines — and nothing extra', () => {
  const backup = loadTs('lib/workspace-backup.ts', {}, { '@/context/app-data-context': { getCurrencyFormatter: () => new Intl.NumberFormat('en-US') } });
  const file = JSON.stringify({
    bookflowBackup: true, backupVersion: 1, createdAt: '2026-10-16', appVersion: 'test', workspace: { businessName: 'Studio', currency: 'MYR' },
    data: {
      packages: [{ id: 'pkg-1', name: 'Wedding', details: '', duration: '8 hours', price: 3200, info: '', includedServices: ['200 photos'], addOns: [{ id: 'a1', name: 'Drone', unitPrice: 300, unit: 'session' }], bufferMinutes: 30, secret: 'x' }],
      customers: [], payments: [], financeEntries: [], reminders: [],
      bookings: [{ id: 'bk-1', customerId: 'c', title: 'Wedding', date: '2026-11-20', location: 'KL', packageName: 'Wedding', price: 3300, basePrice: 3200, status: 'Confirmed', notes: '',
        charges: [{ id: 'chg-1', description: 'Parking', quantity: 2, unitPrice: 50, amount: 100 }], depositType: 'percent', depositValue: 30, depositAmount: 990, depositDueDate: '2026-11-01',
        fulfilment: { status: 'in_progress', internalNotes: 'note', deliveryLink: 'javascript:alert(1)' }, injected: 'nope' }],
      invoices: [{ id: 'inv-1', bookingId: 'bk-1', customerId: 'c', amount: 3300, dueDate: '2026-11-19', status: 'Sent', sentAt: '2026-10-16', depositDue: 990,
        lineItems: [{ kind: 'package', description: 'Wedding', quantity: 1, unitPrice: 3200, amount: 3200 }, { kind: 'charge', description: 'Parking', quantity: 2, unitPrice: 50, amount: 100 }] }],
    },
  });
  const parsed = backup.parseWorkspaceBackup(file);
  assert.equal(parsed.ok, true);
  const [pkg] = plain(parsed.backup.data.packages);
  assert.deepEqual(pkg.includedServices, ['200 photos']);
  assert.equal(pkg.addOns[0].unitPrice, 300);
  assert.equal(pkg.secret, undefined);
  const [booking] = plain(parsed.backup.data.bookings);
  assert.equal(booking.basePrice, 3200);
  assert.equal(booking.charges[0].amount, 100);
  assert.equal(booking.depositType, 'percent');
  assert.equal(booking.fulfilment.status, 'in_progress');
  // An unsafe link is dropped on the way in, and unknown keys never survive.
  assert.equal(booking.fulfilment.deliveryLink, undefined);
  assert.equal(booking.injected, undefined);
  const [invoice] = plain(parsed.backup.data.invoices);
  assert.equal(invoice.lineItems.length, 2);
  assert.equal(invoice.depositDue, 990);
});
