const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

function loadPricing() {
  const file = path.join(__dirname, '..', 'lib', 'booking-pricing.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({}), Math, Number, Date, String, Array, Intl });
  return exports;
}

const pricing = loadPricing();
const {
  chargeAmountCents,
  validateChargeDraft,
  normalizeCharges,
  calculateBookingTotals,
  getBookingBasePrice,
  getBookingDepositTerms,
  resolveDepositCents,
  validateDepositTerms,
  buildPricedLines,
  parseQuantityInput,
  parseMoneyInput,
} = pricing;

const charge = (quantity, unitPrice, description = 'Transport') => {
  const result = validateChargeDraft({ description, quantity, unitPrice }, () => 'chg-test');
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.charge;
};

test('charge amounts are worked in cents with no floating-point drift', () => {
  assert.equal(chargeAmountCents(3, 33.33), 9999);
  assert.equal(chargeAmountCents(1.5, 80), 12000);
  assert.equal(chargeAmountCents(0.1, 0.3), 3);
  // 0.1 + 0.2 style traps: ten charges of RM 0.10 sum to exactly RM 1.00.
  const tenDimes = Array.from({ length: 10 }, () => charge(1, 0.1));
  assert.equal(calculateBookingTotals({ basePrice: 0, charges: tenDimes }).chargesCents, 100);
});

test('quantities and prices are validated', () => {
  assert.equal(validateChargeDraft({ description: '', quantity: '1', unitPrice: '10' }).error, 'description');
  assert.equal(validateChargeDraft({ description: 'x'.repeat(121), quantity: '1', unitPrice: '10' }).error, 'description');
  assert.equal(validateChargeDraft({ description: 'Parking', quantity: '0', unitPrice: '10' }).error, 'quantity');
  assert.equal(validateChargeDraft({ description: 'Parking', quantity: '-1', unitPrice: '10' }).error, 'quantity');
  assert.equal(validateChargeDraft({ description: 'Parking', quantity: '1.234', unitPrice: '10' }).error, 'quantity');
  assert.equal(validateChargeDraft({ description: 'Parking', quantity: '1', unitPrice: '0' }).error, 'price');
  assert.equal(validateChargeDraft({ description: 'Parking', quantity: '1', unitPrice: 'abc' }).error, 'price');
  assert.equal(validateChargeDraft({ description: 'Parking', quantity: '1', unitPrice: '-5' }).error, 'price');
  assert.equal(parseQuantityInput('10000'), null);
  assert.equal(parseMoneyInput('1,250.50'), 1250.5);
  const ok = validateChargeDraft({ description: ' Extra hours ', quantity: '1.5', unitPrice: '200', unit: 'hour' }, () => 'chg-1');
  assert.deepEqual({ ...ok.charge }, { id: 'chg-1', description: 'Extra hours', quantity: 1.5, unitPrice: 200, amount: 300, unit: 'hour' });
});

test('totals show package subtotal, charges, total, deposit, payments and remaining balance', () => {
  const totals = calculateBookingTotals({
    basePrice: 3200,
    charges: [charge(2, 50, 'Parking'), charge(1, 450, 'Accommodation')],
    deposit: { type: 'percent', value: 30 },
    paidCents: 50000,
  });
  assert.deepEqual({ ...totals }, {
    baseCents: 320000,
    chargesCents: 55000,
    totalCents: 375000,
    depositDueCents: 112500,
    paidCents: 50000,
    balanceCents: 325000,
    depositOutstandingCents: 62500,
  });
  // Overpayment never produces a negative balance.
  assert.equal(calculateBookingTotals({ basePrice: 100, paidCents: 20000 }).balanceCents, 0);
});

test('deposits are fixed or percentage, validated against the final total including charges', () => {
  const total = 100000; // RM 1,000 incl. charges
  assert.equal(resolveDepositCents({ type: 'fixed', value: 300 }, total), 30000);
  assert.equal(resolveDepositCents({ type: 'percent', value: 33.33 }, total), 33330);
  assert.equal(resolveDepositCents({ type: 'fixed', value: 5000 }, total), total);
  assert.equal(validateDepositTerms({ type: 'fixed', value: 1000.01 }, total), 'deposit_too_high');
  assert.equal(validateDepositTerms({ type: 'fixed', value: 1000 }, total), null);
  assert.equal(validateDepositTerms({ type: 'percent', value: 101 }, total), 'deposit_percent');
  assert.equal(validateDepositTerms({ type: 'percent', value: 0 }, total), 'deposit_invalid');
  assert.equal(validateDepositTerms({ type: 'fixed', value: 10, dueDate: '12/10/2026' }, total), 'deposit_due_date');
  assert.equal(validateDepositTerms(null, total), null);
});

test('existing bookings without charges keep working unchanged', () => {
  const legacy = { price: 850, depositAmount: 255 };
  assert.equal(getBookingBasePrice(legacy), 850);
  assert.deepEqual({ ...getBookingDepositTerms(legacy) }, { type: 'fixed', value: 255 });
  const totals = calculateBookingTotals({ basePrice: getBookingBasePrice(legacy), charges: normalizeCharges(undefined), deposit: getBookingDepositTerms(legacy) });
  assert.equal(totals.totalCents, 85000);
  assert.equal(totals.depositDueCents, 25500);
  assert.equal(getBookingDepositTerms({ price: 100 }), null);
});

test('a new booking derives its base from basePrice, and a malformed stored charge is dropped', () => {
  const booking = { price: 3750, basePrice: 3200, charges: [charge(2, 50), { description: 'Bad', quantity: -1, unitPrice: 9 }, charge(1, 450)] };
  assert.equal(getBookingBasePrice(booking), 3200);
  assert.equal(normalizeCharges(booking.charges).length, 2);
  // Without basePrice it is derived from the stored price minus the valid charges.
  assert.equal(getBookingBasePrice({ price: 3750, charges: booking.charges }), 3200);
});

test('priced lines carry the package and each charge for invoices and public pages', () => {
  const lines = buildPricedLines({ packageName: 'Wedding Package', packageDetails: 'Two photographers', basePrice: 3200, charges: [charge(1.5, 200, 'Extra hours')] });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].kind, 'package');
  assert.equal(lines[0].amount, 3200);
  assert.equal(lines[1].kind, 'charge');
  assert.equal(lines[1].amount, 300);
});

