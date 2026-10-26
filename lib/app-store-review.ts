import * as SecureStore from 'expo-secure-store';
import { Linking, Platform } from 'react-native';

import {
  createReviewRequestState,
  isEligibleForReviewRequest,
  parseReviewRequestState,
  withDeliveredJob,
  type ReviewRequestState,
} from '@/lib/review-request-rules';

/**
 * BookFlow's App Store review touchpoints. iOS only — there is no Google Play equivalent.
 *
 * The review-request state is stored with expo-secure-store under a `bookflow.*` key and read
 * synchronously, the same way the reminder and appearance preferences are. It lives only on this
 * device and holds booking ids, never booking or client details.
 */

/** BookFlow's Apple ID in App Store Connect — the same value as submit.production.ios.ascAppId in eas.json. */
const APP_STORE_ID = '6811386316';
const WRITE_REVIEW_URL = `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;

const REVIEW_REQUEST_KEY = 'bookflow.reviewRequest';

export const isAppStoreReviewSupported = Platform.OS === 'ios';

let cached: ReviewRequestState | null = null;

function saveState(state: ReviewRequestState) {
  cached = state;
  SecureStore.setItemAsync(REVIEW_REQUEST_KEY, JSON.stringify(state)).catch((error) => {
    if (__DEV__) console.warn('[review] could not save the review request state', error);
  });
}

/** Read from storage once, then served from memory. A missing or unreadable record starts fresh now. */
function loadState(): ReviewRequestState {
  if (cached) return cached;
  let stored: ReviewRequestState | null = null;
  try {
    stored = parseReviewRequestState(SecureStore.getItem(REVIEW_REQUEST_KEY));
  } catch {
    stored = null;
  }
  if (stored) {
    cached = stored;
  } else {
    saveState(createReviewRequestState(Date.now()));
  }
  return cached!;
}

/** Starts the usage clock on the first launch. Safe on every launch — only the first one counts. */
export function startReviewTracking() {
  if (!isAppStoreReviewSupported) return;
  loadState();
}

/** Called once a booking's Delivered status has been saved. The same booking only ever counts once. */
export function recordDeliveredJob(bookingId: string) {
  if (!isAppStoreReviewSupported) return;
  const current = loadState();
  const next = withDeliveredJob(current, bookingId);
  if (next !== current) saveState(next);
}

/**
 * Asks iOS for its review prompt when the rules allow. Resolves the same way whatever happens:
 * whether the prompt appeared, and whether a review was left, is known only to Apple.
 */
export async function requestReviewIfEligible() {
  if (!isAppStoreReviewSupported) return;
  const now = Date.now();
  if (!isEligibleForReviewRequest(loadState(), now)) return;
  try {
    // Loaded on demand so a binary built without the native module cannot fail at startup.
    const StoreReview = await import('expo-store-review');
    if (!(await StoreReview.isAvailableAsync())) return;
    // Recorded before asking, so the 120-day gap holds even when iOS chooses to show nothing.
    saveState({ ...loadState(), lastRequestAt: now });
    await StoreReview.requestReview();
  } catch (error) {
    if (__DEV__) console.warn('[review] review request failed', error);
  }
}

/** Opens BookFlow's write-a-review page in the App Store. Resolves false when it could not open. */
export async function openAppStoreReviewPage() {
  try {
    await Linking.openURL(WRITE_REVIEW_URL);
    return true;
  } catch {
    return false;
  }
}
