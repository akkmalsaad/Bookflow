import { SettingsDetailScreen, SettingsInfoRow, SettingsNotice } from '@/components/settings/SettingsDetailScreen';
import { useAuth } from '@/context/auth-context';

export default function PersonalInformationScreen() {
  const { user } = useAuth();

  return (
    <SettingsDetailScreen
      eyebrow="Account"
      title="Personal information"
      description="This is the account you signed in with. It is separate from your business profile, which is what customers see on invoices.">
      <SettingsInfoRow label="Name" value={user?.name ?? 'Not set'} />
      <SettingsInfoRow label="Email" value={user?.email ?? 'Not set'} />

      <SettingsNotice
        title="Editing is not available in the app yet"
        body="Your name and email come from your BookFlow sign-in account. Changing them from inside the app has not been built yet — the business name, phone and address shown to customers are edited under Business profile."
      />
    </SettingsDetailScreen>
  );
}
