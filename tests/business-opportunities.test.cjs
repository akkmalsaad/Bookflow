const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

/** Loads the real insights module and the real financial helpers it calculates revenue with. */
function loadInsights() {
  const cache = {};
  const load = (file) => {
    if (cache[file]) return cache[file];
    const exports = (cache[file] = {});
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(code, {
      exports,
      require(name) {
        if (name.endsWith('/financial-metrics')) return load('lib/financial-metrics.ts');
        if (name.endsWith('/invoice-payments')) return load('lib/invoice-payments.ts');
        if (name.endsWith('/invoice-lifecycle')) return load('lib/invoice-lifecycle.ts');
        return {};
      },
      Intl,
      Date,
      Math,
    });
    return exports;
  };
  return load('lib/business-insights.ts');
}

const { calculateBusinessInsights } = loadInsights();

const NOW = new Date('2026-09-15T12:00:00');
const format = (amount) => `RM${Math.round(amount).toLocaleString('en-US')}`;

const booking = (id, over = {}) => ({
  id, createdAt: '2026-09-02', customerId: 'cus-1', title: 'Job', date: '2026-09-20',
  startTime: '10:00', endTime: '12:00', location: 'Studio', packageName: 'Wedding Package',
  price: 1000, status: 'Confirmed', notes: '', ...over,
});
const invoice = (id, over = {}) => ({
  id: `inv-${id}`, bookingId: `bk-${id}`, customerId: 'cus-1', amount: 1000, dueDate: '2026-09-25',
  status: 'Sent', sentAt: '2026-09-02', serviceName: 'Wedding Package', ...over,
});
const payment = (id, over = {}) => ({
  id, invoiceId: `inv-${id}`, amount: 1000, method: 'Bank', date: '2026-09-05',
  kind: 'payment', recordedAt: '2026-09-05T00:00:00.000Z', ...over,
});
const customer = (id, over = {}) => ({ id, createdAt: '2026-09-01', name: `Client ${id}`, email: `${id}@x.my`, phone: '', location: '', notes: '', ...over });

const run = ({ bookings = [], invoices = [], payments = [], customers = [], financeEntries = [], period = 'this-month' } = {}) =>
  calculateBusinessInsights({ period, financeEntries, bookings, customers, invoices, payments, formatCurrency: format, now: NOW });

const ids = (metrics) => metrics.opportunities.map((item) => item.id);
const messageFor = (metrics, id) => metrics.opportunities.find((item) => item.id === id)?.message;

test('no data produces no opportunities, so the neutral empty state shows', () => {
  assert.equal(run().opportunities.length, 0);
});

test('a single booking never produces a share-based recommendation', () => {
  const metrics = run({
    bookings: [booking('bk-a')],
    invoices: [invoice('a', { bookingId: 'bk-a' })],
    payments: [payment('a', { invoiceId: 'inv-a' })],
    customers: [customer('cus-1')],
  });
  assert.equal(ids(metrics).includes('opportunity-top-service'), false);
  assert.equal(ids(metrics).includes('opportunity-top-clients'), false);
});

test('A: a dominant service is promoted once there are several services and payments', () => {
  const metrics = run({
    bookings: [booking('bk-a'), booking('bk-b'), booking('bk-c', { packageName: 'Family Session' })],
    invoices: [
      invoice('a', { bookingId: 'bk-a' }),
      invoice('b', { bookingId: 'bk-b' }),
      invoice('c', { bookingId: 'bk-c', serviceName: 'Family Session', amount: 300 }),
    ],
    payments: [payment('a', { invoiceId: 'inv-a' }), payment('b', { invoiceId: 'inv-b' }), payment('c', { invoiceId: 'inv-c', amount: 300 })],
    customers: [customer('cus-1')],
  });
  assert.match(messageFor(metrics, 'opportunity-top-service'), /^Promote Wedding Package — it generated 87% of your booking-linked revenue\.$/);
});

test('D: outstanding balances are reported with their real amount and invoice count', () => {
  const metrics = run({
    bookings: [booking('bk-a')],
    invoices: [invoice('a', { bookingId: 'bk-a', amount: 1000 }), invoice('b', { bookingId: 'bk-b', amount: 500 })],
    payments: [],
    customers: [customer('cus-1')],
  });
  assert.equal(messageFor(metrics, 'opportunity-outstanding'), 'RM1,500 is still outstanding across 2 invoices. Following up could improve cash flow.');
});

test('E: upcoming bookings without a deposit are counted from the payment records', () => {
  const withDeposit = run({
    bookings: [booking('bk-a', { date: '2026-09-20' })],
    invoices: [invoice('a', { bookingId: 'bk-a' })],
    payments: [payment('a', { invoiceId: 'inv-a', kind: 'deposit', amount: 300 })],
    customers: [customer('cus-1')],
  });
  assert.equal(ids(withDeposit).includes('opportunity-deposits'), false);

  const withoutDeposit = run({
    bookings: [booking('bk-a', { date: '2026-09-20' }), booking('bk-b', { date: '2026-09-21' })],
    invoices: [invoice('a', { bookingId: 'bk-a' }), invoice('b', { bookingId: 'bk-b' })],
    payments: [],
    customers: [customer('cus-1')],
  });
  assert.equal(messageFor(withoutDeposit, 'opportunity-deposits'), '2 upcoming bookings have no deposit recorded.');
});

