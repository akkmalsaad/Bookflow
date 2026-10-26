const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.BOOKFLOW_PGLITE_PATH || '@electric-sql/pglite');
const { loadTs, plain } = require('./helpers/load-ts.cjs');

/**
 * Booking card: payment (read-only, from the linked invoice and its payment records) and job status
 * (the booking's own field) shown side by side, and kept independent.
 */
const jobFinancials = loadTs('lib/job-financials.ts');
const invoicePayments = loadTs('lib/invoice-payments.ts');
const bookingStatus = loadTs('lib/booking-status.ts');
const project = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(project, file), 'utf8');

const booking = (id, over = {}) => ({ id, customerId: 'cust-1', title: 'Wedding', date: '2026-11-20', price: 3000, status: 'Confirmed', notes: '', ...over });
const invoice = (id, bookingId, over = {}) => ({ id, bookingId, customerId: 'cust-1', amount: 3000, dueDate: '2026-11-19', sentAt: '2026-10-01', status: 'Accepted', ...over });
const pay = (id, invoiceId, amount, kind = 'payment') => ({ id, invoiceId, amount, kind, method: 'Bank transfer', date: '2026-10-05', recordedAt: '2026-10-05T00:00:00Z' });
const card = (invoices, payments = [], bookingId = 'bk-1') => plain(jobFinancials.getBookingInvoicePayment(bookingId, invoices, payments));

test('unpaid, deposit paid, partially paid and paid in full come from the invoice and its payments', () => {
  const inv = invoice('inv-1', 'bk-1');
  assert.deepEqual(card([inv]), { invoiceTotal: 3000, amountPaid: 0, balance: 3000, state: 'unpaid' });
  assert.deepEqual(card([inv], [pay('p1', 'inv-1', 900, 'deposit')]), { invoiceTotal: 3000, amountPaid: 900, balance: 2100, state: 'deposit_paid' });
  // A partial payment not recorded as a deposit — or a deposit plus a further payment — is "Partially paid".
  assert.equal(card([inv], [pay('p1', 'inv-1', 500)]).state, 'partially_paid');
  assert.equal(card([inv], [pay('p1', 'inv-1', 900, 'deposit'), pay('p2', 'inv-1', 500)]).state, 'partially_paid');
  assert.deepEqual(card([inv], [pay('p1', 'inv-1', 900, 'deposit'), pay('p2', 'inv-1', 2100)]), { invoiceTotal: 3000, amountPaid: 3000, balance: 0, state: 'paid' });
  // Settled by hand ("Payment done") with no records, as on the invoice screen.
  assert.equal(card([invoice('inv-1', 'bk-1', { status: 'Paid' })]).state, 'paid');
  // Sen-safe: three thirds settle exactly.
  const thirds = [pay('a', 'inv-1', 1000), pay('b', 'inv-1', 1000), pay('c', 'inv-1', 1000)];
  assert.equal(card([inv], thirds).balance, 0);
});

test('uses the invoice screen’s own calculation for each invoice', () => {
  const inv = invoice('inv-1', 'bk-1', { amount: 1234.56 });
  const payments = [pay('p1', 'inv-1', 200.1, 'deposit'), pay('p2', 'inv-1', 34.46)];
  const summary = invoicePayments.getInvoicePaymentSummary(inv, payments);
  const shown = card([inv], payments);
  assert.equal(shown.invoiceTotal, summary.totalAmount);
  assert.equal(shown.amountPaid, summary.amountPaid);
  assert.equal(shown.balance, summary.outstanding);
});

test('no linked open invoice reads "No invoice" (null), never a zero total', () => {
  assert.equal(card([]), null);
  assert.equal(card([invoice('inv-x', 'bk-other')]), null, 'another booking’s invoice is never borrowed');
  for (const status of ['Cancelled', 'Declined', 'Void']) {
    assert.equal(card([invoice('inv-1', 'bk-1', { status })], [pay('p1', 'inv-1', 500)]), null, status);
  }
  assert.equal(card([invoice('inv-1', 'bk-1', { deletedAt: '2026-10-20T00:00:00Z' })]), null);
  // A draft is a real linked invoice with a real total.
  assert.equal(card([invoice('inv-1', 'bk-1', { status: 'Draft' })]).state, 'unpaid');
});

