import { isPublicInvoiceBrowser } from '@/lib/public-invoice-browser';
import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';

const projectToken = Constants.expoConfig?.extra?.posthogProjectToken as string | undefined;
const host = Constants.expoConfig?.extra?.posthogHost as string | undefined;

// Analytics is optional infrastructure: missing configuration disables it, never the app.
// Screens record events through lib/analytics, which does nothing when this client is undefined.
if (__DEV__ && !projectToken) {
  console.warn(
    'EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN is missing, so PostHog analytics are disabled and events are not recorded. Add it to your environment to enable analytics.',
  );
}

if (__DEV__ && !host) {
  console.warn(
    'EXPO_PUBLIC_POSTHOG_HOST is missing, so PostHog analytics are disabled and events are not recorded. Add it to your environment to enable analytics.',
  );
}

function createClient(): PostHog | undefined {
  if (isPublicInvoiceBrowser() || !projectToken || !host) return undefined;
  try {
    return new PostHog(projectToken, {
      host,
      captureAppLifecycleEvents: true,
    });
  } catch (error) {
    if (__DEV__) console.warn('PostHog could not be initialised; analytics are disabled.', error);
    return undefined;
  }
}

export const posthog = createClient();
