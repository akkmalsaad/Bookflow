const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadModule(file) {
  const code = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  const localRequire = (specifier) => (specifier.startsWith('@/') ? loadModule(`${specifier.slice(2)}.ts`) : {});
  vm.runInNewContext(code, { exports, require: localRequire });
  return exports;
}

const { getTermsOfService } = loadModule('lib/legal/terms-of-service.ts');
const terms = getTermsOfService('en');

function flatten(document) {
  const parts = [];
  const visit = (block) => {
    if (block.text) parts.push(block.text);
    if (block.items) block.items.forEach((item) => parts.push(typeof item === 'string' ? item : `${item.term} ${item.text}`));
    if (block.label) parts.push(block.label);
    if (block.address) parts.push(block.address);
  };
  document.intro.forEach(visit);
  document.sections.forEach((section) => {
    parts.push(section.title);
    section.blocks.forEach(visit);
  });
  return parts.join('\n');
}

const text = flatten(terms);
const actions = terms.sections.flatMap((section) => section.blocks.filter((block) => block.type === 'action').map((block) => block.action));

test('has a valid last-updated date and the 28 sections in order', () => {
  assert.match(terms.lastUpdated, /^\d{4}-\d{2}-\d{2}$/);
  const titles = terms.sections.map((section) => section.title);
  assert.equal(titles.length, 28);
  titles.forEach((title, index) => assert.ok(title.startsWith(`${index + 1}. `), title));
});

test('prices and Free plan limits are never written into the Terms', () => {
  assert.equal(/RM\s?\d/.test(text), false, 'a price is hardcoded');
  const { FREE_LIMITS } = loadModule('lib/plan-limits.ts');
  for (const value of Object.values(FREE_LIMITS)) {
    assert.equal(new RegExp(`\\b${value} (customers|bookings|invoices)\\b`, 'i').test(text), false);
  }
  assert.match(text, /Current pricing and available subscription options are displayed before you purchase/);
});

test('BookFlow is not presented as a payment processor, adviser or refund guarantor', () => {
  assert.match(text, /does not process or transfer payments between you and your customers/);
  assert.match(text, /do not mean BookFlow has verified that any money was actually received/);
  assert.match(text, /not an accounting firm, accountant, tax adviser, financial adviser, legal adviser, bank, payment processor or escrow provider/);
  assert.equal(/money-back|\d+-day refund|full refund/i.test(text), false);
  assert.equal(/99\.9|uptime guarantee|guaranteed uptime/i.test(text), false);
  assert.equal(/arbitration|Delaware|Singapore law|laws of the State/i.test(text), false);
  // No gateway exists in the app, so none may be implied.
  const files = ['app', 'components', 'context', 'lib']
    .flatMap((dir) => fs.readdirSync(path.join(root, dir), { recursive: true }).map((file) => path.join(dir, file)))
    .filter((file) => /\.(ts|tsx)$/.test(file));
  const gateway = /from ['"](@?stripe[^'"]*|[^'"]*(billplz|toyyibpay|ipay88|senangpay)[^'"]*)['"]/i;
  for (const file of files) assert.equal(gateway.test(read(file)), false, `${file} imports a payment gateway`);
  assert.equal(Object.keys(JSON.parse(read('package.json')).dependencies).some((name) => /stripe|billplz|toyyibpay|ipay88|senangpay/i.test(name)), false);
});

test('subscription and cancellation wording matches store billing', () => {
  const revenuecat = read('lib/revenuecat.ts');
  assert.match(revenuecat, /'appl_'/);
  assert.match(revenuecat, /'goog_'/);
  assert.match(text, /Apple App Store on iOS or Google Play on Android/);
  assert.match(text, /Deleting the BookFlow app from your device does not cancel your subscription/);
  assert.match(text, /Deleting your BookFlow account does not cancel a subscription billed by Apple or Google/);
  assert.ok(text.includes('RevenueCat'));
});

test('account deletion, backups and invoice links match the implementation', () => {
  const deletionExists = fs.existsSync(path.join(root, 'supabase/functions/delete-account/index.ts'));
  assert.equal(text.includes('Settings > Security & privacy > Delete account'), deletionExists);
  assert.ok(fs.existsSync(path.join(root, 'app/settings/data-management.tsx')), 'backup screen missing');
  assert.match(text, /workspace backup file/);
  const retentionDays = read('lib/invoice-lifecycle.ts').match(/DUSTBIN_RETENTION_DAYS = (\d+)/)[1];
  assert.ok(text.includes(`Dustbin can be restored for ${retentionDays} days`));
  assert.ok(text.includes('until the link expires after 30 days'));
});

test('links go to the existing Privacy Policy and Contact Support screens', () => {
  assert.ok(actions.includes('privacyPolicy'));
  assert.ok(actions.includes('contactSupport'));
  assert.ok(text.includes('support@bookflow.my'));
  assert.equal(/@gmail\.com/i.test(text), false);
  const screen = read('components/legal/LegalDocumentScreen.tsx');
  assert.match(screen, /router\.push\('\/settings\/privacy'\)/);
  assert.match(screen, /router\.push\('\/settings\/contact-support'\)/);
});

test('there is one Terms screen, and Settings, Security & privacy and the paywall all open it', () => {
  const screens = fs.readdirSync(path.join(root, 'app', 'settings')).filter((file) => /terms/i.test(file));
  assert.deepEqual(screens, ['terms.tsx']);
  for (const file of ['app/(tabs)/settings.tsx', 'app/settings/security.tsx', 'app/paywall.tsx']) {
    assert.match(read(file), /'\/settings\/terms'/, file);
  }
  assert.match(read('app/settings/terms.tsx'), /openedEvent="terms_of_service_opened"/);
});

test('Malay falls back to the English Terms until a reviewed translation exists', () => {
  assert.equal(getTermsOfService('ms-MY').language, 'en');
});
