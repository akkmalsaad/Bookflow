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

/** A booking's optional preparation/travel buffer, applied before its start and after its finish. */
export const MAX_BUFFER_MINUTES = 12 * 60;

export function normalizeBufferMinutes(value: unknown) {
  const minutes = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.min(Math.round(minutes), MAX_BUFFER_MINUTES);
}

export type ScheduleRequest = {
  date: string;
  startTime: string;
  endTime: string;
  bufferMinutes?: number;
};

export type ScheduleConflict<T> = {
  booking: T;
  /** 'overlap' is a real double booking; 'buffer' only eats into preparation/travel time. */
  kind: 'overlap' | 'buffer';
};

/** Days since the epoch for a `YYYY-MM-DD` key, read as a calendar date (no timezone shift). */
function dayNumber(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const value = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(value) ? Math.round(value / 86_400_000) : null;
}

/**
 * Every booking that clashes with a requested slot, with what kind of clash it is.
 *
 * Bookings store the owner's local wall-clock date and time, so comparing them directly is correct
 * whatever timezone the device happens to be in. Buffers can reach across midnight, which is why
 * neighbouring days are compared on one continuous minute scale. The gap two bookings need is the
 * larger of their two buffers — a 30-minute travel buffer is not doubled into an hour.
 *
 * Cancelled bookings reserve nothing, and the booking being edited is excluded from its own check.
 * `findBookingTimeConflict` above keeps its strict same-day overlap rule for the existing callers.
 */
export function findBookingConflicts<T extends BookingSchedule & { bufferMinutes?: number }>(
  bookings: T[],
  request: ScheduleRequest,
  excludeBookingId?: string,
): ScheduleConflict<T>[] {
  const requestDay = dayNumber(request.date);
  const requestStartMinutes = timeToMinutes(request.startTime);
  const requestEndMinutes = timeToMinutes(request.endTime);
  if (requestDay === null || requestStartMinutes === null || requestEndMinutes === null || requestEndMinutes <= requestStartMinutes) {
    return [];
  }

  const requestStart = requestDay * 1440 + requestStartMinutes;
  const requestEnd = requestDay * 1440 + requestEndMinutes;
  const requestBuffer = normalizeBufferMinutes(request.bufferMinutes);

  const conflicts: (ScheduleConflict<T> & { start: number })[] = [];
  for (const booking of bookings) {
    if (booking.id === excludeBookingId || booking.status === 'Cancelled') continue;
    const day = dayNumber(booking.date);
    if (day === null || Math.abs(day - requestDay) > 1) continue;

    const startMinutes = timeToMinutes(booking.startTime ?? booking.time);
    if (startMinutes === null) continue;
    const endMinutes = timeToMinutes(booking.endTime);
    const start = day * 1440 + startMinutes;
    // Same conservative rule as above: a legacy record without a finish time holds its whole day.
    const end = day * 1440 + (endMinutes !== null && endMinutes > startMinutes ? endMinutes : 1440);
    const gap = Math.max(requestBuffer, normalizeBufferMinutes(booking.bufferMinutes));

    if (requestStart < end && requestEnd > start) {
      conflicts.push({ booking, kind: 'overlap', start });
    } else if (gap > 0 && requestStart < end + gap && start < requestEnd + gap) {
      conflicts.push({ booking, kind: 'buffer', start });
    }
  }

  return conflicts
    .sort((first, second) => (first.kind === second.kind ? first.start - second.start : first.kind === 'overlap' ? -1 : 1))
    .map(({ booking, kind }) => ({ booking, kind }));
}
