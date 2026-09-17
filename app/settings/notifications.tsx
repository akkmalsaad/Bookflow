import { useEffect, useState } from 'react';
import { Linking, Pressable, Text } from 'react-native';

import {
  SettingsDetailScreen,
  SettingsInfoRow,
  SettingsNotice,
  SettingsOptionRow,
  settingsDetailStyles,
} from '@/components/settings/SettingsDetailScreen';
import { useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { getNotificationPermissionStatus, syncTodayPriorityNotifications } from '@/lib/notifications';
import {
  REMINDER_LEAD_HOUR_OPTIONS,
  setReminderLeadHours,
  useReminderLeadHours,
  type ReminderLeadHours,
} from '@/lib/reminder-preference';
import { useTranslation } from '@/lib/use-translation';

export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const { bookings } = useAppData();
  const [permission, setPermission] = useState<string | null>(null);
  const reminderLeadHours = useReminderLeadHours();

  const chooseReminderLead = (hours: ReminderLeadHours) => {
    if (hours === reminderLeadHours) return;
    setReminderLeadHours(hours);

    // Re-arms every booking against the new lead time on the tap itself, rather than waiting for the
    // next dashboard visit. The sync withdraws each request the OS is holding for the old lead time
    // and schedules its replacement, because it compares the instant a request was armed for rather
    // than only whether its identifier is pending.
    syncTodayPriorityNotifications(bookings).catch(() => {});
  };

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
      <SettingsInfoRow
        label={t('notifset.bookingReminder')}
        value={t('notifset.bookingReminder.value', { hours: reminderLeadHours })}
      />
      {/* The four choices sit here rather than behind a row, so the reminder time is set in one tap. */}
      {REMINDER_LEAD_HOUR_OPTIONS.map((hours) => (
        <SettingsOptionRow
          key={hours}
          title={t('notifset.reminderTime.option', { hours })}
          selected={reminderLeadHours === hours}
          onPress={() => chooseReminderLead(hours)}
        />
      ))}
      <SettingsNotice
        title={t('notifset.booking.notice')}
        body={t('notifset.booking.body', { hours: reminderLeadHours })}
      />
    </SettingsDetailScreen>
  );
}