test('several linked invoices follow the existing rule: open ones are summed by bookingId', () => {
  const invoices = [
    invoice('inv-a', 'bk-1', { amount: 1000 }),
    invoice('inv-b', 'bk-1', { amount: 2000 }),
    invoice('inv-void', 'bk-1', { amount: 5000, status: 'Void' }),
    invoice('inv-other', 'bk-2', { amount: 9999 }),
  ];
  const payments = [pay('p1', 'inv-a', 1000), pay('p2', 'inv-other', 9999)];
  assert.deepEqual(card(invoices, payments), { invoiceTotal: 3000, amountPaid: 1000, balance: 2000, state: 'partially_paid' });
  // The booking's outstanding balance in its details sheet agrees.
  const summary = jobFinancials.getBookingFinancialSummary(booking('bk-1'), invoices, payments, []);
  assert.equal(summary.outstanding, 2000);
});

test('job status and payment are independent', () => {
  const inv = invoice('inv-1', 'bk-1');
  // The payment badge is derived without the booking at all, so no job status can move it.
  assert.equal(jobFinancials.getBookingInvoicePayment.length, 3);

  // A completed job can still owe money.
  const completed = [booking('bk-1', { status: 'Completed' })];
  const deposit = [pay('p1', 'inv-1', 900, 'deposit')];
  assert.equal(bookingStatus.syncBookingStatuses(completed, [inv], deposit), completed);
  assert.equal(card([inv], deposit).balance, 2100);

  // A fully paid job stays In Progress: recording payment never completes the job.
  const inProgress = [booking('bk-1', { status: 'In Progress' })];
  const full = [pay('p1', 'inv-1', 3000)];
  assert.equal(bookingStatus.syncBookingStatuses(inProgress, [inv], full), inProgress);
  assert.equal(card([inv], full).state, 'paid');
  const confirmed = [booking('bk-1', { status: 'Confirmed' })];
  assert.equal(bookingStatus.syncBookingStatuses(confirmed, [inv], full)[0].status, 'Confirmed');

  // Changing job status writes the booking's status only — no invoice, acceptance or payment.
  const context = read('context/app-data-context.tsx');
  const start = context.indexOf("updateBookingStatus: (bookingId: string, status: Booking['status']) => {");
  assert.ok(start > 0);
  const body = context.slice(start, context.indexOf('addInvoice: (invoice', start));
  assert.match(body, /\{ \.\.\.item, status \}/);
  assert.equal(/setInvoices|setPayments|setFinanceEntries|invoice/i.test(body.replace(/updateBookingStatus/, '')), false);
});

test('the card saves job status through the confirmed workspace save, and rolls back on failure', () => {
  const screen = read('app/(tabs)/bookings.tsx');
  const start = screen.indexOf('const handleStatusSelect = async');
  const body = screen.slice(start, screen.indexOf('const deliveryBookings', start));
  assert.match(body, /if \(!bookingId \|\| savingStatusRef\.current\) return;/, 'a second change is ignored while saving');
  const save = body.indexOf('await confirmWorkspaceSave()');
  assert.ok(save > 0);
  assert.ok(body.indexOf("captureEvent('booking_status_updated'") > save, 'only counted once the save has landed');
  assert.match(body, /catch \{\s*if \(previous\) updateBookingStatus\(bookingId, previous\);\s*showSnackbar\(\{ message: t\('bookings\.error\.status'\), tone: 'danger' \}\);/);
  // The card shows the pill as busy and blocks every other job status change meanwhile.
  assert.match(screen, /isSavingJobStatus=\{savingStatusBookingId === item\.id\}/);
  assert.match(screen, /jobStatusDisabled=\{statusBookingId !== null \|\| savingStatusBookingId !== null\}/);
  // Payment is recomputed from the live invoices and payments on every render.
  assert.match(screen, /payment=\{getBookingInvoicePayment\(item\.id, invoices, payments\)\}/);
});

test('the footer is read-only for payment, wraps rather than clips, and stacks on small or large-text screens', () => {
  const footer = read('components/booking/BookingCardStatusFooter.tsx');
  assert.equal(/numberOfLines/.test(footer), false);
  assert.match(footer, /const stacked = fontScale >= 1\.3 \|\| width < 350;/);
  // The payment badge is a plain View/Text; only job status has a control.
  assert.equal((footer.match(/onPress/g) ?? []).length, 1);
  assert.equal(/Pressable/.test(footer), false);
});

/** WCAG relative luminance contrast ratio of two #RRGGBB colours. */
function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, b2] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('payment badges are readable in light and dark mode', () => {
  const footer = read('components/booking/BookingCardStatusFooter.tsx');
  const pairs = [...footer.matchAll(/(light|dark): \{ background: '(#[0-9A-F]{6})', text: '(#[0-9A-F]{6})' \}/g)];
  assert.equal(pairs.length, 12, 'four payment states and two form states × two themes');
  for (const [, theme, background, text] of pairs) {
    assert.ok(contrast(background, text) >= 4.5, `${theme} ${text} on ${background}: ${contrast(background, text).toFixed(2)}`);
  }
  assert.match(footer, /const theme = isDarkMode \? 'dark' : 'light';/);
  assert.match(footer, /PAYMENT_BADGE_COLORS\[payment\.state\]\[theme\]/);
});

