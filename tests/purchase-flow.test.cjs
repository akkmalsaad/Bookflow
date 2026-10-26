const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');
const { loadTs, plain } = require('./helpers/load-ts.cjs');

/**
 * Pro access comes from RevenueCat's SDK alone: the active `bookflow_pro` entitlement in the
 * CustomerInfo a purchase or restore returns. There is no server confirmation step. The paywall is
 * rendered with stubbed React Native and its real Upgrade / Restore handlers are pressed.
 */
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// --- Entitlement → Pro, from the SDK's own CustomerInfo ------------------------------------------

const revenuecat = loadTs('lib/revenuecat.ts', { process: { env: {} } }, {
  'expo-constants': { ExecutionEnvironment: {}, default: {} },
  'react-native': { Platform: { OS: 'ios' } },
  'react-native-purchases': { PURCHASES_ERROR_CODE: {}, LOG_LEVEL: {}, PACKAGE_TYPE: {} },
});
const entitlement = (over = {}) => ({ identifier: 'bookflow_pro', isActive: true, willRenew: true, expirationDate: '2027-01-01T00:00:00Z', ...over });
/** CustomerInfo as the SDK builds it: `active` holds only entitlements RevenueCat considers active. */
const customerInfo = ({ active = {}, all = active } = {}) => ({ entitlements: { active, all } });

test('Pro is the SDK’s active bookflow_pro entitlement — and nothing else', () => {
  assert.equal(revenuecat.PRO_ENTITLEMENT_ID, 'bookflow_pro');
  assert.equal(revenuecat.hasProAccess(customerInfo({ active: { bookflow_pro: entitlement() } })), true);
  // Cancelled but not yet expired: RevenueCat keeps it active until the period ends.
  assert.equal(revenuecat.hasProAccess(customerInfo({ active: { bookflow_pro: entitlement({ willRenew: false, unsubscribeDetectedAt: '2026-10-20T00:00:00Z' }) } })), true);
  // Expired: still listed under `all`, no longer under `active`.
  assert.equal(revenuecat.hasProAccess(customerInfo({ active: {}, all: { bookflow_pro: entitlement({ isActive: false, expirationDate: '2026-09-01T00:00:00Z' }) } })), false);
  assert.equal(revenuecat.hasProAccess(customerInfo({ active: { something_else: entitlement({ identifier: 'something_else' }) } })), false);
  assert.equal(revenuecat.hasProAccess(customerInfo()), false);
  assert.equal(revenuecat.hasProAccess(null), false);
});

test('purchase and restore report Pro from the CustomerInfo RevenueCat returned', () => {
  const context = read('context/subscription-context.tsx');
  assert.match(context, /return \{ status: 'purchased', customerInfo: verifiedInfo, isPro: hasProAccess\(verifiedInfo\) \};/);
  assert.match(context, /return \{ status: 'purchased', customerInfo: info, isPro: hasProAccess\(info\) \};/);
  // The app-wide flag every gate reads is the same check on the latest CustomerInfo.
  assert.match(context, /const effectiveIsPro = hasProAccess\(customerInfo\);/);
});

// --- The paywall, rendered ------------------------------------------------------------------------

function createHost() {
  const slots = [];
  let cursor = 0;
  const effects = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } }),
    Fragment: 'Fragment',
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useEffect: (fn) => { effects.push(fn); },
  };
  return { react, reset: () => { cursor = 0; effects.length = 0; }, runEffects: () => effects.splice(0).forEach((fn) => fn()) };
}

