import { useCallback, useEffect, useState } from 'react';

import { isAnalyticsAvailable } from '@/lib/analytics';
import { posthog } from '@/lib/posthog';

/**
 * The device's analytics choice, backed by PostHog's own persisted opt-out. Off stops every
 * capture, including lifecycle events; nothing else in the app depends on analytics.
 *
 * Unavailable when PostHog is not configured — the Security & privacy screen then hides the switch.
 * A failure reading or changing the preference leaves the switch showing PostHog's actual state.
 */
export function useAnalyticsPreference() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!posthog) return;
    let cancelled = false;
    // The persisted opt-out is loaded from storage asynchronously on launch.
    posthog
      .ready()
      .then(() => {
        if (!cancelled) setEnabled(!posthog?.optedOut);
      })
      .catch(() => {
        if (!cancelled) setEnabled(!posthog?.optedOut);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setAnalyticsEnabled = useCallback(async (next: boolean) => {
    if (!posthog) return;
    setEnabled(next);
    try {
      if (next) await posthog.optIn();
      else await posthog.optOut();
    } catch (error) {
      if (__DEV__) console.warn('[analytics] changing the analytics preference failed', error);
    } finally {
      setEnabled(!posthog.optedOut);
    }
  }, []);

  return { isAvailable: isAnalyticsAvailable, isLoaded: enabled !== null, enabled: enabled ?? false, setAnalyticsEnabled };
}
