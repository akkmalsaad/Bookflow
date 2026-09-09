import { SettingsDetailScreen, SettingsNotice } from '@/components/settings/SettingsDetailScreen';
import { useTranslation } from '@/lib/use-translation';

export default function PrivacyPolicyScreen() {
  const { t } = useTranslation();

  return (
    <SettingsDetailScreen
      eyebrow={t('sub.about')}
      title={t('sub.privacy.title')}
      description={t('sub.privacy.description')}>
      <SettingsNotice
        title={t('sub.privacy.notice.title')}
        body={t('sub.privacy.notice.body')}
      />
    </SettingsDetailScreen>
  );
}
