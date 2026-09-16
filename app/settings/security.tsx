import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { DeleteAccountFlow } from '@/components/settings/AccountDialogs';
import { SettingsDetailScreen } from '@/components/settings/SettingsDetailScreen';
import { DangerActionRow, SettingsRow, SettingsSection, SettingsToggleRow } from '@/components/settings/SettingsList';
import { useSubscription } from '@/context/subscription-context';
import { useAnalyticsPreference } from '@/lib/analytics-preference';
import { useTranslation } from '@/lib/use-translation';
import { captureEvent } from '@/lib/analytics';

export default function SecurityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPro, isLoadingSubscription } = useSubscription();
  const analytics = useAnalyticsPreference();
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  useEffect(() => {
    captureEvent('security_privacy_opened');
  }, []);

  const openExport = () => {
    captureEvent('data_export_opened', { source: 'security_privacy', is_pro: isPro });
    // The same destination and Pro gate as Settings > Export data & reports.
    if (isPro) router.push('/settings/export');
    else router.push({ pathname: '/paywall', params: { returnTo: '/settings/export' } });
  };

  const changeAnalytics = async (enabled: boolean) => {
    // Recorded while analytics is still on: an opt-out is the last event this device sends, and an
    // opt-in is the first one after it.
    if (!enabled) captureEvent('analytics_preference_changed', { enabled });
    await analytics.setAnalyticsEnabled(enabled);
    if (enabled) captureEvent('analytics_preference_changed', { enabled });
  };

  return (
    <SettingsDetailScreen
      eyebrow={t('security.eyebrow')}
      title={t('sub.security.title')}
      description={t('sub.security.description')}>
      <SettingsSection title={t('security.section.account')}>
        <SettingsRow
          icon="key-outline"
          title={t('security.signIn.title')}
          subtitle={t('security.signIn.subtitle')}
          onPress={() => router.push('/settings/sign-in-methods')}
        />
        <SettingsRow
          icon="phone-portrait-outline"
          title={t('security.sessions.title')}
          subtitle={t('security.sessions.subtitle')}
          onPress={() => router.push('/settings/sessions')}
        />
      </SettingsSection>

      <SettingsSection title={t('security.section.privacy')}>
        <SettingsRow
          icon="download-outline"
          title={t('security.export.title')}
          subtitle={t('security.export.subtitle')}
          proBadge={!isLoadingSubscription && !isPro}
          onPress={openExport}
        />
        <SettingsRow
          icon="shield-checkmark-outline"
          title={t('security.privacy.title')}
          subtitle={t('security.privacy.subtitle')}
          onPress={() => router.push('/settings/privacy')}
        />
        <SettingsRow
          icon="document-text-outline"
          title={t('security.terms.title')}
          subtitle={t('security.terms.subtitle')}
          onPress={() => router.push('/settings/terms')}
        />
      </SettingsSection>

      {/* Only when PostHog is actually configured — otherwise there is nothing for the switch to control. */}
      {analytics.isAvailable ? (
        <SettingsSection title={t('security.section.analytics')}>
          <SettingsToggleRow
            icon="analytics-outline"
            title={t('security.analytics.title')}
            // Not "anonymous": events are identified with the signed-in account's id.
            subtitle={t('security.analytics.subtitle')}
            value={analytics.enabled}
            disabled={!analytics.isLoaded}
            onValueChange={(next) => void changeAnalytics(next)}
          />
        </SettingsSection>
      ) : null}

      <SettingsSection title={t('security.section.deletion')}>
        <DangerActionRow
          icon="trash-outline"
          title={t('security.delete.title')}
          subtitle={t('security.delete.subtitle')}
          onPress={() => setShowDeleteAccount(true)}
        />
      </SettingsSection>

      <DeleteAccountFlow visible={showDeleteAccount} onClose={() => setShowDeleteAccount(false)} />
    </SettingsDetailScreen>
  );
}
