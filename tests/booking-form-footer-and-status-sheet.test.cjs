const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const { loadTs } = require('./helpers/load-ts.cjs');

/**
 * Booking-form cards use the shared footer's form variant, and the Update Job Status sheet can be
 * dismissed without changing anything. The components are rendered to a plain element tree with
 * stubbed React/React Native, and their real handlers are pressed.
 */
const project = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(project, file), 'utf8');

// --- A minimal renderer: createElement builds a tree; hooks are slots re-read on each render.

function createHost() {
  const slots = [];
  let cursor = 0;
  const react = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useEffect() {},
    useMemo: (fn) => fn(),
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
  };
  return { react, reset: () => { cursor = 0; } };
}

function loadComponent(file, stubs) {
  const source = read(file);
  const { outputText } = ts.transpileModule(source, {
    fileName: path.basename(file),
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    // Classic JSX compiles to React.createElement, whether or not the file imports React.
    React: stubs.react,
    exports: module.exports,
    module,
    require: (name) => {
      if (name in stubs) return stubs[name];
      throw new Error(`Unexpected import in ${file}: ${name}`);
    },
    Math,
    Number,
    Object,
    Promise,
  });
  return module.exports;
}

function walk(node, visit) {
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit));
  if (!node || typeof node !== 'object') return;
  visit(node);
  walk(node.props.children, visit);
}
function findAll(tree, predicate) {
  const found = [];
  walk(tree, (node) => { if (predicate(node)) found.push(node); });
  return found;
}
function texts(tree) {
  const out = [];
  walk(tree, (node) => {
    if (node.type !== 'Text') return;
    const flat = [node.props.children].flat(Infinity).filter((child) => typeof child === 'string' || typeof child === 'number');
    if (flat.length) out.push(flat.join(''));
  });
  return out;
}
const styleOf = (node) => Object.assign({}, ...[node.props.style].flat(Infinity).filter((item) => item && typeof item === 'object'));

const rn = (dimensions = { fontScale: 1, width: 390 }) => ({
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1, absoluteFill: { position: 'absolute' } },
  Text: 'Text',
  View: 'View',
  Pressable: 'Pressable',
  Modal: 'Modal',
  Keyboard: { dismiss: () => { rn.keyboardDismissed = (rn.keyboardDismissed ?? 0) + 1; } },
  useWindowDimensions: () => ({ height: 800, ...dimensions }),
});
const theme = (isDarkMode = false) => ({
  useTheme: () => ({ isDarkMode }),
  getThemePalette: () => ({ text: '#111', muter: '#666', accent: '#4F46E5', danger: '#DC2626', border: '#ddd' }),
});
const translation = { useTranslation: () => ({ t: (key, values) => (values ? `${key}:${JSON.stringify(values)}` : key) }) };

// --- 1. Footer: explicit form and booking variants.

function renderFooter(props, { isDarkMode = false, dimensions } = {}) {
  const host = createHost();
  const { BookingCardStatusFooter, PAYMENT_BADGE_COLORS, FORM_STATUS_BADGE_COLORS } = loadComponent('components/booking/BookingCardStatusFooter.tsx', {
    react: host.react,
    'react-native': rn(dimensions),
    '@/components/booking/JobStatusPill': { JobStatusPill: 'JobStatusPill' },
    '@/context/theme-context': theme(isDarkMode),
    '@/lib/use-translation': translation,
  });
  host.reset();
  return { tree: BookingCardStatusFooter(props), PAYMENT_BADGE_COLORS, FORM_STATUS_BADGE_COLORS };
}
const shared = { formatAmount: (amount) => `RM${amount.toFixed(2)}`, colors: { text: '#111', muted: '#666', divider: '#ddd' } };
const formProps = (over = {}) => ({
  ...shared, variant: 'form', bookingTotal: 3200, payment: null, hasLinkedInvoice: false,
  formStatus: { label: 'Awaiting client details', tone: 'awaiting' }, ...over,
});

