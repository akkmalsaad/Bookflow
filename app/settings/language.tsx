import { SettingsDetailScreen, SettingsNotice, SettingsOptionRow } from '@/components/settings/SettingsDetailScreen';
import { useAppData } from '@/context/app-data-context';
import { LOCALES } from '@/lib/i18n';
import { useTranslation } from '@/lib/use-translation';

export default function LanguageScreen() {
  const { language, updateLanguage } = useAppData();
  const { t } = useTranslation();

  return (
    <SettingsDetailScreen
      eyebrow={t('sub.preferences')}
      title={t('lang.title')}
      description={t('lang.description')}>
      {LOCALES.map((option) => (
        <SettingsOptionRow
          key={option.id}
          title={option.label}
          subtitle={option.subtitle}
          selected={language === option.id}
          onPress={() => updateLanguage(option.id)}
        />
      ))}

      <SettingsNotice
        title={t('lang.notice.title')}
        body={t('lang.notice.body')}
      />
    </SettingsDetailScreen>
  );
}
