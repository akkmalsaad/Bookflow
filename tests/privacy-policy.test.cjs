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

const { getPrivacyPolicy, SUPPORT_EMAIL } = loadModule('lib/legal/privacy-policy.ts');
const policy = getPrivacyPolicy('en');

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

const text = flatten(policy);
const packageJson = JSON.parse(read('package.json'));
const dependencies = Object.keys(packageJson.dependencies);

test('has a valid last-updated date and the fourteen required sections in order', () => {
  assert.match(policy.lastUpdated, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!Number.isNaN(new Date(`${policy.lastUpdated}T00:00:00`).getTime()));
  const titles = policy.sections.map((section) => section.title);
  assert.equal(titles.length, 14);
  titles.forEach((title, index) => assert.ok(title.startsWith(`${index + 1}. `), title));
});

test('every installed service that receives user data is disclosed', () => {
  const providers = {
    '@clerk/expo': 'Clerk',
    '@supabase/supabase-js': 'Supabase',
    'react-native-purchases': 'RevenueCat',
    'posthog-react-native': 'PostHog',
    '@sentry/react-native': 'Sentry',
  };
  for (const [dependency, name] of Object.entries(providers)) {
    if (dependencies.includes(dependency)) assert.ok(text.includes(name), `${name} is used but not disclosed`);
  }
});

test('analytics are not described as anonymous while identify() is used, and opt-out wording matches the code', () => {
  const identifies = read('context/auth-context.tsx').includes('posthog?.identify(');
  if (identifies) {
    assert.match(text, /not anonymous/);
    assert.equal(/\banonymous(ly)?\b/i.test(text.replace(/not anonymous/g, '')), false);
  }
  const optOutWorks = read('lib/analytics-preference.ts').includes('posthog.optOut()');
  assert.equal(text.includes('turn analytics off'), optOutWorks);
});

test('deletion, export and retention statements match the implementation', () => {
  const deletionExists = fs.existsSync(path.join(root, 'supabase/functions/delete-account/index.ts'));
  assert.equal(text.includes('Settings > Security & privacy > Delete account'), deletionExists);
  assert.match(text, /does not cancel a subscription billed through the Apple App Store or Google Play/);

  const retentionDays = read('lib/invoice-lifecycle.ts').match(/DUSTBIN_RETENTION_DAYS = (\d+)/)[1];
  assert.ok(text.includes(`Dustbin are permanently removed after ${retentionDays} days`));
  assert.match(read('context/app-data-context.tsx'), /now\.getTime\(\) \+ 30 \* 24 \* 60 \* 60 \* 1000/);
  assert.ok(text.includes('Links expire after 30 days'));

  const formats = read('lib/reports/types.ts').match(/ReportFormat = ([^;]+);/)[1];
  assert.match(formats, /'pdf'/);
  assert.match(formats, /'csv'/);
  assert.match(formats, /'xlsx'/);
});

test('account deletion and booking forms are described the same way in English and Malay', () => {
  const malay = getPrivacyPolicy('ms-MY');
  const shape = (document) => Array.from(document.sections,(section) => `${section.id}:${section.blocks.map((block) => block.type).join(',')}`);
  assert.deepEqual(shape(malay), shape(policy), 'every clause has its counterpart');
  assert.equal(malay.lastUpdated, policy.lastUpdated);

  const deletion = (document) => flatten({ intro: [], sections: document.sections.filter((section) => section.id === 'choices-deletion') });
  const en = deletion(policy);
  const ms = deletion(malay);
  for (const fact of [/from Supabase/, /sign-in account with Clerk/, /kept separately by RevenueCat/, /for 30 days/, /after your account has been deleted/, /does not cancel a subscription/]) {
    assert.match(en, fact);
  }
  for (const fact of [/daripada Supabase/, /akaun log masuk anda dengan Clerk/, /secara berasingan oleh RevenueCat/, /selama 30 hari/, /selepas akaun anda dipadamkan/, /tidak membatalkan langganan/]) {
    assert.match(ms, fact);
  }
  for (const text of [en, ms]) assert.ok(text.includes('support@bookflow.my'));
  // RevenueCat records are never said to be deleted with the account.
  assert.equal(/(deletes?|removes?)[^.]*RevenueCat/i.test(en.replace(/not deleted with your BookFlow account/g, '')), false);

  // What a public booking form collects matches the fields the server accepts.
  const fields = read('supabase/functions/booking-public/index.ts').match(/submit: \[([^\]]+)\]/)[1];
  assert.deepEqual(Array.from(fields.match(/'(\w+)'/g)), ["'name'", "'email'", "'phone'", "'customerLocation'", "'location'", "'acceptTerms'", "'termsVersion'", "'version'"]);
  assert.match(text, /their name, phone number, email address \(if given\), their own location and the event location/);
  assert.match(flatten(malay), /nama, nombor telefon, alamat e-mel \(jika diberikan\), lokasi mereka sendiri dan lokasi acara/);
});

test('no unsupported security, payment or certification claims', () => {
  const banned = [/100% secure/i, /completely secure\b(?! ,? and we cannot)/i, /PDPA certified/i, /never be (breached|hacked)/i, /we store your password/i, /we sell/i];
  for (const pattern of banned) {
    const hits = text.match(pattern);
    // The only "completely secure" allowed is the disclaimer that nothing is.
    if (hits && /completely secure/i.test(hits[0])) {
      assert.match(text, /No method of electronic storage or transmission is completely secure/);
      continue;
    }
    assert.equal(hits, null, `Unsupported claim: ${pattern}`);
  }
  assert.match(text, /does not collect or store credit or debit card details/);
});

test('contact details use the official support identity and the existing Contact Support route', () => {
  assert.equal(SUPPORT_EMAIL, 'support@bookflow.my');
  assert.ok(text.includes('support@bookflow.my'));
  assert.equal(/@gmail\.com/i.test(text), false);
  const contact = policy.sections.find((section) => section.id === 'contact');
  assert.ok(contact.blocks.some((block) => block.type === 'action' && block.action === 'contactSupport'));
  assert.match(read('components/legal/LegalDocumentScreen.tsx'), /router\.push\('\/settings\/contact-support'\)/);
});

test('there is one Privacy Policy screen, and every link opens it', () => {
  const screens = fs.readdirSync(path.join(root, 'app', 'settings')).filter((file) => /privacy/i.test(file));
  assert.deepEqual(screens, ['privacy.tsx']);
  for (const file of ['app/(tabs)/settings.tsx', 'app/settings/security.tsx']) {
    assert.match(read(file), /'\/settings\/privacy'/, file);
  }
});

test('Malay falls back to the English policy until a reviewed translation exists', () => {
  assert.equal(getPrivacyPolicy('ms-MY').language, 'en');
});
