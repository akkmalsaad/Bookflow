const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

/** Loads lib/analytics.ts with a chosen PostHog client (or none). */
function loadAnalytics(client, warnings = []) {
  const exports = {};
  const code = ts.transpileModule(read('lib/analytics.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    __DEV__: true,
    console: { warn: (...args) => warnings.push(args) },
    require(name) {
      if (name === 'posthog-react-native') return { PostHogPersistedProperty: { OptedOut: 'opted_out' } };
      if (name === '@/lib/posthog') return { posthog: client };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return exports;
}

test('every analytics call is a silent no-op when PostHog is not configured', () => {
  const analytics = loadAnalytics(undefined);
  assert.equal(analytics.isAnalyticsAvailable, false);
  assert.doesNotThrow(() => analytics.captureEvent('booking_created', { has_deposit: true }));
  assert.doesNotThrow(() => analytics.identifyUser('user_123'));
  assert.doesNotThrow(() => analytics.resetAnalyticsIdentity());
});

test('configured PostHog receives the same events, identity and opt-out-preserving reset', () => {
  const calls = [];
  const client = {
    capture: (...args) => calls.push(['capture', ...args]),
    identify: (...args) => calls.push(['identify', ...args]),
    reset: (...args) => calls.push(['reset', ...args]),
  };
  const analytics = loadAnalytics(client);
  analytics.captureEvent('invoice_created', { source: 'booking' });
  analytics.captureEvent('customer_created');
  analytics.identifyUser('user_123');
  analytics.resetAnalyticsIdentity();

  assert.equal(analytics.isAnalyticsAvailable, true);
  assert.equal(JSON.stringify(calls), JSON.stringify([
    ['capture', 'invoice_created', { source: 'booking' }],
    ['capture', 'customer_created', null],
    ['identify', 'user_123'],
    ['reset', ['opted_out']],
  ]));
});

test('a PostHog error, thrown or rejected, never reaches the app', async () => {
  const warnings = [];
  const analytics = loadAnalytics(
    {
      capture: () => {
        throw new Error('boom');
      },
      identify: () => Promise.reject(new Error('offline')),
      reset: () => {
        throw new Error('storage');
      },
    },
    warnings,
  );
  assert.doesNotThrow(() => analytics.captureEvent('booking_created'));
  assert.doesNotThrow(() => analytics.identifyUser('user_123'));
  assert.doesNotThrow(() => analytics.resetAnalyticsIdentity());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(warnings.length, 3);
});

test('no screen calls the PostHog client directly, and missing configuration never throws', () => {
  const sources = ['app', 'components', 'context']
    .flatMap((dir) => fs.readdirSync(path.join(root, dir), { recursive: true }).map((file) => path.join(dir, file)))
    .filter((file) => /\.(ts|tsx)$/.test(file));
  for (const file of sources) {
    const source = read(file);
    assert.equal(/usePostHog|posthog\??\.(capture|identify|reset|optIn|optOut)\(/.test(source), false, file);
  }
  assert.equal(/throw new Error/.test(read('lib/posthog.ts')), false);
});