function mountPaywall(subscription) {
  const host = createHost();
  const calls = { alerts: [], snackbars: [], navigation: [], events: [] };
  const stubs = {
    react: host.react,
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-image': { Image: 'Image' },
    'expo-router': {
      useLocalSearchParams: () => ({}),
      useRouter: () => ({ canGoBack: () => true, back: () => calls.navigation.push('back'), replace: (to) => calls.navigation.push(`replace:${to}`), push: () => {} }),
    },
    'expo-web-browser': { openBrowserAsync: async () => {}, WebBrowserPresentationStyle: {} },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
      StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
      Alert: { alert: (title, body) => calls.alerts.push([title, body]) },
      useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/ProBadge': { ProBadge: 'ProBadge' },
    '@/components/settings/tokens': { getSoftTokens: () => ({ surface: '#fff', border: '#ddd', divider: '#eee', inset: '#f5f5f5' }) },
    '@/context/snackbar-context': { useSnackbar: () => ({ showSnackbar: (item) => calls.snackbars.push(item) }) },
    '@/context/subscription-context': { useSubscription: () => subscription },
    '@/context/theme-context': { useTheme: () => ({ isDarkMode: false }), getThemePalette: () => new Proxy({}, { get: () => '#000' }) },
    '@/lib/plan-limits': loadTs('lib/plan-limits.ts'),
    '@/lib/use-translation': { useTranslation: () => ({ t: (key) => key }) },
    '@/lib/revenuecat': {
      describeMonthlyEquivalent: () => null, describePackage: () => 'RM99', yearlySavingsPercent: () => null,
      isExpoGo: false, isPurchasesSupported: true,
    },
    '@/lib/analytics': { captureEvent: (name, props) => calls.events.push([name, props]) },
    '@/assets/images/bookflow-logo.png': 1,
  };
  const source = read('app/paywall.tsx');
  const { outputText } = ts.transpileModule(source, { fileName: 'paywall.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    React: host.react, exports: module.exports, module, Math, Number, Object, Promise, Proxy, __DEV__: false,
    require: (name) => { if (name in stubs) return stubs[name]; throw new Error(`Unexpected import: ${name}`); },
  });
  const Paywall = module.exports.default;
  const render = () => { host.reset(); const tree = Paywall(); host.runEffects(); return tree; };
  return { render, calls };
}

function walk(node, visit) {
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit));
  if (!node || typeof node !== 'object') return;
  visit(node);
  walk(node.props.children, visit);
}
/** The Pressable whose own text includes the given translation key. */
function button(tree, key) {
  let found = null;
  walk(tree, (node) => {
    if (found || node.type !== 'Pressable') return;
    walk(node.props.children, (child) => { if (child.type === 'Text' && [child.props.children].flat(Infinity).includes(key)) found = node; });
  });
  assert.ok(found, `button ${key}`);
  return found;
}

const pkg = { identifier: '$rc_annual', product: { priceString: 'RM99' } };
function subscriptionWith(over) {
  const state = {
    canPurchase: true, environment: 'app-store', isLoadingOfferings: false, isPro: false, isPurchasing: false, isRestoring: false,
    monthlyPackage: null, offeringError: null, yearlyPackage: pkg, reloadOfferings: async () => {},
    refreshed: 0, refreshSubscription: async () => { state.refreshed += 1; },
    purchase: async () => ({ status: 'cancelled' }), restore: async () => ({ status: 'error', message: 'x' }),
    ...over,
  };
  return state;
}

test('1 & 6: a purchase RevenueCat confirms unlocks Pro and says so — no server call involved', async () => {
  const subscription = subscriptionWith({ purchase: async () => ({ status: 'purchased', isPro: true, customerInfo: {} }) });
  const paywall = mountPaywall(subscription);
  await button(paywall.render(), 'paywall.continuePro').props.onPress();
  assert.deepEqual(plain(paywall.calls.snackbars), [{ message: 'paywall.success', tone: 'success' }]);
  assert.deepEqual(paywall.calls.alerts, []);
  assert.equal(subscription.refreshed, 1);
  // The entitlement landing (isPro) is what closes the paywall.
  assert.deepEqual(paywall.calls.navigation, []);
  subscription.isPro = true;
  paywall.render();
  assert.deepEqual(paywall.calls.navigation, ['back']);
});

