const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

function loadInvoiceSearch() {
  const file = path.join(__dirname, '..', 'lib', 'invoice-search.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({}) });
  return exports;
}

const { buildInvoiceSearchIndex, matchesInvoiceSearch } = loadInvoiceSearch();

const invoice = (over = {}) => ({
  id: 'inv-1',
  bookingId: 'bk-1',
  customerId: 'c-1',
  amount: 850,
  dueDate: '2026-09-09',
  sentAt: '2026-09-10',
  status: 'Draft',
  invoiceNumber: 'INV-2026-0039',
  ...over,
});
const booking = { id: 'bk-1', title: 'Wedding reception', packageName: 'Gold package', location: 'Shah Alam', date: '2026-10-03' };

const rahman = buildInvoiceSearchIndex(invoice(), 'Nur Aisyah Rahman', booking);
const finds = (index, term) => matchesInvoiceSearch(index, term);

test('an empty search shows everything', () => {
  assert.equal(finds(rahman, ''), true);
  assert.equal(finds(rahman, '   '), true);
});

test('customer name, from the start of any word and in any case', () => {
  assert.equal(finds(rahman, 'rahman'), true);
  assert.equal(finds(rahman, 'AISY'), true);
  assert.equal(finds(rahman, 'nur aisyah'), true);
  assert.equal(finds(rahman, 'aina'), false);
});

test('dates in the forms people type them', () => {
  for (const term of ['09 Sep 2026', '9 sep', 'Sep 9', 'Sep 9, 2026', '9 September 2026', 'sept', '09/09/2026', '2026-09-09', '10 sep', '3 oct', '3 Oktober']) {
    assert.equal(finds(rahman, term), true, term);
  }
});

test('a day number never matches a different day that merely contains it', () => {
  const nineteenth = buildInvoiceSearchIndex(invoice({ dueDate: '2026-09-19', sentAt: '2026-08-09' }), 'Aina');
  assert.equal(finds(nineteenth, '9 sep'), false);
  assert.equal(finds(nineteenth, '9 sep 2026'), false);
  assert.equal(finds(nineteenth, '09/09/2026'), false);
  assert.equal(finds(nineteenth, '19 sep'), true);
  assert.equal(finds(nineteenth, '9 aug'), true);
});

test('event: service, booking title, package and location', () => {
  assert.equal(finds(rahman, 'wedding'), true);
  assert.equal(finds(rahman, 'gold'), true);
  assert.equal(finds(rahman, 'shah alam'), true);
  assert.equal(finds(buildInvoiceSearchIndex(invoice({ serviceName: 'Engagement shoot' }), 'Aina'), 'engagement'), true);
  assert.equal(finds(rahman, 'birthday'), false);
});

test('the event date comes from the booking when the invoice has none of its own', () => {
  assert.equal(finds(rahman, '03 Oct 2026'), true);
  assert.equal(finds(buildInvoiceSearchIndex(invoice({ eventDate: '2026-11-21' }), 'Aina', booking), '21 nov'), true);
});

test('invoice number, including its short sequence', () => {
  assert.equal(finds(rahman, 'INV-2026-0039'), true);
  assert.equal(finds(rahman, '0039'), true);
  assert.equal(finds(rahman, '39'), true);
});

test('a search can combine customer, event and one date', () => {
  assert.equal(finds(rahman, 'rahman wedding'), true);
  assert.equal(finds(rahman, 'rahman 9 sep'), true);
  assert.equal(finds(rahman, 'wedding oct'), true);
  assert.equal(finds(rahman, 'aina wedding'), false);
  assert.equal(finds(rahman, 'rahman 12 sep'), false);
});
