import { SettingsDetailScreen, SettingsNotice } from '@/components/settings/SettingsDetailScreen';
import { useTranslation } from '@/lib/use-translation';

export default function HelpScreen() {
  const { t } = useTranslation();

  return (
    <SettingsDetailScreen
      eyebrow={t('sub.support')}
      title={t('sub.help.title')}
      description={t('sub.help.description')}>
      <SettingsNotice
        title={t('sub.help.notice.title')}
        body={t('sub.help.notice.body')}
      />
    </SettingsDetailScreen>
  );
}