test('a purchase without the entitlement, a cancellation or a pending payment never claims Pro', async () => {
  const notGranted = mountPaywall(subscriptionWith({ purchase: async () => ({ status: 'purchased', isPro: false, customerInfo: {} }) }));
  await button(notGranted.render(), 'paywall.continuePro').props.onPress();
  assert.deepEqual(notGranted.calls.alerts, [['paywall.almost.title', 'paywall.almost.body']]);
  assert.deepEqual(notGranted.calls.snackbars, []);
  assert.deepEqual(notGranted.calls.navigation, []);

  const cancelled = mountPaywall(subscriptionWith({ purchase: async () => ({ status: 'cancelled' }) }));
  await button(cancelled.render(), 'paywall.continuePro').props.onPress();
  assert.deepEqual([cancelled.calls.alerts, cancelled.calls.snackbars, cancelled.calls.navigation], [[], [], []]);

  // Ask to Buy: the SDK reports PAYMENT_PENDING_ERROR, described for the user; Pro stays locked.
  const pendingMessage = 'Your payment is pending approval. BookFlow Pro unlocks as soon as it clears.';
  const pending = mountPaywall(subscriptionWith({ purchase: async () => ({ status: 'error', message: pendingMessage }) }));
  await button(pending.render(), 'paywall.continuePro').props.onPress();
  assert.deepEqual(pending.calls.alerts, [['paywall.incomplete', pendingMessage]]);
  assert.deepEqual(pending.calls.snackbars, []);
  assert.match(read('lib/revenuecat.ts'), /case PURCHASES_ERROR_CODE\.PAYMENT_PENDING_ERROR:\s*return 'Your payment is pending approval\. BookFlow Pro unlocks as soon as it clears\.';/);
});

test('2 & 3: restore unlocks Pro only when RevenueCat returns an active entitlement', async () => {
  const restored = mountPaywall(subscriptionWith({ restore: async () => ({ status: 'purchased', isPro: true, customerInfo: {} }) }));
  await button(restored.render(), 'paywall.restore').props.onPress();
  assert.deepEqual(plain(restored.calls.snackbars), [{ message: 'paywall.restored', tone: 'success' }]);
  assert.deepEqual(restored.calls.alerts, []);

  const nothing = mountPaywall(subscriptionWith({ restore: async () => ({ status: 'purchased', isPro: false, customerInfo: {} }) }));
  await button(nothing.render(), 'paywall.restore').props.onPress();
  assert.deepEqual(nothing.calls.alerts, [['paywall.nothingToRestore', 'paywall.nothingToRestore.body']]);
  assert.deepEqual(nothing.calls.snackbars, []);
  assert.deepEqual(nothing.calls.navigation, [], 'the paywall stays open: still Free');

  const failed = mountPaywall(subscriptionWith({ restore: async () => ({ status: 'error', message: 'Network down' }) }));
  await button(failed.render(), 'paywall.restore').props.onPress();
  assert.deepEqual(failed.calls.alerts, [['paywall.restoreFailed', 'Network down']]);
  assert.deepEqual(failed.calls.snackbars, []);
});

test('6: nothing in the app calls entitlement-status or waits for a server confirmation', () => {
  const paywall = read('app/paywall.tsx');
  assert.equal(/entitlement-status|confirmProActivation|pro-activation|pro\.activation|isActivating|still activating/i.test(paywall), false);
  assert.equal(fs.existsSync(path.join(root, 'lib/pro-activation.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'supabase/functions/entitlement-status')), false);
  assert.equal(/entitlement-status/.test(read('supabase/config.toml')), false);
  for (const dir of ['app', 'components', 'context', 'lib']) {
    const files = fs.readdirSync(path.join(root, dir), { recursive: true }).filter((file) => /\.(ts|tsx)$/.test(file));
    for (const file of files) {
      assert.equal(/entitlement-status|confirmProActivation/.test(read(path.join(dir, file))), false, `${dir}/${file}`);
    }
  }
  const i18n = loadTs('lib/i18n.ts');
  assert.equal(i18n.translate('en', 'paywall.success'), 'BookFlow Pro is now active.');
  assert.equal(i18n.translate('ms-MY', 'paywall.success'), 'BookFlow Pro kini aktif.');
  assert.equal(i18n.translate('en', 'paywall.restored'), 'Your BookFlow Pro subscription has been restored.');
  assert.equal(i18n.translate('ms-MY', 'paywall.restored'), 'Langganan BookFlow Pro anda telah dipulihkan.');
});

test('7: Free plan limits still follow the SDK entitlement', () => {
  const limits = loadTs('lib/plan-limits.ts');
  const customers = Array.from({ length: 5 }, (_, i) => ({ id: `c-${i}` }));
  assert.equal(limits.canCreateCustomer(false, customers).allowed, false);
  assert.equal(limits.canCreateCustomer(true, customers).allowed, true);
  // The app's gate reads isPro from the subscription context (the SDK entitlement).
  assert.match(read('context/app-data-context.tsx'), /if \(kind === 'customers'\) return canCreateCustomer\(isPro, customersRef\.current\);/);
});
