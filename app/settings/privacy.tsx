import { SettingsDetailScreen, SettingsNotice } from '@/components/settings/SettingsDetailScreen';

export default function PrivacyPolicyScreen() {
  return (
    <SettingsDetailScreen
      eyebrow="About"
      title="Privacy Policy"
      description="How BookFlow handles your data.">
      <SettingsNotice
        title="The policy has not been published yet"
        body="BookFlow does not have a published privacy policy to show here. Your business records are stored in your BookFlow workspace and your sign-in details are held by the app's authentication provider. Deleting your account from the Danger zone removes your workspace data."
      />
    </SettingsDetailScreen>
  );
}
