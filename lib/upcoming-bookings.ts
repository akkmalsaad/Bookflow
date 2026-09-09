import type { Booking } from '@/context/app-data-context';

/**
 * The date of the nearest booking *after* today, for the dashboard's "Next:" line.
 *
 * Today's jobs are deliberately excluded: they are already listed on the Today's priority card
 * above, so repeating today's date as what comes next tells the reader nothing. The Upcoming count
 * beside it is a separate figure and still includes today.
 *
 * `todayKey` is the device's own calendar day, and booking dates are stored as local `YYYY-MM-DD`
 * keys, so comparing them as strings is both chronological and timezone-safe — nothing is parsed
 * into a UTC instant that could land on the wrong day.
 */
export function getNextBookingDate(bookings: Booking[], todayKey: string): string | null {
  const future = bookings.filter((booking) => booking.date > todayKey && booking.status !== 'Cancelled');
  if (future.length === 0) return null;

  // Sorted on date first, then the start time, so two jobs on the same day resolve to the earlier
  // one. Only the date is returned; the subtitle's short format is unchanged.
  return future.sort((first, second) =>
    first.date.localeCompare(second.date) ||
    (first.startTime ?? first.time ?? '').localeCompare(second.startTime ?? second.time ?? ''),
  )[0].date;
}
