const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

function loadUpcoming() {
  const file = path.join(__dirname, '..', 'lib', 'upcoming-bookings.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({}) });
  return exports;
}

const { getNextBookingDate } = loadUpcoming();

const TODAY = '2026-09-07';
const booking = (id, date, over = {}) => ({ id, date, startTime: '10:00', status: 'Confirmed', ...over });

test('a booking today and one tomorrow: Next is tomorrow', () => {
  const bookings = [booking('bk-today', TODAY), booking('bk-next', '2026-09-08')];
  assert.equal(getNextBookingDate(bookings, TODAY), '2026-09-08');
});

test('several bookings today plus a future one: every one of today’s is ignored', () => {
  const bookings = [
    booking('bk-1', TODAY, { startTime: '08:00' }),
    booking('bk-2', TODAY, { startTime: '14:00' }),
    booking('bk-3', TODAY, { startTime: '18:00' }),
    booking('bk-future', '2026-09-10'),
  ];
  assert.equal(getNextBookingDate(bookings, TODAY), '2026-09-10');
});

test('no booking today: the nearest future booking is used', () => {
  const bookings = [booking('bk-a', '2026-09-12'), booking('bk-b', '2026-09-09')];
  assert.equal(getNextBookingDate(bookings, TODAY), '2026-09-09');
});

test('only bookings today: Next never shows today', () => {
  const bookings = [booking('bk-1', TODAY), booking('bk-2', TODAY, { startTime: '15:00' })];
  assert.equal(getNextBookingDate(bookings, TODAY), null);
});

test('no future bookings at all: the empty state is used', () => {
  assert.equal(getNextBookingDate([], TODAY), null);
  assert.equal(getNextBookingDate([booking('bk-past', '2026-09-01')], TODAY), null);
});

test('several future bookings: the earliest wins, and time breaks a same-day tie', () => {
  const bookings = [
    booking('bk-late', '2026-09-20'),
    booking('bk-mid', '2026-09-10', { startTime: '16:00' }),
    booking('bk-early', '2026-09-10', { startTime: '09:00' }),
  ];
  assert.equal(getNextBookingDate(bookings, TODAY), '2026-09-10');

  // The tie is resolved on time, even though only the date is displayed.
  const sameDay = [booking('bk-pm', '2026-09-10', { startTime: '16:00' }), booking('bk-am', '2026-09-10', { startTime: '09:00' })];
  assert.equal(getNextBookingDate(sameDay, TODAY), '2026-09-10');
});

test('a cancelled future booking is not what comes next', () => {
  const bookings = [booking('bk-off', '2026-09-08', { status: 'Cancelled' }), booking('bk-on', '2026-09-11')];
  assert.equal(getNextBookingDate(bookings, TODAY), '2026-09-11');
});

test('a legacy booking with only `time` still sorts', () => {
  const bookings = [
    { id: 'bk-legacy-pm', date: '2026-09-09', time: '17:00', status: 'Confirmed' },
    { id: 'bk-legacy-am', date: '2026-09-09', time: '08:00', status: 'Confirmed' },
  ];
  assert.equal(getNextBookingDate(bookings, TODAY), '2026-09-09');
});

test('month and year boundaries compare chronologically, not lexically by accident', () => {
  assert.equal(getNextBookingDate([booking('bk-oct', '2026-10-01')], '2026-09-30'), '2026-10-01');
  assert.equal(getNextBookingDate([booking('bk-jan', '2027-01-01')], '2026-12-31'), '2027-01-01');
  assert.equal(getNextBookingDate([booking('bk-dec', '2026-12-31')], '2027-01-01'), null);
});

test('the input array is not reordered for the caller', () => {
  const bookings = [booking('bk-late', '2026-09-20'), booking('bk-early', '2026-09-09')];
  getNextBookingDate(bookings, TODAY);
  assert.equal(bookings[0].id, 'bk-late');
});
