import { SettingsDetailScreen, SettingsNotice } from '@/components/settings/SettingsDetailScreen';
import { useTranslation } from '@/lib/use-translation';

export default function TermsScreen() {
  const { t } = useTranslation();

  return (
    <SettingsDetailScreen
      eyebrow={t('sub.about')}
      title={t('sub.terms.title')}
      description={t('sub.terms.description')}>
      <SettingsNotice
        title={t('sub.terms.notice.title')}
        body={t('sub.terms.notice.body')}
      />
    </SettingsDetailScreen>
  );
}