test('"No invoice" only without any linked invoice; all-closed reads "No active invoice"', () => {
  assert.equal(jobFinancials.hasLinkedInvoice('bk-1', []), false);
  assert.equal(jobFinancials.hasLinkedInvoice('bk-1', [invoice('inv-x', 'bk-2')]), false);
  assert.equal(jobFinancials.hasLinkedInvoice('bk-1', [invoice('inv-1', 'bk-1', { deletedAt: '2026-10-20T00:00:00Z' })]), false);
  for (const status of ['Cancelled', 'Declined', 'Void']) {
    const closed = [invoice('inv-1', 'bk-1', { status })];
    assert.equal(jobFinancials.hasLinkedInvoice('bk-1', closed), true, status);
    assert.equal(card(closed), null, `${status}: no payable total or balance`);
  }
  const footer = read('components/booking/BookingCardStatusFooter.tsx');
  assert.match(footer, /t\(hasLinkedInvoice \? 'bk\.card\.noActiveInvoice' : isForm \? 'bk\.card\.noInvoiceYet' : 'bk\.card\.noInvoice'\)/);
  assert.match(read('app/(tabs)/bookings.tsx'), /hasLinkedInvoice=\{hasLinkedInvoice\(item\.id, invoices\)\}/);
});

test('recording, updating or removing payments never changes job progress, on any entry path', () => {
  // Every payment path (record payment, deposit edit, mark paid, permanent delete, backup restore)
  // writes payments and then the invoice status through resolveInvoiceStatus. Sync is the only thing
  // that moves a booking automatically, so: for every stored status, every payment change, the
  // booking synced before the change is exactly the booking synced after it.
  const stored = ['Inquiry', 'Confirmed', 'Deposit Paid', 'In Progress', 'Completed', 'Cancelled'];
  const invoiceStatuses = ['Draft', 'Sent', 'Accepted', 'Overdue', 'Partially Paid', 'Paid'];
  const changes = [[], [pay('d', 'inv-1', 900, 'deposit')], [pay('p', 'inv-1', 500)], [pay('d', 'inv-1', 900, 'deposit'), pay('p', 'inv-1', 2100)]];
  for (const status of stored) {
    for (const invoiceStatus of invoiceStatuses) {
      const before = invoice('inv-1', 'bk-1', { status: invoiceStatus });
      const settled = bookingStatus.syncBookingStatuses([booking('bk-1', { status })], [before]);
      for (const payments of changes) {
        const paidCents = payments.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
        const after = { ...before, status: invoicePayments.resolveInvoiceStatus(before, paidCents) };
        assert.notEqual(after.status === 'Accepted' && before.status !== 'Accepted', true, 'a payment never produces an acceptance');
        const synced = bookingStatus.syncBookingStatuses(settled, [after], payments);
        assert.equal(synced, settled, `${status} / ${invoiceStatus} / ${payments.length} payment(s)`);
      }
    }
  }
  // Payments are not even an input: the context's sync no longer re-runs when they change.
  const context = read('context/app-data-context.tsx');
  assert.match(context, /setBookings\(\(current\) => syncBookingStatuses\(current, allInvoices\)\);\s*\}, \[allInvoices, bookings\]\);/);
  assert.equal(bookingStatus.syncBookingStatuses.length, 2);
});

