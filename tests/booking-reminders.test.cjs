const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

/** The reminder rules are pure and hold no expo import, so they load standalone. */
function loadReminders() {
  const file = path.join(__dirname, '..', 'lib', 'booking-reminders.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({}) });
  return exports;
}

const {
  materialiseDueBookingNotifications,
  bookingNotificationId,
  getBookingReminderDate,
  REMINDER_LEAD_TIME_MS,
} = loadReminders();

const booking = (id, { date = '2026-09-06', startTime = '10:00', status = 'Confirmed', title = 'Wedding Package' } = {}) =>
  ({ id, date, startTime, status, title, customerId: 'cus-1', location: 'Shah Alam', packageName: title, price: 3200, notes: '' });

/** The instant the OS notification fires for a 10:00 booking, and one minute either side of it. */
const startAt = new Date('2026-09-06T10:00:00').getTime();
const dueAt = startAt - REMINDER_LEAD_TIME_MS;
const beforeDue = dueAt - 60_000;
const afterDue = dueAt + 60_000;

test('the in-app record carries the same id the OS notification is scheduled under', () => {
  assert.equal(bookingNotificationId({ id: 'bk-1' }), 'today-priority-bk-1');
  const [created] = materialiseDueBookingNotifications([booking('bk-1')], [], afterDue);
  assert.equal(created.id, 'today-priority-bk-1');
});

test('the reminder falls due five hours before the booking starts', () => {
  assert.equal(getBookingReminderDate(booking('bk-1')).getTime(), dueAt);
});

test('B/C: a reminder that has come due becomes an unread record built from the real booking', () => {
  const [created] = materialiseDueBookingNotifications([booking('bk-1')], [], afterDue);
  assert.equal(created.title, 'Wedding Package');
  assert.equal(created.message, 'Booking reminder · starts 10:00 AM');
  assert.equal(created.isOpened, false);
  assert.equal(created.type, 'booking');
  assert.equal(created.createdAt, new Date(dueAt).toISOString());
});

test('a reminder that is not due yet produces nothing', () => {
  const existing = [];
  assert.equal(materialiseDueBookingNotifications([booking('bk-1')], existing, beforeDue), existing);
});

test('H: repeated passes never produce a duplicate', () => {
  const first = materialiseDueBookingNotifications([booking('bk-1')], [], afterDue);
  assert.equal(first.length, 1);
  const second = materialiseDueBookingNotifications([booking('bk-1')], first, afterDue + 86_400_000);
  assert.equal(second, first);
});

test('F: a record that has been read is never rewritten as unread', () => {
  const read = [{ id: 'today-priority-bk-1', title: 'Wedding Package', message: 'Booking reminder', createdAt: new Date(dueAt).toISOString(), isOpened: true, type: 'booking' }];
  const next = materialiseDueBookingNotifications([booking('bk-1')], read, afterDue);
  assert.equal(next, read);
  assert.equal(next[0].isOpened, true);
});

test('I: a cancelled booking does not reach the notification centre', () => {
  const existing = [];
  assert.equal(materialiseDueBookingNotifications([booking('bk-1', { status: 'Cancelled' })], existing, afterDue), existing);
});

test('a booking with no readable start time is skipped rather than guessed', () => {
  const existing = [];
  const noTime = { ...booking('bk-1'), startTime: undefined, time: undefined };
  assert.equal(materialiseDueBookingNotifications([noTime], existing, afterDue), existing);
});

test('G: several due reminders all arrive, newest first', () => {
  const bookings = [
    booking('bk-early', { startTime: '09:00' }),
    booking('bk-late', { startTime: '17:00' }),
  ];
  const created = materialiseDueBookingNotifications(bookings, [], new Date('2026-09-06T18:00:00').getTime());
  assert.equal(created.length, 2);
  assert.equal(created[0].id, 'today-priority-bk-late');
  assert.equal(created[1].id, 'today-priority-bk-early');
  assert.equal(created.filter((item) => !item.isOpened).length, 2);
});

test('existing records are kept and ordered with the new ones', () => {
  const older = { id: 'inv-note', title: 'Invoice', message: 'Sent', createdAt: '2026-09-01T09:00:00.000Z', isOpened: true, type: 'invoice' };
  const next = materialiseDueBookingNotifications([booking('bk-1')], [older], afterDue);
  assert.equal(next.length, 2);
  assert.equal(next[0].id, 'today-priority-bk-1');
  assert.equal(next[1], older);
});
