import { SettingsDetailScreen, SettingsNotice } from '@/components/settings/SettingsDetailScreen';
import { useTranslation } from '@/lib/use-translation';

export default function FeedbackScreen() {
  const { t } = useTranslation();

  return (
    <SettingsDetailScreen
      eyebrow={t('sub.support')}
      title={t('sub.feedback.title')}
      description={t('sub.feedback.description')}>
      <SettingsNotice
        title={t('sub.feedback.notice.title')}
        body={t('sub.feedback.notice.body')}
      />
    </SettingsDetailScreen>
  );
}
