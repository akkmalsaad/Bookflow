import Constants from 'expo-constants';

import { SettingsDetailScreen, SettingsInfoRow } from '@/components/settings/SettingsDetailScreen';
import { useTranslation } from '@/lib/use-translation';

export default function AboutScreen() {
  const { t } = useTranslation();

  const appVersion = Constants.expoConfig?.version ?? t('sub.unknown');
  const buildNumber = Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode;

  return (
    <SettingsDetailScreen
      eyebrow={t('sub.about')}
      title={t('sub.about.title')}
      description={t('sub.about.description')}>
      <SettingsInfoRow label={t('sub.about.version')} value={buildNumber ? `${appVersion} (${buildNumber})` : String(appVersion)} />
    </SettingsDetailScreen>
  );
}