test('legacy "Deposit Paid" is kept and labelled until a stage is picked; it is not selectable', () => {
  assert.deepEqual(plain(bookingStatus.BOOKING_STATUS_ORDER), ['Inquiry', 'Confirmed', 'In Progress', 'Completed', 'Cancelled']);
  assert.equal(bookingStatus.resolveBookingStatus('Deposit Paid'), 'Deposit Paid', 'not silently shown as Inquiry or Confirmed');
  assert.equal(bookingStatus.isLegacyBookingStatus('Deposit Paid'), true);
  assert.equal(bookingStatus.getBookingStatusLabelKey('Deposit Paid'), 'jobStatus.legacyDepositPaid');
  // Not bulk-converted: an accepted invoice, a deposit and a full payment all leave it as stored.
  const legacy = [booking('bk-1', { status: 'Deposit Paid' })];
  assert.equal(bookingStatus.syncBookingStatuses(legacy, [invoice('inv-1', 'bk-1', { status: 'Accepted' })]), legacy);
  // The other stages keep their own labels and behaviour.
  for (const status of bookingStatus.BOOKING_STATUS_ORDER) {
    assert.equal(bookingStatus.getBookingStatusLabelKey(status), `status.booking.${status}`);
  }
  assert.equal(bookingStatus.syncBookingStatuses([booking('bk-1', { status: 'Inquiry' })], [invoice('inv-1', 'bk-1', { status: 'Accepted' })])[0].status, 'Confirmed');
  // The picker shows a note and no checked row for a legacy status.
  const sheet = read('components/booking/JobStatusSheet.tsx');
  assert.match(sheet, /\{isLegacy \? \(/);
  assert.match(sheet, /t\('jobStatus\.legacyNote'\)/);
});

test('job status labels are translated; stored values are not', () => {
  const i18n = loadTs('lib/i18n.ts');
  const expected = {
    Inquiry: ['Inquiry', 'Pertanyaan'], Confirmed: ['Confirmed', 'Disahkan'], 'In Progress': ['In Progress', 'Sedang berjalan'],
    Completed: ['Completed', 'Selesai'], Cancelled: ['Cancelled', 'Dibatalkan'], 'Deposit Paid': ['Deposit Paid (legacy)', 'Deposit dibayar (lama)'],
  };
  for (const [status, [en, ms]] of Object.entries(expected)) {
    const key = bookingStatus.getBookingStatusLabelKey(status);
    assert.equal(i18n.translate('en', key), en);
    assert.equal(i18n.translate('ms-MY', key), ms);
  }
  for (const file of ['components/booking/JobStatusPill.tsx', 'components/booking/JobStatusSheet.tsx']) {
    const source = read(file);
    assert.match(source, /t\(getBookingStatusLabelKey\(/, file);
    assert.equal(/\{visual\.label\}/.test(source), false, `${file} renders the translated label`);
  }
});

test('English and Malay labels exist for every new string', () => {
  const i18n = loadTs('lib/i18n.ts');
  const keys = ['bk.card.invoiceTotal', 'bk.card.payment', 'bk.card.jobStatus', 'bk.card.balance', 'bk.card.noInvoice', 'bk.card.noActiveInvoice',
    'jobStatus.legacyNote', 'jobStatus.pillLabel', 'jobStatus.pillHint', 'jobStatus.cancelHint',
    'bk.pay.unpaid', 'bk.pay.deposit_paid', 'bk.pay.partially_paid', 'bk.pay.paid'];
  for (const key of keys) {
    const en = i18n.translate('en', key, { amount: 'RM1.00' });
    const ms = i18n.translate('ms-MY', key, { amount: 'RM1.00' });
    assert.ok(en && en !== key, `en ${key}`);
    assert.ok(ms && ms !== key && ms !== en, `ms ${key}`);
  }
  assert.equal(i18n.translate('en', 'bk.card.balance', { amount: 'RM2,100.00' }), 'Balance RM2,100.00');
  assert.equal(i18n.translate('ms-MY', 'bk.card.balance', { amount: 'RM2,100.00' }), 'Baki RM2,100.00');
});

// --- Persistence: a job status change is part of the one workspace document, and survives a reload.

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

test('after reload the new job status is kept and the payment badge is unchanged', async () => {
  const before = { bookings: [booking('bk-1')], invoices: [invoice('inv-1', 'bk-1')], payments: [pay('p1', 'inv-1', 900, 'deposit')] };
  await db.exec('reset role; delete from bookflow_workspaces;');
  await db.query('insert into bookflow_workspaces(user_id, data) values ($1, $2)', ['owner-a', JSON.stringify(before)]);

  const after = { ...before, bookings: [{ ...before.bookings[0], status: 'Completed' }] };
  await db.exec(`reset role; set role authenticated; set request.jwt.claims = '{"sub":"owner-a"}'`);
  await db.query(`insert into bookflow_workspaces(user_id, data) values ('owner-a', $1)
    on conflict (user_id) do update set data = excluded.data, updated_at = now()`, [JSON.stringify(after)]);

  await db.exec('reset role');
  const loaded = (await db.query(`select data from bookflow_workspaces where user_id = 'owner-a'`)).rows[0].data;
  assert.equal(loaded.bookings[0].status, 'Completed');
  assert.deepEqual(loaded.invoices, before.invoices);
  assert.deepEqual(loaded.payments, before.payments);
  // The load-time status sync only moves forward, so it never pulls Completed back.
  assert.equal(bookingStatus.syncBookingStatuses(loaded.bookings, loaded.invoices, loaded.payments), loaded.bookings);
  assert.deepEqual(card(loaded.invoices, loaded.payments), card(before.invoices, before.payments));
});
