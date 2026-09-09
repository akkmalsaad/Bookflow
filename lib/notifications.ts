import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Booking } from '@/context/app-data-context';
import {
  BOOKING_REMINDER_PREFIX,
  bookingNotificationId,
  formatBookingTime,
  getBookingReminderDate,
  getBookingStartDate,
} from '@/lib/booking-reminders';

const TODAY_PRIORITY_CHANNEL_ID = 'today-priority';
const TODAY_PRIORITY_PREFIX = BOOKING_REMINDER_PREFIX;
/**
 * Reminders that were already past due when BookFlow armed them, so a later sync in the same
 * session cannot deliver the same one a second time. The OS holds the ones still waiting.
 */
const deliveredImmediately = new Set<string>();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function getNotificationPermissionStatus() {
  const current = await Notifications.getPermissionsAsync();
  return current.status;
}

export async function ensureNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return requested.granted;
}

export async function setupTodayPriorityChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(TODAY_PRIORITY_CHANNEL_ID, {
    name: "Today's priority",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

export async function syncTodayPriorityNotifications(todaysBookings: Booking[]) {
  const granted = await ensureNotificationPermission();
  if (!granted) return;

  await setupTodayPriorityChannel();

  // Every job the Today's priority card is showing, which is what the reminder is about. A job
  // whose start time has already gone by is still on that card, so it still gets its reminder —
  // requiring a future start was why a booking made for earlier today was silently skipped.
  const upcoming = todaysBookings.filter((booking) => {
    if (booking.status === 'Cancelled') return false;
    return getBookingStartDate(booking) !== null;
  });

  const activeIds = new Set(upcoming.map(bookingNotificationId));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => item.identifier.startsWith(TODAY_PRIORITY_PREFIX) && !activeIds.has(item.identifier))
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );

  const alreadyScheduled = new Set(scheduled.map((item) => item.identifier));

  await Promise.all(
    upcoming.map((booking) => {
      const reminderDate = getBookingReminderDate(booking);
      if (!reminderDate) return Promise.resolve();

      const identifier = bookingNotificationId(booking);
      // Already waiting with the OS: leave it exactly as it is. Rescheduling on each sync would
      // keep pushing a due reminder's delivery further out, so it would never arrive.
      if (alreadyScheduled.has(identifier)) return Promise.resolve();

      const isDue = reminderDate.getTime() <= Date.now();
      // A reminder whose moment has passed is delivered once, not again on every later sync.
      if (isDue && deliveredImmediately.has(identifier)) return Promise.resolve();
      if (isDue) deliveredImmediately.add(identifier);

      const time = formatBookingTime(booking.startTime ?? booking.time);
      const triggerDate = isDue ? new Date(Date.now() + 5000) : reminderDate;

      return Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: "Today's priority",
          body: time ? `${booking.title} at ${time} — ${booking.location}` : `${booking.title} — ${booking.location}`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
          channelId: TODAY_PRIORITY_CHANNEL_ID,
        },
      });
    }),
  );
}

/**
 * Fires when a notification is delivered while BookFlow is in the foreground. Used only to refresh
 * in-app state at the moment a reminder lands; the persisted records remain the source of truth.
 */
export function onNotificationReceived(handler: () => void) {
  return Notifications.addNotificationReceivedListener(() => handler());
}
