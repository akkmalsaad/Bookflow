import { useEffect, useState } from 'react';
import { Linking, Pressable, Text } from 'react-native';

import {
  SettingsDetailScreen,
  SettingsInfoRow,
  SettingsNotice,
  settingsDetailStyles,
} from '@/components/settings/SettingsDetailScreen';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { getNotificationPermissionStatus } from '@/lib/notifications';
import { useTranslation } from '@/lib/use-translation';

export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const [permission, setPermission] = useState<string | null>(null);

  useEffect(() => {
    getNotificationPermissionStatus()
      .then(setPermission)
      .catch(() => setPermission('unknown'));
  }, []);

  const permissionLabel =
    permission === null
      ? 'Checking…'
      : permission === 'granted'
        ? 'Allowed'
        : permission === 'denied'
          ? 'Blocked in system settings'
          : 'Not asked yet';

  return (
    <SettingsDetailScreen
      eyebrow={t('sub.preferences')}
      title={t('notifset.title')}
      description={t('notifset.description')}>
      <SettingsInfoRow label={t('notifset.permission')} value={permissionLabel} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('notifset.openSettings.label')}
        onPress={() => Linking.openSettings()}
        style={({ pressed }) => [
          settingsDetailStyles.primaryButton,
          { backgroundColor: palette.accent, shadowColor: palette.accent, marginTop: 6 },
          pressed && { opacity: 0.8 },
        ]}>
        <Text style={settingsDetailStyles.primaryButtonText}>{t('notifset.openSettings')}</Text>
      </Pressable>

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>{t('notifset.booking')}</Text>
      <SettingsInfoRow label={t('notifset.bookingReminder')} value="On · 5 hours before each booking" />
      <SettingsNotice
        title={t('notifset.booking.notice')}
        body={t('notifset.booking.body')}
      />

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>{t('notifset.payment')}</Text>
      <SettingsNotice
        title={t('notifset.notAvailable')}
        body={t('notifset.payment.body')}
        items={[t('notifset.payment.item1'), t('notifset.payment.item2')]}
      />

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>{t('notifset.invoice')}</Text>
      <SettingsNotice
        title={t('notifset.notAvailable')}
        body={t('notifset.invoice.body')}
        items={[t('notifset.invoice.item1'), t('notifset.invoice.item2'), t('notifset.invoice.item3')]}
      />
    </SettingsDetailScreen>
  );
}
