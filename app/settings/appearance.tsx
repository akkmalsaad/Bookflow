import { SettingsDetailScreen, SettingsOptionRow } from '@/components/settings/SettingsDetailScreen';
import { type ThemePreference, useTheme } from '@/context/theme-context';
import type { TranslationKey } from '@/lib/i18n';
import { useTranslation } from '@/lib/use-translation';

// The stored preference stays 'system' | 'light' | 'dark'; only its label follows the language.
const OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

export default function AppearanceScreen() {
  const { themePreference, setThemePreference } = useTheme();
  const { t } = useTranslation();

  return (
    <SettingsDetailScreen
      eyebrow={t('sub.preferences')}
      title={t('sub.appearance.title')}
      description={t('sub.appearance.description')}>
      {OPTIONS.map((option) => (
        <SettingsOptionRow
          key={option}
          title={t(`sub.appearance.${option}` as TranslationKey)}
          subtitle={t(`sub.appearance.${option}.sub` as TranslationKey)}
          selected={themePreference === option}
          onPress={() => setThemePreference(option)}
        />
      ))}
    </SettingsDetailScreen>
  );
}
