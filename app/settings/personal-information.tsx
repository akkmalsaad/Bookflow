import { SettingsDetailScreen, SettingsInfoRow, SettingsNotice } from '@/components/settings/SettingsDetailScreen';
import { useAuth } from '@/context/auth-context';
import { useTranslation } from '@/lib/use-translation';

export default function PersonalInformationScreen() {
  const { t } = useTranslation();

  const { user } = useAuth();

  return (
    <SettingsDetailScreen
      eyebrow={t('sub.account')}
      title={t('sub.personal.title')}
      description={t('sub.personal.description')}>
      <SettingsInfoRow label={t('sub.personal.name')} value={user?.name ?? t('sub.personal.notSet')} />
      <SettingsInfoRow label={t('sub.personal.email')} value={user?.email ?? t('sub.personal.notSet')} />

      <SettingsNotice
        title={t('sub.personal.notice.title')}
        body={t('sub.personal.notice.body')}
      />
    </SettingsDetailScreen>
  );
}