test('form card footer: booking total, "No invoice yet", read-only form status, no job picker', () => {
  const { tree } = renderFooter(formProps());
  const shown = texts(tree);
  assert.deepEqual(shown.slice(0, 2), ['bk.card.bookingTotal', 'RM3200.00']);
  assert.ok(shown.includes('bk.card.noInvoiceYet'));
  assert.ok(shown.includes('bk.card.formStatus'));
  assert.ok(shown.includes('Awaiting client details'));
  // Never "Unpaid" or a balance before an invoice exists, and no control of any kind.
  assert.equal(shown.some((text) => /bk\.pay\.|bk\.card\.balance/.test(text)), false);
  assert.equal(findAll(tree, (node) => node.type === 'JobStatusPill' || node.type === 'Pressable' || node.props.onPress).length, 0);
  // Long labels wrap: no line limits anywhere in the footer.
  assert.equal(findAll(tree, (node) => 'numberOfLines' in node.props).length, 0);
});

test('form card footer uses the real invoice helpers when an invoice is linked', () => {
  const payment = { invoiceTotal: 3200, amountPaid: 900, balance: 2300, state: 'deposit_paid' };
  const shown = texts(renderFooter(formProps({ payment, hasLinkedInvoice: true })).tree);
  assert.ok(shown.includes('bk.pay.deposit_paid'));
  assert.ok(shown.includes('bk.card.balance:{"amount":"RM2300.00"}'));
  assert.equal(shown.includes('bk.card.noInvoiceYet'), false);
  // Linked but all closed: "No active invoice", still no balance.
  const closed = texts(renderFooter(formProps({ hasLinkedInvoice: true })).tree);
  assert.ok(closed.includes('bk.card.noActiveInvoice'));
  assert.equal(closed.some((text) => /bk\.card\.balance/.test(text)), false);
});

test('booking card footer is unchanged: invoice total, payment badge and the job status picker', () => {
  const payment = { invoiceTotal: 3000, amountPaid: 3000, balance: 0, state: 'paid' };
  const onChangeJobStatus = () => {};
  const { tree } = renderFooter({ ...shared, variant: 'booking', payment, hasLinkedInvoice: true, jobStatus: 'In Progress', onChangeJobStatus, isSavingJobStatus: false, jobStatusDisabled: false });
  const shown = texts(tree);
  assert.deepEqual(shown.slice(0, 2), ['bk.card.invoiceTotal', 'RM3000.00']);
  assert.ok(shown.includes('bk.card.jobStatus'));
  const [pill] = findAll(tree, (node) => node.type === 'JobStatusPill');
  assert.equal(pill.props.status, 'In Progress');
  assert.equal(pill.props.onPress, onChangeJobStatus);
  // A booking with no invoice keeps "No invoice", and no total row.
  const none = texts(renderFooter({ ...shared, variant: 'booking', payment: null, hasLinkedInvoice: false, jobStatus: 'Confirmed', onChangeJobStatus, isSavingJobStatus: false, jobStatusDisabled: false }).tree);
  assert.ok(none.includes('bk.card.noInvoice'));
  assert.equal(none.includes('bk.card.invoiceTotal'), false);
});