test('a past booking is not counted as an upcoming one missing its deposit', () => {
  const metrics = run({
    bookings: [booking('bk-a', { date: '2026-09-01' })],
    invoices: [invoice('a', { bookingId: 'bk-a' })],
    payments: [],
    customers: [customer('cus-1')],
  });
  assert.equal(ids(metrics).includes('opportunity-deposits'), false);
});

test('cancelled bookings are ignored everywhere', () => {
  const metrics = run({
    bookings: [booking('bk-a', { status: 'Cancelled', date: '2026-09-20' })],
    invoices: [],
    payments: [],
    customers: [customer('cus-1')],
  });
  assert.equal(ids(metrics).includes('opportunity-deposits'), false);
});

test('a deleted invoice stops counting towards outstanding or attribution', () => {
  const metrics = run({
    bookings: [booking('bk-a')],
    invoices: [invoice('a', { bookingId: 'bk-a', deletedAt: '2026-09-03' })],
    payments: [],
    customers: [customer('cus-1')],
  });
  assert.equal(ids(metrics).includes('opportunity-outstanding'), false);
});

test('H: revenue concentrated in a few clients, only with enough clients to compare', () => {
  const many = { bookings: [], invoices: [], payments: [], customers: [] };
  const amounts = [5000, 4000, 3000, 200, 150];
  amounts.forEach((amount, index) => {
    const key = `c${index}`;
    many.customers.push(customer(key));
    many.bookings.push(booking(`bk-${key}`, { customerId: key }));
    many.invoices.push(invoice(key, { bookingId: `bk-${key}`, customerId: key, amount }));
    many.payments.push(payment(key, { invoiceId: `inv-${key}`, amount }));
  });
  assert.match(messageFor(run(many), 'opportunity-top-clients'), /^Your top 3 clients generated 97% of revenue\./);
});

test('B and C: repeat clients and clients with nothing booked ahead', () => {
  const metrics = run({
    bookings: [
      booking('bk-1', { customerId: 'c1', date: '2026-09-05' }),
      booking('bk-2', { customerId: 'c1', date: '2026-09-06' }),
      booking('bk-3', { customerId: 'c2', date: '2026-09-07' }),
      booking('bk-4', { customerId: 'c2', date: '2026-09-08' }),
    ],
    customers: [customer('c1'), customer('c2')],
  });
  assert.equal(messageFor(metrics, 'opportunity-repeat-clients'), '2 clients have booked you more than once. Consider offering a repeat-client package.');
  assert.equal(messageFor(metrics, 'opportunity-reengage'), '2 past clients have no upcoming booking. Consider following up with them.');
});

test('G: a busy weekday is named only once there are enough events', () => {
  const saturdays = ['2026-07-04', '2026-07-11', '2026-08-01', '2026-08-08'];
  const others = ['2026-07-07', '2026-07-08'];
  const bookings = [...saturdays, ...others].map((date, index) => booking(`bk-${index}`, { date, createdAt: date }));
  assert.equal(messageFor(run({ bookings, customers: [customer('cus-1')], period: 'this-year' }), 'opportunity-busy-day'),
    'Most bookings happen on Saturday. Consider protecting or expanding availability during this period.');

  // Three events is not a pattern.
  const tooFew = saturdays.slice(0, 3).map((date, index) => booking(`bk-${index}`, { date, createdAt: date }));
  assert.equal(ids(run({ bookings: tooFew, customers: [customer('cus-1')], period: 'this-year' })).includes('opportunity-busy-day'), false);
});

test('at most three opportunities are shown, strongest first', () => {
  const data = { bookings: [], invoices: [], payments: [], customers: [] };
  ['c1', 'c2', 'c3', 'c4'].forEach((key, index) => {
    data.customers.push(customer(key));
    data.bookings.push(booking(`bk-${key}a`, { customerId: key, date: '2026-09-05' }));
    data.bookings.push(booking(`bk-${key}b`, { customerId: key, date: '2026-09-20' }));
    data.invoices.push(invoice(key, { bookingId: `bk-${key}a`, customerId: key, amount: 4000 - index * 900 }));
    data.payments.push(payment(key, { invoiceId: `inv-${key}`, amount: 4000 - index * 900 }));
  });
  data.invoices.push(invoice('unpaid', { bookingId: 'bk-none', amount: 2000 }));

  const metrics = run(data);
  assert.equal(metrics.opportunities.length, 3);
  assert.equal(ids(metrics).join(','), 'opportunity-outstanding,opportunity-deposits,opportunity-top-clients');
});

test('the period selector changes which records are counted', () => {
  const data = {
    bookings: [booking('bk-a', { createdAt: '2026-08-10', date: '2026-08-12' })],
    invoices: [invoice('a', { bookingId: 'bk-a', amount: 900, dueDate: '2026-08-20', sentAt: '2026-08-10' })],
    payments: [],
    customers: [customer('cus-1', { createdAt: '2026-08-01' })],
  };
  assert.equal(ids(run({ ...data, period: 'this-month' })).includes('opportunity-outstanding'), false);
  assert.equal(messageFor(run({ ...data, period: 'last-month' }), 'opportunity-outstanding'),
    'RM900 is still outstanding across 1 invoice. Following up could improve cash flow.');
  assert.equal(ids(run({ ...data, period: 'this-year' })).includes('opportunity-outstanding'), true);
});
