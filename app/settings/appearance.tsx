import { SettingsDetailScreen, SettingsOptionRow } from '@/components/settings/SettingsDetailScreen';
import { type ThemePreference, useTheme } from '@/context/theme-context';

const OPTIONS: { id: ThemePreference; title: string; subtitle: string }[] = [
  { id: 'system', title: 'System', subtitle: 'Follow your device appearance setting' },
  { id: 'light', title: 'Light', subtitle: 'Always use the light palette' },
  { id: 'dark', title: 'Dark', subtitle: 'Always use the dark palette' },
];

export default function AppearanceScreen() {
  const { themePreference, setThemePreference } = useTheme();

  return (
    <SettingsDetailScreen
      eyebrow="Preferences"
      title="Appearance"
      description="Choose how BookFlow looks. This applies for the current session — the choice is not saved between app launches yet.">
      {OPTIONS.map((option) => (
        <SettingsOptionRow
          key={option.id}
          title={option.title}
          subtitle={option.subtitle}
          selected={themePreference === option.id}
          onPress={() => setThemePreference(option.id)}
        />
      ))}
    </SettingsDetailScreen>
  );
}
