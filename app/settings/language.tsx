import { SettingsDetailScreen, SettingsNotice, SettingsOptionRow } from '@/components/settings/SettingsDetailScreen';

export default function LanguageScreen() {
  return (
    <SettingsDetailScreen
      eyebrow="Preferences"
      title="Language"
      description="BookFlow is currently available in English only.">
      <SettingsOptionRow title="English" subtitle="Default" selected onPress={() => {}} />
      <SettingsOptionRow title="Bahasa Melayu" subtitle="Not available yet" selected={false} disabled onPress={() => {}} />

      <SettingsNotice
        title="One language for now"
        body="The interface text is not translated yet, so switching languages would not change anything on screen. Bahasa Melayu is the next language planned."
      />
    </SettingsDetailScreen>
  );
}
