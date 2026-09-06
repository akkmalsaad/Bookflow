const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const jsx = require('react/jsx-runtime');

function loadFeedback() {
  let cursor = 0;
  const slots = [];
  const modules = {};
  const react = {
    lazy: () => 'ExpenseReference', Suspense: 'Suspense',
    useCallback: (fn) => fn, useEffect() {}, useRef: (value) => ({ current: value }),
    useState(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = value;
      return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
  };
  const animated = {
    default: { View: 'AnimatedView', createAnimatedComponent: (value) => value },
    useReducedMotion: () => false,
    useSharedValue: (value) => ({ get: () => value }),
    useAnimatedStyle: (fn) => fn(), useAnimatedProps: (fn) => fn(),
    Easing: { bezier: () => null },
  };
  function load(file) {
    if (modules[file]) return modules[file];
    const exports = modules[file] = {};
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    vm.runInNewContext(code, {
      exports,
      require(name) {
        if (name === 'react') return react;
        if (name === 'react/jsx-runtime') return jsx;
        if (name === 'react-native') return { View: 'View', Text: 'Text', StyleSheet: { create: (s) => s, absoluteFill: { position: 'absolute', inset: 0 } } };
        if (name === 'react-native-reanimated') return animated;
        if (name === 'react-native-svg') return { default: 'Svg', Path: 'Path' };
        if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 59, bottom: 34 }) };
        if (name.endsWith('/success-card-layout')) return load('components/feedback/success-card-layout.ts');
        if (name.endsWith('/tokens')) return { getSoftTokens: () => ({}) };
        if (name.endsWith('/theme-context')) return { useTheme: () => ({}), getThemePalette: () => ({}) };
        return {};
      },
    });
    return exports;
  }
  const feedback = load('components/feedback/SuccessFeedback.tsx');
  return { ...feedback, render: (component, props) => { cursor = 0; return component(props); } };
}
const flatten = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

test('every success uses the native Expense reference size, independent of confirmation text', () => {
  const ui = loadFeedback();
  for (const title of ['Expense added', 'Income added', 'Customer added', 'Invoice created', 'Booking created', 'Payment recorded', 'RM100.00 deposit saved']) {
    const presentation = ui.SuccessFeedback({ visible: true, title });
    let root = ui.render(presentation.type, presentation.props);
    const reference = root.props.children[0].props.children.props.children;
    assert.equal(reference.type, 'ExpenseReference');
    assert.equal(reference.props.visible, false);
    // Simulate a measured layout, rather than guessing a reference height in production.
    reference.props.onMeasure({ nativeEvent: { layout: { width: 353, height: 612 } } });
    root = ui.render(presentation.type, presentation.props);
    const backdrop = root.props.children[1];
    const sequence = backdrop.props.children;
    const card = sequence.type(sequence.props);
    const frame = flatten(card.props.style);
    assert.equal(frame.width, 353);
    assert.equal(frame.height, 612);
    assert.equal(frame.borderRadius, 28);
    assert.equal(frame.maxWidth, 520);
    assert.equal(frame.elevation, 14);
    assert.equal(frame.padding, 24);
    assert.equal(frame.alignItems, 'center');
    assert.equal(frame.justifyContent, 'center');
    const bounds = flatten(backdrop.props.style);
    assert.equal(bounds.paddingHorizontal, 20);
    assert.equal(bounds.paddingTop, 71);
    assert.equal(bounds.paddingBottom, 46);
  }
});

test('hidden feedback has no overlay to intercept touches or schedule a completion', () => {
  const { SuccessFeedback } = loadFeedback();
  assert.equal(SuccessFeedback({ visible: false, title: 'Expense added' }), null);
});
