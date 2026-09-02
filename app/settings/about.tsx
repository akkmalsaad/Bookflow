import Constants from 'expo-constants';

import { SettingsDetailScreen, SettingsInfoRow } from '@/components/settings/SettingsDetailScreen';

export default function AboutScreen() {
  const appVersion = Constants.expoConfig?.version ?? 'Unknown';
  const buildNumber = Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode;

  return (
    <SettingsDetailScreen
      eyebrow="About"
      title="About BookFlow"
      description="BookFlow is a booking and finance app for small service businesses — customers, bookings, invoices, payments and cash flow in one place.">
      <SettingsInfoRow label="Version" value={buildNumber ? `${appVersion} (${buildNumber})` : String(appVersion)} />
      <SettingsInfoRow label="Runtime" value={`Expo SDK ${Constants.expoConfig?.sdkVersion ?? 'Unknown'}`} />
    </SettingsDetailScreen>
  );
}
