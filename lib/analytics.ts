import { PostHogPersistedProperty } from 'posthog-react-native';
import type PostHog from 'posthog-react-native';

import { posthog } from '@/lib/posthog';

type EventProperties = Parameters<PostHog['capture']>[1];

/**
 * The one way BookFlow talks to PostHog. Analytics must never break the app, so every call is a
 * no-op when PostHog is not configured, and any error it raises — thrown or rejected — is
 * swallowed. When PostHog is configured, calls pass straight through, so event names, properties
 * and the user's opt-out behave exactly as PostHog itself defines them.
 */
function run(operation: string, action: (client: PostHog) => unknown) {
  if (!posthog) return;
  try {
    const result = action(posthog);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).catch((error) => {
        if (__DEV__) console.warn(`[analytics] ${operation} failed`, error);
      });
    }
  } catch (error) {
    if (__DEV__) console.warn(`[analytics] ${operation} failed`, error);
  }
}

export const isAnalyticsAvailable = Boolean(posthog);

export function captureEvent(event: string, properties?: EventProperties) {
  run('capture', (client) => client.capture(event, properties));
}

export function identifyUser(distinctId: string) {
  run('identify', (client) => client.identify(distinctId));
}

/**
 * Clears the analytics identity after sign-out or account deletion while keeping this device's
 * analytics choice. A plain `reset()` would also wipe the opt-out, silently turning analytics back
 * on for the next person to sign in.
 */
export function resetAnalyticsIdentity() {
  run('reset', (client) => client.reset([PostHogPersistedProperty.OptedOut]));
}
