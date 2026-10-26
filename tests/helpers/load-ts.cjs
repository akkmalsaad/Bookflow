const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');

/**
 * Loads a project TypeScript module, resolving `@/…` and relative imports to other project modules
 * (transpiled the same way). Type-only imports are erased by the compiler; any other import — a
 * native or React module — is replaced by an empty object, so only pure modules should be loaded.
 */
function loadTs(relativeFile, globals = {}, stubs = {}) {
  const cache = new Map();
  const load = (file) => {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    const requireFn = (specifier) => {
      if (Object.prototype.hasOwnProperty.call(stubs, specifier)) return stubs[specifier];
      let target = null;
      if (specifier.startsWith('@/')) target = path.join(root, specifier.slice(2));
      else if (specifier.startsWith('.')) target = path.join(path.dirname(file), specifier);
      if (target) {
        for (const candidate of [`${target}.ts`, `${target}.tsx`, path.join(target, 'index.ts')]) {
          if (fs.existsSync(candidate)) return load(candidate);
        }
      }
      return {};
    };
    vm.runInNewContext(code, { exports: module.exports, module, require: requireFn, Intl, Date, Math, Number, JSON, URL, ...globals });
    return module.exports;
  };
  return load(path.join(root, relativeFile));
}

/** Copies a value out of the VM realm so deepStrictEqual compares plain test-realm objects. */
const plain = (value) => JSON.parse(JSON.stringify(value));

module.exports = { loadTs, plain };
