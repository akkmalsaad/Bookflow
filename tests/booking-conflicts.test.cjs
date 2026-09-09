const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

/** The conflict rules are pure, so they load standalone. */
function loadConflicts() {
  const file = path.join(__dirname, '..', 'lib', 'booking-conflicts.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({}) });
  return exports;
}

const { findBookingTimeConflict, parsePackageDurationMinutes, addMinutesToTime } = loadConflicts();

const DATE = '2026-09-10';
const existing = (startTime, endTime, status = 'Confirmed', id = 'bk-existing') => ({ id, date: DATE, startTime, endTime, status });
const conflicts = (bookings, startTime, endTime, excludeId) =>
  findBookingTimeConflict(bookings, DATE, startTime, endTime, excludeId) !== null;

test('A: a free slot on the same day is allowed', () => {
  assert.equal(conflicts([existing('10:00', '12:00')], '14:00', '16:00'), false);
});

test('B: a partial overlap is blocked', () => {
  assert.equal(conflicts([existing('10:00', '14:00')], '13:00', '16:00'), true);
  // and the mirror image, overlapping the start rather than the end
  assert.equal(conflicts([existing('10:00', '14:00')], '09:00', '11:00'), true);
});

test('C: an event inside an existing one is blocked', () => {
  assert.equal(conflicts([existing('10:00', '18:00')], '12:00', '14:00'), true);
});

test('D: an event that surrounds an existing one is blocked', () => {
  assert.equal(conflicts([existing('12:00', '14:00')], '10:00', '18:00'), true);
});

test('E: the exact same time is blocked', () => {
  assert.equal(conflicts([existing('10:00', '18:00')], '10:00', '18:00'), true);
});

test('F: adjacent times are allowed — ranges are half-open [start, finish)', () => {
  assert.equal(conflicts([existing('10:00', '14:00')], '14:00', '16:00'), false);
  assert.equal(conflicts([existing('10:00', '14:00')], '08:00', '10:00'), false);
});

test('G: a cancelled booking reserves nothing', () => {
  assert.equal(conflicts([existing('10:00', '14:00', 'Cancelled')], '10:00', '14:00'), false);
});

test('every other active status still reserves its slot', () => {
  for (const status of ['Inquiry', 'Confirmed', 'Deposit Paid', 'In Progress', 'Completed']) {
    assert.equal(conflicts([existing('10:00', '14:00', status)], '11:00', '13:00'), true, status);
  }
});

test('a booking never conflicts with itself when it is excluded', () => {
  const bookings = [existing('10:00', '18:00', 'Confirmed', 'bk-a')];
  assert.equal(conflicts(bookings, '10:00', '18:00'), true);
  assert.equal(conflicts(bookings, '10:00', '18:00', 'bk-a'), false);
});

test('another date is never a conflict', () => {
  const other = { id: 'bk-other', date: '2026-09-11', startTime: '10:00', endTime: '18:00', status: 'Confirmed' };
  assert.equal(conflicts([other], '10:00', '18:00'), false);
});

test('a legacy booking with no finish time reserves the rest of its day', () => {
  const legacy = { id: 'bk-legacy', date: DATE, startTime: '10:00', status: 'Confirmed' };
  assert.equal(conflicts([legacy], '11:00', '12:00'), true);
  assert.equal(conflicts([legacy], '08:00', '10:00'), false);
});

test('an unusable requested range is not treated as a conflict', () => {
  const bookings = [existing('10:00', '14:00')];
  assert.equal(conflicts(bookings, '14:00', '10:00'), false);
  assert.equal(conflicts(bookings, '10:00', '10:00'), false);
  assert.equal(conflicts(bookings, 'nonsense', '14:00'), false);
});

test('the package duration drives the suggested end time', () => {
  assert.equal(parsePackageDurationMinutes('8 hours'), 480);
  assert.equal(addMinutesToTime('10:00', 480), '18:00');
  assert.equal(parsePackageDurationMinutes('Half day'), null);
});
