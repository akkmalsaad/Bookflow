import { SettingsDetailScreen, SettingsNotice } from '@/components/settings/SettingsDetailScreen';

export default function FeedbackScreen() {
  return (
    <SettingsDetailScreen
      eyebrow="Support"
      title="Send feedback"
      description="Telling us what is working and what is not.">
      <SettingsNotice
        title="Feedback cannot be sent from the app yet"
        body="There is no inbox or form behind this screen, so a message written here would not go anywhere. Rather than pretend to send it, the form is left out until a real destination is connected."
      />
    </SettingsDetailScreen>
  );
}
