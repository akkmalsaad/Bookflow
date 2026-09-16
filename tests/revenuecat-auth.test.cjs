const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const info = (pro = false) => ({ entitlements: { active: pro ? { bookflow_pro: {} } : {} } });

function load(file, imports) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports, __DEV__: false, process: { env: {} }, console,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
  });
  return exports;
}

function setup(initialId = null) {
  let id = initialId;
  const calls = [];
  const listeners = new Set();
  const sdk = {
    async isAnonymous() { return id === null; },
    async getAppUserID() { return id ?? 'opaque-anonymous-id'; },
    async getCustomerInfo() { return info(id === 'user_A'); },
    async logIn(next) { calls.push(['login', next]); id = next; return { customerInfo: await sdk.getCustomerInfo() }; },
    async logOut() {
      calls.push(['logout']);
      assert.notEqual(id, null, 'must never log out an anonymous user');
      id = null;
      return info();
    },
    async getOfferings() { return { current: null, all: {} }; },
    addCustomerInfoUpdateListener(listener) { listeners.add(listener); },
    removeCustomerInfoUpdateListener(listener) { listeners.delete(listener); },
  };
  const lib = load('lib/revenuecat.ts', {
    'expo-constants': { default: {}, ExecutionEnvironment: { StoreClient: 'store' } },
    'react-native': { Platform: { OS: 'ios' } },
    'react-native-purchases': { default: sdk },
  });
  return { sdk, lib, calls, listeners, get id() { return id; } };
}

// Same lightweight hook-host pattern as confirmed-save.test.cjs. Execute the real provider
// and identity helper with deferred SDK calls, without installing a native renderer.
function host(env) {
  let auth = { isLoaded: true, isAuthenticated: false, user: null };
  const slots = [];
  let cursor = 0, effects = [], replay = false;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (replay || !same(slots[i]?.deps, deps)) effects.push(() => {
        slots[i]?.cleanup?.();
        slots[i] = { deps, cleanup: fn() };
      });
    },
  };
  const provider = load('context/subscription-context.tsx', {
    react,
    'react/jsx-runtime': { jsx: (_type, props) => props.value },
    'expo-router': {},
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    'react-native-purchases': { default: env.sdk },
    'react-native-purchases-ui': {},
    '@/context/auth-context': { useAuth: () => auth },
    '@/lib/revenuecat': {
      ...env.lib,
      configurePurchases: () => ({ ok: true }),
      getActiveEnvironment: () => 'test-store',
      logPurchasesError() {},
      logCustomerInfo() {},
    },
  }).SubscriptionProvider;
  const ui = {
    render(next = auth, runEffects = true) {
      auth = next;
      cursor = 0;
      effects = [];
      const value = provider({ children: null });
      if (runEffects) effects.forEach((effect) => effect());
      replay = false;
      return value;
    },
    async settle() { await flush(); return ui.render(); },
    replayEffects() { replay = true; return ui.render(); },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
  return ui;
}
const signedIn = (id) => ({ isLoaded: true, isAuthenticated: true, user: { id } });
const signedOut = { isLoaded: true, isAuthenticated: false, user: null };

test('anonymous startup and duplicate signed-out effects never call logOut', async () => {
  const env = setup();
  const ui = host(env);
  ui.render();
  ui.replayEffects();
  const state = await ui.settle();
  assert.deepEqual(env.calls, []);
  assert.equal(state.isLoadingSubscription, false);
  assert.equal(state.isPro, false);
  assert.equal(state.error, null);
});

test('waits for Clerk to load and for its stable user ID before identifying', async () => {
  const env = setup();
  const ui = host(env);
  ui.render({ ...signedOut, isLoaded: false });
  await ui.settle();
  ui.render({ ...signedIn('user_A'), user: null });
  await ui.settle();
  assert.deepEqual(env.calls, []);
  ui.render(signedIn('user_A'));
  assert.equal((await ui.settle()).isPro, true);
  assert.deepEqual(env.calls, [['login', 'user_A']]);
});

test('same identified user and effect replay do not repeat logIn', async () => {
  const env = setup('user_A');
  const ui = host(env);
  ui.render(signedIn('user_A'));
  ui.replayEffects();
  assert.equal((await ui.settle()).isPro, true);
  ui.render(signedIn('user_A'));
  await ui.settle();
  assert.deepEqual(env.calls, []);
});

test('signed-out startup clears a persisted identified RevenueCat user once', async () => {
  const env = setup('user_A');
  await Promise.all([env.lib.syncPurchasesIdentity(null), env.lib.syncPurchasesIdentity(null)]);
  assert.deepEqual(env.calls, [['logout']]);
  assert.equal(env.id, null);
});

test('serializes a slow login, real logout, and another login in auth order', async () => {
  const env = setup();
  const pending = deferred();
  const login = env.sdk.logIn;
  env.sdk.logIn = async (id) => {
    if (id === 'user_A') await pending.promise;
    return login(id);
  };
  const a = env.lib.syncPurchasesIdentity('user_A');
  const out = env.lib.syncPurchasesIdentity(null);
  const b = env.lib.syncPurchasesIdentity('user_B');
  await flush();
  assert.deepEqual(env.calls, []);
  pending.resolve();
  await Promise.all([a, out, b]);
  assert.deepEqual(env.calls, [['login', 'user_A'], ['logout'], ['login', 'user_B']]);
  assert.equal(env.id, 'user_B');
});

