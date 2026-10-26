/**
 * When BookFlow may ask iOS for its native App Store review prompt. Kept free of React Native imports
 * so it can be unit tested; lib/app-store-review.ts stores the state and makes the request.
 *
 * These rules only decide when asking is reasonable. Apple decides whether the prompt actually
 * appears (and caps it per year), and nothing here ever learns whether a review was left.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const REVIEW_MIN_USAGE_MS = 7 * DAY_MS;
export const REVIEW_MIN_DELIVERED_JOBS = 3;
export const REVIEW_REQUEST_COOLDOWN_MS = 120 * DAY_MS;

export type ReviewRequestState = {
  /** The first launch since tracking began. Usage before then is unknown and never assumed. */
  firstSeenAt: number;
  /** Distinct bookings saved as Delivered. Only the first few are kept — more never changes the answer. */
  deliveredJobIds: string[];
  /** The last time the app asked iOS for the prompt, whether or not iOS showed it. */
  lastRequestAt: number | null;
};

export function createReviewRequestState(now: number): ReviewRequestState {
  return { firstSeenAt: now, deliveredJobIds: [], lastRequestAt: null };
}

/** The stored state, or null when there is none or it cannot be trusted. */
export function parseReviewRequestState(raw: string | null): ReviewRequestState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !Number.isFinite(value.firstSeenAt)) return null;
    const ids: unknown[] = Array.isArray(value.deliveredJobIds) ? value.deliveredJobIds : [];
    return {
      firstSeenAt: value.firstSeenAt,
      deliveredJobIds: [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, REVIEW_MIN_DELIVERED_JOBS),
      lastRequestAt: Number.isFinite(value.lastRequestAt) ? value.lastRequestAt : null,
    };
  } catch {
    return null;
  }
}

/** Counts a booking once: saving the same booking as Delivered again changes nothing. */
export function withDeliveredJob(state: ReviewRequestState, bookingId: string): ReviewRequestState {
  if (
    !bookingId
    || state.deliveredJobIds.includes(bookingId)
    || state.deliveredJobIds.length >= REVIEW_MIN_DELIVERED_JOBS
  ) {
    return state;
  }
  return { ...state, deliveredJobIds: [...state.deliveredJobIds, bookingId] };
}

/** Seven days of use, three distinct delivered jobs, and no request in the last 120 days. */
export function isEligibleForReviewRequest(state: ReviewRequestState, now: number) {
  return (
    now - state.firstSeenAt >= REVIEW_MIN_USAGE_MS
    && state.deliveredJobIds.length >= REVIEW_MIN_DELIVERED_JOBS
    && (state.lastRequestAt === null || now - state.lastRequestAt >= REVIEW_REQUEST_COOLDOWN_MS)
  );
}
