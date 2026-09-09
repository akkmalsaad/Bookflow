const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

function loadI18n() {
  const file = path.join(__dirname, '..', 'lib', 'i18n.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({}), RegExp, Object, String });
  return exports;
}

const { translate, getIntlLocale, isLocale, LOCALES, DEFAULT_LOCALE } = loadI18n();

test('both locales are offered and English is the default', () => {
  assert.equal(DEFAULT_LOCALE, 'en');
  assert.equal(LOCALES.map((item) => item.id).join(','), 'en,ms-MY');
  assert.equal(isLocale('ms-MY'), true);
  assert.equal(isLocale('id-ID'), false);
});

test('Home keys resolve in both languages', () => {
  assert.equal(translate('en', 'home.todaysPriority'), 'Today’s priority');
  assert.equal(translate('ms-MY', 'home.todaysPriority'), 'Keutamaan hari ini');
  assert.equal(translate('ms-MY', 'home.netProfit'), 'Untung bersih');
  assert.equal(translate('ms-MY', 'home.viewAll'), 'Lihat semua');
});

test('placeholders are filled', () => {
  assert.equal(translate('ms-MY', 'home.welcome', { name: 'Akkmal' }), 'Selamat datang Akkmal');
  assert.equal(translate('ms-MY', 'home.reminders.active', { count: 3 }), '3 aktif');
  assert.equal(translate('ms-MY', 'home.upcoming.next', { date: '6 Sep' }), 'Seterusnya: 6 Sep');
  assert.equal(translate('en', 'home.notifications.unread', { count: 2 }), 'Notifications, 2 unread');
});

test('statuses are translated for display only', () => {
  assert.equal(translate('ms-MY', 'status.booking.Confirmed'), 'Disahkan');
  assert.equal(translate('ms-MY', 'status.booking.Cancelled'), 'Dibatalkan');
  assert.equal(translate('ms-MY', 'status.booking.Completed'), 'Selesai');
  assert.equal(translate('ms-MY', 'status.invoice.Paid'), 'Telah dibayar');
  assert.equal(translate('ms-MY', 'status.invoice.Overdue'), 'Tertunggak');
});

test('no Indonesian terminology slipped into the Malay copy', () => {
  // 'anda' is standard Malay and stays. These are the Indonesian forms to keep out.
  const banned = ['Beranda', 'Pengaturan', 'Pesanan', 'Penghasilan', 'Tanggal', 'Unduh', 'ditambahkan'];
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'i18n.ts'), 'utf8');
  const malay = source.slice(source.indexOf('const HOME_MS'), source.indexOf('const TRANSLATIONS'));
  for (const word of banned) {
    assert.equal(malay.includes(word), false, `${word} should not appear in the Malay copy`);
  }
});

test('an unknown key or missing translation falls back to English rather than showing the key', () => {
  assert.equal(translate('ms-MY', 'home.revenue'), 'Pendapatan');
  assert.equal(translate('en', 'not.a.key'), 'not.a.key');
});

test('income reads Pendapatan and the reminder panel is Peringatan', () => {
  assert.equal(translate('ms-MY', 'home.revenue'), 'Pendapatan');
  assert.equal(translate('ms-MY', 'finance.income'), 'Pendapatan');
  assert.equal(translate('ms-MY', 'home.reminders'), 'Peringatan');
});

test('dates format with the right locale tag', () => {
  assert.equal(getIntlLocale('en'), 'en-GB');
  assert.equal(getIntlLocale('ms-MY'), 'ms-MY');
});

test('every English key has a Malay translation and neither is empty', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'i18n.ts'), 'utf8');
  const keysIn = (start, end) =>
    [...source.slice(source.indexOf(start), source.indexOf(end)).matchAll(/^ {2}'([^']+)':/gm)].map((match) => match[1]);
  const english = keysIn('const HOME_EN', 'export type TranslationKey');
  const malay = keysIn('const HOME_MS', 'const TRANSLATIONS');

  assert.ok(english.length > 30);
  assert.equal(english.join(','), malay.join(','));
  for (const key of english) {
    assert.notEqual(translate('ms-MY', key).trim(), '');
    assert.notEqual(translate('en', key).trim(), '');
  }
});
