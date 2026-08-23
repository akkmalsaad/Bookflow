import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Booking } from '@/context/app-data-context';

const TODAY_PRIORITY_CHANNEL_ID = 'today-priority';
const TODAY_PRIORITY_PREFIX = 'today-priority-';
const REMINDER_LEAD_TIME_MS = 5 * 60 * 60 * 1000;

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

function bookingNotificationId(booking: Booking) {
  return `${TODAY_PRIORITY_PREFIX}${booking.id}`;
}

function formatTime(value?: string) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;

  const hour24 = Number(match[1]);
  const hour12 = hour24 % 12 || 12;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour12}:${match[2]} ${period}`;
}

function getBookingStartDate(booking: Booking) {
  const time = booking.startTime ?? booking.time;
  if (!time) return null;
  const match = time.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;

  const date = new Date(`${booking.date}T00:00:00`);
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
}

export async function syncTodayPriorityNotifications(todaysBookings: Booking[]) {
  const granted = await ensureNotificationPermission();
  if (!granted) return;

  await setupTodayPriorityChannel();

  const upcoming = todaysBookings.filter((booking) => {
    if (booking.status === 'Cancelled') return false;
    const startDate = getBookingStartDate(booking);
    return startDate !== null && startDate.getTime() > Date.now();
  });

  const activeIds = new Set(upcoming.map(bookingNotificationId));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => item.identifier.startsWith(TODAY_PRIORITY_PREFIX) && !activeIds.has(item.identifier))
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );

  await Promise.all(
    upcoming.map((booking) => {
      const startDate = getBookingStartDate(booking);
      if (!startDate) return Promise.resolve();

      const time = formatTime(booking.startTime ?? booking.time);
      const reminderDate = new Date(startDate.getTime() - REMINDER_LEAD_TIME_MS);
      const triggerDate = reminderDate.getTime() > Date.now() ? reminderDate : new Date(Date.now() + 5000);

      return Notifications.scheduleNotificationAsync({
        identifier: bookingNotificationId(booking),
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
