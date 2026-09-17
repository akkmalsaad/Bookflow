import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Booking } from '@/context/app-data-context';
import {
  BOOKING_REMINDER_PREFIX,
  bookingNotificationId,
  formatBookingTime,
  getBookingReminderDate,
} from '@/lib/booking-reminders';

const TODAY_PRIORITY_CHANNEL_ID = 'today-priority';
const TODAY_PRIORITY_PREFIX = BOOKING_REMINDER_PREFIX;
/**
 * Reminders that were already past due when BookFlow armed them, so a later sync in the same
 * session cannot deliver the same one a second time. The OS holds the ones still waiting.
 *
 * Keyed by booking *and* the instant the reminder was due, not by booking alone: changing the
 * reminder time gives a booking a genuinely different due moment, and that one is allowed to be
 * caught up even though the earlier one already was.
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

/**
 * iOS keeps at most 64 pending local notification requests per app and silently drops anything past
 * that, so the nearest reminders are the ones armed. The rest take their place on a later sync, once
 * the earlier requests have fired and freed their slots.
 */
const IOS_PENDING_REQUEST_LIMIT = 64;

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Hands every Today's priority reminder to the OS ahead of time, so iOS delivers it whether
 * BookFlow is open, backgrounded or terminated.
 *
 * Takes the whole booking list rather than only today's jobs, and that is the point. A reminder
 * falls due a set number of hours before its booking starts, so by the time a booking's date *is*
 * today that instant has often already gone by — arming it only then left the OS nothing to hold,
 * and the reminder could surface only while the dashboard happened to be on screen. Arming it as
 * soon as the booking exists gives iOS the request days in advance, which is what lets it fire with
 * the app closed.
 *
 * Which jobs qualify is unchanged: an active (neither completed nor cancelled) booking with a start
 * time. How far ahead of that start the reminder lands is the person's own setting, read through
 * `getBookingReminderDate`.
 */
export async function syncTodayPriorityNotifications(bookings: Booking[]) {
  const granted = await ensureNotificationPermission();
  if (!granted) return;

  await setupTodayPriorityChannel();

  const now = Date.now();
  const todayKey = getLocalDateKey(new Date());

  const eligible = bookings
    .map((booking) => ({ booking, reminderDate: getBookingReminderDate(booking) }))
    .filter((entry): entry is { booking: Booking; reminderDate: Date } => {
      const { booking, reminderDate } = entry;
      if (reminderDate === null) return false;
      // The same jobs the Today's priority card lists: the cancelled and the finished are neither
      // shown nor reminded about.
      if (booking.status === 'Cancelled' || booking.status === 'Completed') return false;

      // Still ahead, so the OS can hold it until it is due. This is the ordinary case now.
      if (reminderDate.getTime() > now) return true;
      // Already past. Caught up only for a job still on today's card, exactly as before, so a
      // booking from a day that has been and gone can never fire a reminder about it.
      return booking.date === todayKey;
    })
    .sort((first, second) => first.reminderDate.getTime() - second.reminderDate.getTime())
    .slice(0, IOS_PENDING_REQUEST_LIMIT);

  const activeIds = new Set(eligible.map((entry) => bookingNotificationId(entry.booking)));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  // A booking that was cancelled, completed, rescheduled out of range or deleted loses the request
  // the OS is still holding for it, so a stale reminder cannot arrive later.
  await Promise.all(
    scheduled
      .filter((item) => item.identifier.startsWith(TODAY_PRIORITY_PREFIX) && !activeIds.has(item.identifier))
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );

  /**
   * What the OS is holding for each of this app's reminders, and the instant each one was armed
   * for.
   *
   * The identifier is only the booking's id, so it says nothing about *when* the request will
   * fire. Treating "an id is already pending" as "this reminder is correct" is what would leave a
   * request armed against the old lead time after the setting changed — or against a booking's old
   * start time after it was moved. The instant is carried on the request's own `data`, which comes
   * back with it, so the two can be compared.
   */
  const armedAt = new Map<string, number | null>();
  for (const item of scheduled) {
    if (!item.identifier.startsWith(TODAY_PRIORITY_PREFIX)) continue;
    const stamp = item.content.data?.reminderAt;
    armedAt.set(item.identifier, typeof stamp === 'number' ? stamp : null);
  }

  await Promise.all(
    eligible.map(async ({ booking, reminderDate }) => {
      const identifier = bookingNotificationId(booking);
      const reminderAt = reminderDate.getTime();

      if (armedAt.has(identifier)) {
        // Already waiting with the OS for exactly this instant: leave it as it is. Re-issuing the
        // id is what would leave two copies of one reminder, and rescheduling a due one on every
        // sync would keep pushing its delivery further out.
        if (armedAt.get(identifier) === reminderAt) return;
        // Armed for a different instant — the reminder time changed, or the booking moved. The
        // stale request is withdrawn first, so the old one can never outlive its replacement.
        // A request written before reminders carried this stamp reads as `null` and is replaced
        // once, here.
        await Notifications.cancelScheduledNotificationAsync(identifier);
      }

      const isDue = reminderAt <= now;
      // A reminder whose moment has passed is delivered once, not again on every later sync.
      const deliveryKey = `${identifier}@${reminderAt}`;
      if (isDue && deliveredImmediately.has(deliveryKey)) return;
      if (isDue) deliveredImmediately.add(deliveryKey);

      const time = formatBookingTime(booking.startTime ?? booking.time);
      const triggerDate = isDue ? new Date(now + 5000) : reminderDate;

      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: "Today's priority",
          body: time ? `${booking.title} at ${time} — ${booking.location}` : `${booking.title} — ${booking.location}`,
          sound: true,
          // Never displayed. It records which instant this request was armed for, so a later sync
          // can tell a request that is still correct from one that needs replacing.
          data: { reminderAt },
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

/**
 * Removes this app's booking reminders still waiting with the OS. Used when the account is
 * deleted, so a reminder about a deleted customer's booking can never fire afterwards.
 */
export async function cancelBookingReminderNotifications() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((item) => item.identifier.startsWith(TODAY_PRIORITY_PREFIX))
        .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
    );
  } catch {
    // Best effort: notification access can be unavailable (e.g. Expo Go on Android).
  }
}
