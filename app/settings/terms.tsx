import { SettingsDetailScreen, SettingsNotice } from '@/components/settings/SettingsDetailScreen';

export default function TermsScreen() {
  return (
    <SettingsDetailScreen
      eyebrow="About"
      title="Terms of Service"
      description="The terms you use BookFlow under.">
      <SettingsNotice
        title="The terms have not been published yet"
        body="BookFlow does not have published terms of service to show here. This screen will display them once they exist."
      />
    </SettingsDetailScreen>
  );
}