test('resolveBookingMoney keeps a plain booking exactly as before and totals one with charges', () => {
  const { resolveBookingMoney } = pricing;
  const plain = resolveBookingMoney({ price: 850, depositAmount: 900 });
  assert.equal(plain.ok, true);
  assert.deepEqual({ ...plain.fields }, { price: 850, depositAmount: 850 });
  const charged = resolveBookingMoney({ price: 3200, charges: [charge(2, 50, 'Parking')], depositType: 'percent', depositValue: 30, depositDueDate: '2026-11-01' });
  assert.equal(charged.ok, true);
  assert.equal(charged.fields.price, 3300);
  assert.equal(charged.fields.basePrice, 3200);
  assert.equal(charged.fields.depositAmount, 990);
  assert.equal(charged.fields.depositDueDate, '2026-11-01');
  assert.equal(resolveBookingMoney({ price: 100, depositType: 'fixed', depositValue: 150 }).error, 'deposit_too_high');
  // The deposit is checked against the total *including* charges.
  assert.equal(resolveBookingMoney({ price: 100, charges: [charge(1, 60)], depositType: 'fixed', depositValue: 150 }).ok, true);
  assert.equal(resolveBookingMoney({ price: 0 }).error, 'price');
  assert.equal(resolveBookingMoney({ price: 100, charges: [{ description: '', quantity: 1, unitPrice: 1 }] }).error, 'charges');
});