test('an identity failure does not poison subsequent synchronization', async () => {
  const env = setup();
  const login = env.sdk.logIn;
  env.sdk.logIn = async () => { throw new Error('offline'); };
  await assert.rejects(env.lib.syncPurchasesIdentity('user_A'), /offline/);
  env.sdk.logIn = login;
  await env.lib.syncPurchasesIdentity('user_B');
  assert.equal(env.id, 'user_B');
});

test('logout masks Pro immediately and the next account never sees the previous entitlement', async () => {
  const env = setup('user_A');
  const ui = host(env);
  ui.render(signedIn('user_A'));
  assert.equal((await ui.settle()).isPro, true);
  const pending = deferred();
  env.sdk.getCustomerInfo = () => pending.promise;
  const oldRefresh = ui.render().refreshSubscription();
  const signedOutState = ui.render(signedOut);
  assert.equal(signedOutState.isPro, false);
  assert.equal(signedOutState.customerInfo, null);
  await flush();
  env.sdk.getCustomerInfo = async () => info(false);
  ui.render(signedIn('user_B'));
  assert.equal((await ui.settle()).isPro, false);
  pending.resolve(info(true));
  await oldRefresh;
  const state = await ui.settle();
  assert.equal(state.isPro, false);
  assert.equal(state.canPurchase, true);
  assert.deepEqual(env.calls, [['logout'], ['login', 'user_B']]);
});

test('a failed account switch stays Free and blocks billing against the old native identity', async () => {
  const env = setup('user_A');
  const ui = host(env);
  ui.render(signedIn('user_A'));
  await ui.settle();
  env.sdk.logIn = async () => { throw new Error('offline'); };
  ui.render(signedIn('user_B'));
  const state = await ui.settle();
  assert.equal(state.isPro, false);
  assert.equal(state.customerInfo, null);
  assert.equal(state.canPurchase, false);
  assert.ok(state.error);
  assert.equal((await state.purchase({ identifier: 'monthly' })).status, 'error');
  assert.equal((await state.restore()).status, 'error');
});

test('late login completion cannot publish Pro after logout', async () => {
  const env = setup();
  const ui = host(env);
  const pending = deferred();
  const login = env.sdk.logIn;
  env.sdk.logIn = async (id) => { await pending.promise; return login(id); };
  ui.render(signedIn('user_A'));
  await flush();
  ui.render(signedOut);
  pending.resolve();
  const state = await ui.settle();
  assert.equal(env.id, null);
  assert.equal(state.isPro, false);
  assert.equal(state.customerInfo, null);
});

test('old listener payloads are re-read for the current account and removed on unmount', async () => {
  const env = setup('user_A');
  const ui = host(env);
  ui.render(signedIn('user_A'));
  await ui.settle();
  const oldListener = [...env.listeners][0];
  ui.render(signedIn('user_B'));
  await ui.settle();
  oldListener(info(true));
  for (const listener of env.listeners) listener(info(true));
  assert.equal((await ui.settle()).isPro, false);
  ui.unmount();
  assert.equal(env.listeners.size, 0);
});

test('failed logout never exposes A to B; direct identified-account login recovers safely', async () => {
  const env = setup('user_A');
  const ui = host(env);
  ui.render(signedIn('user_A'));
  await ui.settle();
  env.sdk.logOut = async () => { throw new Error('offline'); };
  ui.render(signedOut);
  const out = await ui.settle();
  assert.equal(out.isPro, false);
  assert.equal(out.customerInfo, null);
  assert.ok(out.error);
  assert.equal(env.id, 'user_A');
  ui.render(signedIn('user_B'));
  const next = await ui.settle();
  assert.equal(env.id, 'user_B');
  assert.equal(next.isPro, false);
  assert.equal(next.error, null);
});

test('a stale refresh from A cannot overwrite a later session of the same account', async () => {
  const env = setup('user_A');
  const ui = host(env);
  ui.render(signedIn('user_A'));
  const before = await ui.settle();
  const pending = deferred();
  env.sdk.getCustomerInfo = () => pending.promise;
  const refresh = before.refreshSubscription();
  ui.render(signedOut);
  await flush();
  env.sdk.getCustomerInfo = async () => info(false);
  ui.render(signedIn('user_A'));
  await ui.settle();
  pending.resolve(info(true));
  await refresh;
  assert.equal((await ui.settle()).isPro, false);
});

for (const operation of ['purchase', 'restore']) {
  test(`late ${operation} results cannot grant Pro to the next account`, async () => {
    const env = setup('user_A');
    const ui = host(env);
    ui.render(signedIn('user_A'));
    const state = await ui.settle();
    const pending = deferred();
    env.sdk.purchasePackage = () => pending.promise;
    env.sdk.restorePurchases = () => pending.promise;
    const result = state[operation]({ identifier: 'monthly' });
    ui.render(signedIn('user_B'));
    await ui.settle();
    pending.resolve(operation === 'purchase' ? { customerInfo: info(true) } : info(true));
    assert.equal((await result).status, 'error');
    assert.equal((await ui.settle()).isPro, false);
  });
}
