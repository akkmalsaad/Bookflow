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

/**
 * Reads a package's free-text duration ("8 hours", "90 minutes", "1h 30m") as a number of minutes,
 * so a booking's finish time can follow the package instead of being dialled in by hand.
 *
 * Returns null for anything it cannot read confidently — "Half day", "Full day", an empty field —
 * and the caller falls back to its own default rather than guessing a length.
 */
export function parsePackageDurationMinutes(duration?: string) {
  const text = duration?.trim().toLowerCase();
  if (!text) return null;

  let minutes = 0;
  let matched = false;

  const hours = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/.exec(text);
  if (hours) {
    minutes += Math.round(Number(hours[1]) * 60);
    matched = true;
  }

  const mins = /(\d+)\s*(?:minutes?|mins?|m)\b/.exec(text);
  if (mins) {
    minutes += Number(mins[1]);
    matched = true;
  }

  if (!matched || minutes <= 0) return null;
  // A booking is a single day, so anything longer is not something this can express.
  return minutes < 24 * 60 ? minutes : null;
}

/** Adds minutes to a HH:mm time, clamped to the same day. Null when the time is unreadable. */
export function addMinutesToTime(time: string, minutes: number) {
  const start = timeToMinutes(time);
  if (start === null) return null;

  const total = Math.min(start + minutes, (23 * 60) + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
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
