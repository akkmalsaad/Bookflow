export type BookingSchedule = {
  id: string;
  date: string;
  time?: string;
  startTime?: string;
  endTime?: string;
  status: string;
};

export function normalizeBookingTime(value?: string) {
  const match = value?.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;

  const hour = Number(match[1]);
  if (hour < 0 || hour > 23) return null;

  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

function timeToMinutes(value?: string) {
  const normalized = normalizeBookingTime(value);
  if (!normalized) return null;

  const [hour, minute] = normalized.split(':').map(Number);
  return (hour * 60) + minute;
}

/**
 * Treat booking ranges as half-open intervals: [start, finish). This blocks every
 * real overlap while still allowing one booking to begin exactly when another ends.
 */
export function findBookingTimeConflict<T extends BookingSchedule>(
  bookings: T[],
  date: string,
  startTime: string,
  endTime: string,
  excludeBookingId?: string,
) {
  const requestedStart = timeToMinutes(startTime);
  const requestedEnd = timeToMinutes(endTime);

  if (requestedStart === null || requestedEnd === null || requestedEnd <= requestedStart) {
    return null;
  }

  return bookings.find((booking) => {
    if (booking.id === excludeBookingId || booking.date !== date || booking.status === 'Cancelled') {
      return false;
    }

    const existingStart = timeToMinutes(booking.startTime ?? booking.time);
    const existingEnd = timeToMinutes(booking.endTime);
    if (existingStart === null) return false;

    // The finish time of a legacy record may be missing. Conservatively reserve the
    // rest of that date so an unknown event duration cannot produce a double booking.
    const effectiveExistingEnd = existingEnd !== null && existingEnd > existingStart
      ? existingEnd
      : 24 * 60;

    return requestedStart < effectiveExistingEnd && requestedEnd > existingStart;
  }) ?? null;
}
