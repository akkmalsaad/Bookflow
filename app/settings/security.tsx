import { SettingsDetailScreen, SettingsNotice } from '@/components/settings/SettingsDetailScreen';

export default function SecurityScreen() {
  return (
    <SettingsDetailScreen
      eyebrow="Account"
      title="Security & privacy"
      description="How your BookFlow account is protected.">
      <SettingsNotice
        title="Managed by your sign-in account"
        body="Your password and signed-in sessions are handled by BookFlow's authentication provider, not inside this screen. You can sign out from the main Settings screen, and delete your account and all of its data from the Danger zone. These are planned:"
        items={['Change password in-app', 'Two-factor authentication', 'Review active sessions', 'App lock with Face ID or fingerprint']}
      />
    </SettingsDetailScreen>
  );
}
