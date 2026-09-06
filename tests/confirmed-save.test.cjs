const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// A small hook host keeps these lifecycle tests runnable with Node and the existing
// TypeScript dependency, without adding a native renderer or animation dependency.
function host(confirmWorkspaceSave) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((dep, i) => dep !== slots[index].deps[i])) {
        effects.push(() => {
          slots[index]?.cleanup?.();
          slots[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../components/feedback/useConfirmedSave.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(compiled, {
    exports: module.exports,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-native') return { Keyboard: { dismiss() {} } };
      if (name === '@/context/app-data-context') return { useAppData: () => ({ confirmWorkspaceSave }) };
      throw new Error(`Unexpected import: ${name}`);
    },
    Error,
  });
  return {
    render(visible = true) {
      cursor = 0;
      effects = [];
      const value = module.exports.useConfirmedSave(visible);
      effects.forEach((effect) => effect());
      return value;
    },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('waits for backend acknowledgement and blocks duplicate taps before and after rerender', async () => {
  const save = deferred();
  let mutations = 0;
  const ui = host(() => save.promise);
  const first = ui.render();
  const mutate = () => { mutations++; return true; };
  first.run(mutate);
  first.run(mutate);
  assert.equal(ui.render().saving, true);
  assert.equal(ui.render().success, false);
  ui.render().run(mutate);
  assert.equal(mutations, 1);
  save.resolve();
  await flush();
  assert.equal(ui.render().saving, false);
  assert.equal(ui.render().success, true);
  first.run(mutate); // Even a stale handler must respect the synchronous lock.
  ui.render().run(mutate);
  assert.equal(mutations, 1);
});

test('failure stays visible; retry persists the existing record without repeating the mutation', async () => {
  const firstSave = deferred();
  const retry = deferred();
  let saves = 0, mutations = 0;
  const ui = host(() => ++saves === 1 ? firstSave.promise : retry.promise);
  const mutate = () => { mutations++; return true; };
  ui.render().run(mutate);
  firstSave.reject(new Error('Offline'));
  await flush();
  const failed = ui.render();
  assert.equal(failed.success, false);
  assert.equal(failed.saving, false);
  assert.match(failed.error, /Offline/);
  assert.equal(failed.pending, true);
  failed.run(mutate);
  assert.equal(mutations, 1);
  assert.equal(saves, 2);
  retry.resolve();
  await flush();
  assert.equal(ui.render().success, true);
  assert.equal(ui.render().error, '');
});

test('validation failure never requests persistence or shows success', async () => {
  let saves = 0;
  const ui = host(async () => { saves++; });
  ui.render().run(() => false);
  await flush();
  assert.equal(saves, 0);
  assert.equal(ui.render().success, false);
  assert.equal(ui.render().pending, false);
});

test('late acknowledgement cannot affect a closed and reopened form', async () => {
  const save = deferred();
  const ui = host(() => save.promise);
  ui.render().run(() => true);
  ui.render(false);
  ui.render(true);
  save.resolve();
  await flush();
  assert.equal(ui.render().success, false);
  assert.equal(ui.render().pending, false);
});

test('unmount ignores a late backend response', async () => {
  const save = deferred();
  const ui = host(() => save.promise);
  ui.render().run(() => true);
  ui.unmount();
  save.resolve();
  await flush();
  assert.equal(ui.render().success, false);
});
