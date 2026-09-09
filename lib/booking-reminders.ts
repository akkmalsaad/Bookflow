import type { AppNotification, Booking } from '@/context/app-data-context';

/**
 * The one definition of a booking reminder: which booking has one, when it is due, and what
 * identifier it carries.
 *
 * Both the scheduled OS notification and BookFlow's own notification centre are built from these,
 * so the two always describe the same event and share one id. Deliberately free of any
 * expo-notifications import: the rules are pure, and the scheduler is the only thing that talks to
 * the OS.
 */

export const BOOKING_REMINDER_PREFIX = 'today-priority-';
export const REMINDER_LEAD_TIME_MS = 5 * 60 * 60 * 1000;

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

/** When the reminder for this booking falls due — the same instant the OS notification fires. */
export function getBookingReminderDate(booking: Booking) {
  const startDate = getBookingStartDate(booking);
  return startDate === null ? null : new Date(startDate.getTime() - REMINDER_LEAD_TIME_MS);
}

/**
 * Writes an in-app record for every booking reminder that has come due and does not have one yet.
 *
 * Existing records are never rewritten, so a notification the user has already read stays read, and
 * reloading or re-syncing the workspace cannot produce a second copy: the id is the booking's, not
 * a fresh one per pass. Returns the array it was given when nothing is due.
 */
export function materialiseDueBookingNotifications(
  bookings: Booking[],
  existing: AppNotification[],
  now: number,
): AppNotification[] {
  const known = new Set(existing.map((notification) => notification.id));

  const created: AppNotification[] = [];
  for (const booking of bookings) {
    const id = bookingNotificationId(booking);
    // A cancelled job stops reminding, exactly as it stops being scheduled with the OS.
    if (known.has(id) || booking.status === 'Cancelled') continue;

    const reminderDate = getBookingReminderDate(booking);
    if (reminderDate === null || reminderDate.getTime() > now) continue;

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
