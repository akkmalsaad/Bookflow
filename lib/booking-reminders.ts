import type { AppNotification, Booking } from '@/context/app-data-context';
import { getReminderLeadTimeMs } from '@/lib/reminder-preference';

/**
 * The one definition of a booking reminder: which booking has one, when it is due, and what
 * identifier it carries.
 *
 * Both the scheduled OS notification and BookFlow's own notification centre are built from these,
 * so the two always describe the same event and share one id. Deliberately free of any
 * expo-notifications import: the rules stay independent of the OS, and the scheduler is the only
 * thing that talks to it.
 *
 * How far ahead a reminder falls due is the person's own setting rather than a constant here, so
 * changing it moves the OS notification and the in-app record together.
 */

export const BOOKING_REMINDER_PREFIX = 'today-priority-';

/** The identifier the OS notification is scheduled under, and the in-app record's stable id. */
export function bookingNotificationId(booking: Pick<Booking, 'id'>) {
  return `${BOOKING_REMINDER_PREFIX}${booking.id}`;
}

export function formatBookingTime(value?: string) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;

  const hour24 = Number(match[1]);
  const hour12 = hour24 % 12 || 12;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour12}:${match[2]} ${period}`;
}

export function getBookingStartDate(booking: Booking) {
  const time = booking.startTime ?? booking.time;
  if (!time) return null;
  const match = time.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;

  const date = new Date(`${booking.date}T00:00:00`);
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
}

/**
 * When the reminder for this booking falls due — the same instant the OS notification fires.
 *
 * Reads the chosen lead time on every call rather than closing over it, so a reminder worked out
 * after the setting changes already reflects the new choice.
 */
export function getBookingReminderDate(booking: Booking) {
  const startDate = getBookingStartDate(booking);
  return startDate === null ? null : new Date(startDate.getTime() - getReminderLeadTimeMs());
}

/**
 * Writes an in-app record for every booking reminder that has come due and does not have one yet.
 *
 * Existing records are never rewritten, so a notification the user has already read stays read, and
 * reloading or re-syncing the workspace cannot produce a second copy: the id is the booking's, not
 * a fresh one per pass. Returns the array it was given when nothing is due.
 *
 * `clearedAt` is when the person last emptied the in-app notification history. A reminder that had
 * already fallen due by then is not written again, which is what makes Clear all stick: the record
 * is gone, but the booking is still sitting there due, so without this the next foreground or
 * restart would simply put it back. Reminders that come due *after* that moment are unaffected —
 * clearing the list is not a way to switch future reminders off.
 */
export function materialiseDueBookingNotifications(
  bookings: Booking[],
  existing: AppNotification[],
  now: number,
  clearedAt: number | null = null,
): AppNotification[] {
  const known = new Set(existing.map((notification) => notification.id));

  const created: AppNotification[] = [];
  for (const booking of bookings) {
    const id = bookingNotificationId(booking);
    // A cancelled job stops reminding, exactly as it stops being scheduled with the OS.
    if (known.has(id) || booking.status === 'Cancelled') continue;

    const reminderDate = getBookingReminderDate(booking);
    if (reminderDate === null || reminderDate.getTime() > now) continue;
    // Already swept up by a Clear all, so its record stays gone rather than reappearing.
    if (clearedAt !== null && reminderDate.getTime() <= clearedAt) continue;

    const time = formatBookingTime(booking.startTime ?? booking.time);
    created.push({
      id,
      title: booking.title,
      message: time ? `Booking reminder · starts ${time}` : 'Booking reminder',
      createdAt: reminderDate.toISOString(),
      isOpened: false,
      type: 'booking',
    });
  }

  if (created.length === 0) return existing;

  // Newest first, which is the order the notification centre renders.
  return [...created, ...existing].sort(
    (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  );
}
