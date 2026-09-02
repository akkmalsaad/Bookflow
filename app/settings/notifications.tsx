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

export default function NotificationSettingsScreen() {
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
      eyebrow="Preferences"
      title="Notifications & reminders"
      description="BookFlow sends reminders from this device. Turning notifications on or off is handled by your system settings.">
      <SettingsInfoRow label="Permission" value={permissionLabel} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open system notification settings"
        onPress={() => Linking.openSettings()}
        style={({ pressed }) => [
          settingsDetailStyles.primaryButton,
          { backgroundColor: palette.accent, shadowColor: palette.accent, marginTop: 6 },
          pressed && { opacity: 0.8 },
        ]}>
        <Text style={settingsDetailStyles.primaryButtonText}>Open system settings</Text>
      </Pressable>

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>Booking notifications</Text>
      <SettingsInfoRow label="Upcoming booking reminder" value="On · 5 hours before each booking" />
      <SettingsNotice
        title="Booking changes are not sent yet"
        body="BookFlow only schedules the reminder for today's bookings. Alerts when a booking is moved or cancelled have not been built."
      />

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>Payment notifications</Text>
      <SettingsNotice
        title="Not available yet"
        body="Nothing is sent for payments today. These are planned:"
        items={['Outstanding payment reminder', 'Deposit reminder']}
      />

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>Invoice notifications</Text>
      <SettingsNotice
        title="Not available yet"
        body="Invoice activity is shown in the app's notifications list, but nothing is pushed to your device. These are planned:"
        items={['Invoice accepted', 'Invoice viewed', 'Invoice overdue']}
      />
    </SettingsDetailScreen>
  );
}
