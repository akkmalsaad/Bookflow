import { SettingsDetailScreen, SettingsNotice } from '@/components/settings/SettingsDetailScreen';
import { useTranslation } from '@/lib/use-translation';

export default function SecurityScreen() {
  const { t } = useTranslation();

  return (
    <SettingsDetailScreen
      eyebrow={t('sub.account')}
      title={t('sub.security.title')}
      description={t('sub.security.description')}>
      <SettingsNotice
        title={t('sub.security.notice.title')}
        body={t('sub.security.notice.body')}
        items={[t('sub.security.item1'), t('sub.security.item2'), t('sub.security.item3'), t('sub.security.item4')]}
      />
    </SettingsDetailScreen>
  );
}
