const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

/** The plan rules are pure, so they load standalone. */
function loadLimits() {
  const file = path.join(__dirname, '..', 'lib', 'plan-limits.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({}), Date, Math });
  return exports;
}

const {
  FREE_LIMITS,
  getPlanLimits,
  getMonthKey,
  getCustomerUsage,
  getMonthlyBookingUsage,
  getMonthlyInvoiceUsage,
  canCreateCustomer,
  canCreateBooking,
  canCreateInvoice,
  LIMIT_COPY,
} = loadLimits();

const NOW = new Date('2026-09-15T12:00:00');
const customers = (count) => Array.from({ length: count }, (_, index) => ({ id: `cust-${index}`, createdAt: '2026-09-01' }));
const booking = (id, createdAt) => ({ id, createdAt, status: 'Confirmed' });
const invoice = (id, sentAt, over = {}) => ({ id, sentAt, ...over });

test('the Free plan is 5 clients, 5 bookings and 3 invoices per month; Pro is unlimited', () => {
  assert.deepEqual({ ...FREE_LIMITS }, { customers: 5, bookingsPerMonth: 5, invoicesPerMonth: 3 });
  assert.deepEqual({ ...getPlanLimits(false) }, { customers: 5, bookingsPerMonth: 5, invoicesPerMonth: 3 });
  assert.deepEqual({ ...getPlanLimits(true) }, { customers: null, bookingsPerMonth: null, invoicesPerMonth: null });
});

test('Free customers: the fifth is allowed, the sixth is not', () => {
  assert.equal(canCreateCustomer(false, customers(4)).allowed, true);
  assert.equal(canCreateCustomer(false, customers(5)).allowed, false);
  const blocked = canCreateCustomer(false, customers(5));
  assert.deepEqual({ kind: blocked.kind, used: blocked.used, limit: blocked.limit }, { kind: 'customers', used: 5, limit: 5 });
});

test('Free bookings: the fifth is allowed, the sixth is not', () => {
  const made = (count) => Array.from({ length: count }, (_, index) => booking(`bk-${index}`, '2026-09-04'));
  assert.equal(canCreateBooking(false, made(4), NOW).allowed, true);
  assert.equal(canCreateBooking(false, made(5), NOW).allowed, false);
});

test('Free invoices: the third is allowed, the fourth is not', () => {
  const made = (count) => Array.from({ length: count }, (_, index) => invoice(`inv-${index}`, '2026-09-04'));
  assert.equal(canCreateInvoice(false, made(2), NOW).allowed, true);
  assert.equal(canCreateInvoice(false, made(3), NOW).allowed, false);
});

test('Pro passes every limit', () => {
  const manyBookings = Array.from({ length: 40 }, (_, index) => booking(`bk-${index}`, '2026-09-04'));
  const manyInvoices = Array.from({ length: 40 }, (_, index) => invoice(`inv-${index}`, '2026-09-04'));
  assert.equal(canCreateCustomer(true, customers(50)).allowed, true);
  assert.equal(canCreateBooking(true, manyBookings, NOW).allowed, true);
  assert.equal(canCreateInvoice(true, manyInvoices, NOW).allowed, true);
});

test('last month never spends this month’s allowance', () => {
  const lastMonth = Array.from({ length: 9 }, (_, index) => booking(`bk-${index}`, '2026-08-20'));
  assert.equal(getMonthlyBookingUsage(lastMonth, NOW), 0);
  assert.equal(canCreateBooking(false, lastMonth, NOW).allowed, true);
});

test('month boundaries are read in local time, not UTC', () => {
  // 00:05 on the 1st in Malaysia is still 31 August in UTC. Counting in UTC would carry August's
  // records into September and start the month with its allowance spent.
  const firstMinute = new Date(2026, 8, 1, 0, 5);
  const lastMinute = new Date(2026, 8, 30, 23, 59);
  assert.equal(getMonthKey(firstMinute), '2026-09');
  assert.equal(getMonthKey(lastMinute), '2026-09');
  assert.equal(getMonthKey(new Date(2026, 7, 31, 23, 59)), '2026-08');

  const augustLate = [booking('bk-1', '2026-08-31')];
  assert.equal(getMonthlyBookingUsage(augustLate, firstMinute), 0);
  const septemberEarly = [booking('bk-2', '2026-09-01')];
  assert.equal(getMonthlyBookingUsage(septemberEarly, firstMinute), 1);
  assert.equal(getMonthlyBookingUsage(septemberEarly, lastMinute), 1);
});

test('a cancelled booking still counts, so cancelling cannot buy another', () => {
  const made = [
    booking('bk-1', '2026-09-02'),
    { ...booking('bk-2', '2026-09-03'), status: 'Cancelled' },
    booking('bk-3', '2026-09-04'),
    booking('bk-4', '2026-09-05'),
    booking('bk-5', '2026-09-06'),
  ];
  assert.equal(getMonthlyBookingUsage(made, NOW), 5);
  assert.equal(canCreateBooking(false, made, NOW).allowed, false);
});

test('a trashed invoice still counts, and restoring it does not count it twice', () => {
  const trashed = [
    invoice('inv-1', '2026-09-02'),
    invoice('inv-2', '2026-09-03', { deletedAt: '2026-09-04' }),
    invoice('inv-3', '2026-09-05'),
  ];
  assert.equal(getMonthlyInvoiceUsage(trashed, NOW), 3);
  assert.equal(canCreateInvoice(false, trashed, NOW).allowed, false);

  const restored = trashed.map((item) => ({ ...item, deletedAt: undefined }));
  assert.equal(getMonthlyInvoiceUsage(restored, NOW), 3);
});

test('a legacy record with no date field falls back to the timestamp in its id', () => {
  const septemberMs = new Date(2026, 8, 4, 9, 0).getTime();
  const augustMs = new Date(2026, 7, 4, 9, 0).getTime();
  assert.equal(getMonthlyBookingUsage([{ id: `bk-${septemberMs}`, status: 'Confirmed' }], NOW), 1);
  assert.equal(getMonthlyBookingUsage([{ id: `bk-${augustMs}`, status: 'Confirmed' }], NOW), 0);
  // Nothing readable at all is not counted rather than guessed into the current month.
  assert.equal(getMonthlyBookingUsage([{ id: 'bk-legacy', status: 'Confirmed' }], NOW), 0);
});

test('deleting a customer frees the allowance, and existing records are never hidden', () => {
  const five = customers(5);
  assert.equal(canCreateCustomer(false, five).allowed, false);
  assert.equal(getCustomerUsage(five.slice(0, 4)), 4);
  assert.equal(canCreateCustomer(false, five.slice(0, 4)).allowed, true);
});

test('the upgrade copy names the real limits', () => {
  assert.match(LIMIT_COPY.customers.body, /limit of 5 clients/);
  assert.match(LIMIT_COPY.bookings.body, /your 5 Free bookings this month/);
  assert.match(LIMIT_COPY.invoices.body, /your 3 Free invoices this month/);
  assert.equal(LIMIT_COPY.customers.title, 'Ready for more clients?');
  assert.equal(LIMIT_COPY.bookings.title, 'Your business is growing');
  assert.equal(LIMIT_COPY.invoices.title, 'Keep your business moving');
});