test('form status badge follows the theme, stays readable, and the footer stacks for large text', () => {
  const contrast = (a, b) => {
    const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const { FORM_STATUS_BADGE_COLORS } = renderFooter(formProps());
  for (const [tone, themes] of Object.entries(FORM_STATUS_BADGE_COLORS)) {
    for (const [name, pair] of Object.entries(themes)) {
      assert.ok(contrast(pair.background, pair.text) >= 4.5, `${tone} ${name}: ${contrast(pair.background, pair.text).toFixed(2)}`);
    }
  }
  const dark = renderFooter(formProps({ formStatus: { label: 'Details received', tone: 'attention' } }), { isDarkMode: true }).tree;
  const badge = findAll(dark, (node) => node.type === 'View' && styleOf(node).backgroundColor === FORM_STATUS_BADGE_COLORS.attention.dark.background);
  assert.equal(badge.length, 1);

  const stackedRow = (tree) => findAll(tree, (node) => node.type === 'View' && styleOf(node).gap === 12 && 'flexDirection' in styleOf(node))[0];
  assert.equal(styleOf(stackedRow(renderFooter(formProps()).tree)).flexDirection, 'row');
  assert.equal(styleOf(stackedRow(renderFooter(formProps(), { dimensions: { fontScale: 1.6, width: 390 } }).tree)).flexDirection, 'column');
  assert.equal(styleOf(stackedRow(renderFooter(formProps(), { dimensions: { fontScale: 1, width: 320 } }).tree)).flexDirection, 'column');
});

test('form cards keep their behaviour; conversion hands over to the booking card by linked id', () => {
  const offers = loadTs('lib/booking-offers.ts');
  const jobFinancials = loadTs('lib/job-financials.ts');
  const form = { id: 'ofr-1', kind: 'booking_form', status: 'submitted', details: { date: '2026-11-20' } };
  const linked = offers.offerRecordIds('ofr-1').bookingId;
  // Pending, no booking yet: one form card, and no invoice to read.
  assert.equal(offers.getCalendarPendingForms([form], new Set(), Date.now()).length, 1);
  assert.equal(jobFinancials.getBookingInvoicePayment(linked, [], []), null);
  assert.equal(jobFinancials.hasLinkedInvoice(linked, []), false);
  // Converted: the booking exists under the linked id, so the form card goes and only the booking
  // card (with payment and its job status picker) remains — never both.
  const converted = { ...form, status: 'converted', bookingId: linked };
  assert.equal(offers.getCalendarPendingForms([converted], new Set([linked]), Date.now()).length, 0);
  const invoice = { id: offers.offerRecordIds('ofr-1').invoiceId, bookingId: linked, customerId: 'c', amount: 3200, dueDate: '', sentAt: '', status: 'Sent' };
  assert.equal(jobFinancials.getBookingInvoicePayment(linked, [invoice], []).state, 'unpaid');

  const screen = read('app/(tabs)/bookings.tsx');
  const formCard = screen.slice(screen.indexOf("if ('__form' in item)"), screen.indexOf('const customer = customerMap.get(item.customerId);'));
  assert.match(formCard, /const formBookingId = form\.bookingId \?\? offerRecordIds\(form\.id\)\.bookingId;/);
  assert.match(formCard, /variant="form"/);
  assert.match(formCard, /payment=\{getBookingInvoicePayment\(formBookingId, invoices, payments\)\}/);
  assert.match(formCard, /bookingTotal=\{getOfferTotals\(form\.details\)\.totalCents \/ 100\}/);
  // Tapping the card still opens its action sheet; the change-request button is still there.
  assert.match(formCard, /setFormMenuView\('actions'\);\s*setFormMenuId\(form\.id\);/);
  assert.match(formCard, /setFormMenuView\('request'\);/);
  assert.equal(/JobStatusPill|setStatusBookingId|addInvoice|addCustomer|createBooking/.test(formCard), false, 'no picker, nothing created');
  assert.match(screen, /variant="booking"/);
});

// --- 2. The Update Job Status sheet closes without changing anything.

function mountStatusSheet(props) {
  const host = createHost();
  const haptics = { selectionAsync: () => Promise.resolve(), notificationAsync: () => Promise.resolve(), NotificationFeedbackType: { Warning: 'w' } };
  const { JobStatusSheet } = loadComponent('components/booking/JobStatusSheet.tsx', {
    react: host.react,
    'react-native': rn(),
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-haptics': haptics,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/components/BottomSheetModal': { BottomSheetModal: 'BottomSheetModal' },
    '@/components/settings/tokens': { getSoftTokens: () => ({ inset: '#eee', border: '#ddd' }) },
    '@/context/theme-context': theme(),
    '@/lib/use-translation': translation,
    '@/lib/booking-status': loadTs('lib/booking-status.ts'),
  });
  return { render: () => { host.reset(); return JobStatusSheet(props); } };
}
function statusSheetCalls(status = 'Confirmed') {
  const calls = { select: [], close: 0 };
  const sheet = mountStatusSheet({ visible: true, status, bookingTitle: 'Wedding', onSelect: (next) => calls.select.push(next), onClose: () => { calls.close += 1; } });
  return { calls, sheet };
}
const sheets = (tree) => findAll(tree, (node) => node.type === 'BottomSheetModal');
const row = (tree, label) => findAll(tree, (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === label)[0];

test('the header X closes the sheet, with an accessible "Close" label and a 44pt target', () => {
  const { calls, sheet } = statusSheetCalls();
  const tree = sheet.render();
  const [close] = findAll(tree, (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'a11y.close');
  assert.ok(close, 'close button present');
  assert.equal(close.props.accessibilityRole, 'button');
  assert.equal(close.props.style({ pressed: false }).flat(Infinity).find((item) => item && item.height).height, 44);
  close.props.onPress();
  assert.equal(calls.close, 1);
  assert.deepEqual(calls.select, [], 'closing selects nothing — not the Cancelled stage');
});

test('backdrop, Android Back and the escape gesture route through the same close handler', () => {
  const { calls, sheet } = statusSheetCalls();
  const [picker, confirm] = sheets(sheet.render());
  assert.equal(picker.props.dismissible, true);
  picker.props.onClose();
  assert.equal(calls.close, 1);
  assert.deepEqual(calls.select, []);
  // The cancellation confirmation dismisses the same way, and that keeps the booking.
  assert.equal(confirm.props.dismissible, true);
  confirm.props.onClose();
  assert.equal(calls.close, 2);
  assert.deepEqual(calls.select, []);
});

test('tapping the status already held closes without selecting (so no save starts)', () => {
  for (const status of ['Inquiry', 'Confirmed', 'In Progress', 'Completed', 'Cancelled']) {
    const { calls, sheet } = statusSheetCalls(status);
    row(sheet.render(), `status.booking.${status}`).props.onPress();
    assert.deepEqual(calls.select, [], status);
    assert.equal(calls.close, 1, status);
  }
});

test('a different status is still selected as before; Cancelled still asks first', () => {
  const { calls, sheet } = statusSheetCalls('Confirmed');
  row(sheet.render(), 'status.booking.In Progress').props.onPress();
  assert.deepEqual(calls.select, ['In Progress']);

  const cancel = statusSheetCalls('Confirmed');
  row(cancel.sheet.render(), 'status.booking.Cancelled').props.onPress();
  assert.deepEqual(cancel.calls.select, [], 'nothing written before the confirmation');
  const [picker] = sheets(cancel.sheet.render());
  assert.equal(picker.props.visible, false, 'picker steps aside for the confirmation');
  // A legacy status has no checked row, so every stage is a real change.
  const legacy = statusSheetCalls('Deposit Paid');
  row(legacy.sheet.render(), 'status.booking.Confirmed').props.onPress();
  assert.deepEqual(legacy.calls.select, ['Confirmed']);
});

function mountBottomSheet(props) {
  const host = createHost();
  const nativeRn = rn();
  const { BottomSheetModal } = loadComponent('components/BottomSheetModal.tsx', {
    react: host.react,
    'react-native': nativeRn,
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/components/KeyboardDoneButton': { KeyboardDoneButton: 'KeyboardDoneButton' },
    '@/components/modal-transition': {
      useModalTransition: ({ visible }) => ({ mounted: true, overlayStyle: {}, contentStyle: {}, guard: (action) => () => { if (visible) action(); } }),
    },
    '@/components/settings/tokens': { getSoftTokens: () => ({ surface: '#fff', border: '#ddd', shadow: '#000' }) },
    '@/context/theme-context': theme(),
    '@/lib/responsive': { getSheetMaxHeight: () => 600, useResponsive: () => ({ sheetStyle: null, sheetMaxHeight: 900 }) },
  });
  host.reset();
  return BottomSheetModal(props);
}

test('the bottom sheet: dismissible routes backdrop, Back and escape to onClose; other sheets unchanged', () => {
  let closed = 0;
  const onClose = () => { closed += 1; };
  const tree = mountBottomSheet({ visible: true, onClose, dismissible: true, children: 'content' });
  const [modal] = findAll(tree, (node) => node.type === 'Modal');
  const [root] = findAll(tree, (node) => node.type === 'View' && 'onAccessibilityEscape' in node.props);
  const [backdrop] = findAll(tree, (node) => node.type === 'Pressable');
  modal.props.onRequestClose();
  root.props.onAccessibilityEscape();
  backdrop.props.onPress();
  assert.equal(closed, 3);
  // The sheet is rendered after the backdrop, so a tap inside the sheet lands on the sheet, not it.
  const rootChildren = [root.props.children].flat(Infinity).filter(Boolean);
  assert.ok(rootChildren.indexOf(backdrop) < rootChildren.findIndex((node) => node.type === 'AnimatedView' && 'maxHeight' in styleOf(node)));

  // While closing (visible false), nothing fires a second close.
  const closing = mountBottomSheet({ visible: false, onClose, dismissible: true, children: 'content' });
  findAll(closing, (node) => node.type === 'Pressable')[0].props.onPress();
  assert.equal(closed, 3);

  // Default sheets: a backdrop tap only puts the keyboard away, and there is no escape handler.
  const plainTree = mountBottomSheet({ visible: true, onClose, children: 'content' });
  findAll(plainTree, (node) => node.type === 'Pressable')[0].props.onPress();
  assert.equal(closed, 3);
  assert.equal(findAll(plainTree, (node) => node.type === 'View' && node.props.onAccessibilityEscape).length, 0);
});

test('dismissing never saves; an in-flight save completes on its own and the picker reopens afterwards', () => {
  const screen = read('app/(tabs)/bookings.tsx');
  // Every dismissal just clears the open booking id — no update, no save, no success message.
  assert.match(screen, /onClose=\{\(\) => setStatusBookingId\(null\)\}/);
  const handler = screen.slice(screen.indexOf('const handleStatusSelect = async'), screen.indexOf('const deliveryBookings'));
  // The sheet is closed before the save is awaited, so the save's result is handled whether or not
  // the sheet is on screen; a second change is refused until it settles; then the pill is enabled again.
  assert.ok(handler.indexOf('setStatusBookingId(null);') < handler.indexOf('await confirmWorkspaceSave()'));
  assert.match(handler, /if \(!bookingId \|\| savingStatusRef\.current\) return;/);
  assert.match(handler, /finally \{\s*savingStatusRef\.current = false;\s*setSavingStatusBookingId\(null\);/);
  assert.match(screen, /jobStatusDisabled=\{statusBookingId !== null \|\| savingStatusBookingId !== null\}/);
});

test('English and Malay labels for the new strings', () => {
  const i18n = loadTs('lib/i18n.ts');
  const expected = {
    'bk.card.bookingTotal': ['Booking total', 'Jumlah tempahan'],
    'bk.card.formStatus': ['Form status', 'Status borang'],
    'bk.card.noInvoiceYet': ['No invoice yet', 'Belum ada invois'],
    'a11y.close': ['Close', 'Tutup'],
  };
  for (const [key, [en, ms]] of Object.entries(expected)) {
    assert.equal(i18n.translate('en', key), en);
    assert.equal(i18n.translate('ms-MY', key), ms);
  }
});
