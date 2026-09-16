const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadRevenueCat() {
  const exports = {};
  const code = ts.transpileModule(read('lib/revenuecat.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const imports = {
    'expo-constants': { __esModule: true, default: { executionEnvironment: 'standalone' }, ExecutionEnvironment: { StoreClient: 'storeClient' } },
    'react-native': { Platform: { OS: 'ios' } },
    'react-native-purchases': { __esModule: true, default: {}, LOG_LEVEL: {}, PACKAGE_TYPE: {}, PURCHASES_ERROR_CODE: {} },
  };
  vm.runInNewContext(code, {
    exports, __DEV__: false, process: { env: {} }, console, Intl,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
  });
  return exports;
}

const { describePackage, describeMonthlyEquivalent, yearlySavingsPercent } = loadRevenueCat();

const pkg = (product) => ({ product: { pricePerMonth: null, pricePerMonthString: null, currencyCode: 'MYR', ...product } });

test('the paywall contains no hardcoded prices, currencies or savings', () => {
  const paywall = read('app/paywall.tsx');
  assert.equal(/RM\s?\d/.test(paywall), false, 'hardcoded RM price');
  assert.equal(/price=["']/.test(paywall), false, 'literal price prop');
  assert.equal(/\?\s*\d+\s*:\s*null/.test(paywall), false, 'literal savings percentage');
  assert.match(paywall, /price=\{describePackage\(monthlyPackage\)\}/);
  assert.match(paywall, /price=\{describePackage\(yearlyPackage\)\}/);
  assert.match(paywall, /yearlySavingsPercent\(monthlyPackage, yearlyPackage\)/);
  assert.match(paywall, /describeMonthlyEquivalent\(yearlyPackage\)/);
  assert.match(paywall, /\{ price: describePackage\(selectedPackage\) \}/);
});

test('monthly and yearly prices come from the store product, in its own currency', () => {
  // Malaysian storefront
  assert.equal(describePackage(pkg({ price: 19.9, priceString: 'RM19.90' })), 'RM19.90');
  assert.equal(describePackage(pkg({ price: 149.9, priceString: 'RM149.90' })), 'RM149.90');
  // US storefront (Test Store prices)
  assert.equal(describePackage(pkg({ price: 9.99, priceString: 'US$9.99', currencyCode: 'USD' })), 'US$9.99');
  assert.equal(describePackage(pkg({ price: 79.99, priceString: 'US$79.99', currencyCode: 'USD' })), 'US$79.99');
  // UK storefront — nothing in the helper assumes RM or a leading symbol.
  assert.equal(describePackage(pkg({ price: 39.99, priceString: '£39.99', currencyCode: 'GBP' })), '£39.99');
});

test('Malaysia: RM19.90 monthly and RM149.90 yearly give ~RM12.49/month and 37% off', () => {
  const monthly = pkg({ price: 19.9, priceString: 'RM19.90' });
  const yearly = pkg({ price: 149.9, priceString: 'RM149.90' });
  assert.equal(yearlySavingsPercent(monthly, yearly), 37);

  // No pricePerMonthString from the store: derived from the yearly price and its currency code.
  const equivalent = describeMonthlyEquivalent(yearly);
  assert.ok(equivalent.includes('12.49'), equivalent);
  assert.equal(/\bUS\$|£|€/.test(equivalent), false, equivalent);
  // The store's own per-month string wins when it is provided.
  assert.equal(describeMonthlyEquivalent(pkg({ price: 149.9, pricePerMonthString: 'RM12.49' })), 'RM12.49');
});

test('Test Store: US$9.99 monthly and US$79.99 yearly adapt without Malaysian assumptions', () => {
  const monthly = pkg({ price: 9.99, priceString: 'US$9.99', currencyCode: 'USD' });
  const yearly = pkg({ price: 79.99, priceString: 'US$79.99', currencyCode: 'USD' });
  assert.equal(yearlySavingsPercent(monthly, yearly), 33);
  const equivalent = describeMonthlyEquivalent(yearly);
  assert.ok(equivalent.includes('6.67'), equivalent);
  assert.equal(/RM/.test(equivalent), false, equivalent);
});

test('another currency formats in that currency, never RM', () => {
  const equivalent = describeMonthlyEquivalent(pkg({ price: 39.99, priceString: '£39.99', currencyCode: 'GBP' }));
  assert.ok(equivalent, 'no monthly equivalent');
  assert.equal(/RM/.test(equivalent), false, equivalent);
  assert.ok(/3\.33/.test(equivalent), equivalent);
});

test('a missing package never crashes and never invents a price', () => {
  assert.equal(describePackage(null), '—');
  assert.equal(describeMonthlyEquivalent(null), null);
  assert.equal(yearlySavingsPercent(null, pkg({ price: 149.9 })), null);
  assert.equal(yearlySavingsPercent(pkg({ price: 19.9 }), null), null);
  assert.equal(yearlySavingsPercent(null, null), null);
});

test('zero, negative or non-finite prices never produce NaN, Infinity or a bogus saving', () => {
  for (const price of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, undefined, null]) {
    const broken = pkg({ price, priceString: '' });
    assert.equal(yearlySavingsPercent(broken, pkg({ price: 149.9 })), null, `monthly ${price}`);
    assert.equal(yearlySavingsPercent(pkg({ price: 19.9 }), broken), null, `yearly ${price}`);
    const equivalent = describeMonthlyEquivalent(broken);
    assert.equal(equivalent === null || /NaN|Infinity/.test(equivalent), equivalent === null, `${price}`);
  }
  // A missing currency code cannot be formatted honestly, so the sentence is dropped.
  assert.equal(describeMonthlyEquivalent(pkg({ price: 149.9, currencyCode: '' })), null);
});

test('yearly that is not cheaper than 12 monthly payments hides the saving', () => {
  const monthly = pkg({ price: 19.9 });
  assert.equal(yearlySavingsPercent(monthly, pkg({ price: 238.8 })), null, 'equal cost');
  assert.equal(yearlySavingsPercent(monthly, pkg({ price: 300 })), null, 'more expensive');
  // Rounds to 0%: no badge rather than "SAVE 0%".
  assert.equal(yearlySavingsPercent(monthly, pkg({ price: 238.2 })), null);
});

