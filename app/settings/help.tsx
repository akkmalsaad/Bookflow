import { SettingsDetailScreen, SettingsNotice } from '@/components/settings/SettingsDetailScreen';

export default function HelpScreen() {
  return (
    <SettingsDetailScreen
      eyebrow="Support"
      title="Help & support"
      description="Getting help with BookFlow.">
      <SettingsNotice
        title="No support channel is connected yet"
        body="There is no help centre, chat or support inbox wired into the app, so nothing here will reach anyone. Once a support address or help site exists, this screen will link to it."
      />
    </SettingsDetailScreen>
  );
}
