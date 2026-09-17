import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * How far ahead of a booking its reminder fires.
 *
 * Stored with expo-secure-store under a `bookflow.*` key and read synchronously, the same way the
 * appearance preference is (see context/theme-context.tsx): the scheduler and the in-app notification
 * centre both work out reminder times during a render or an effect, so an await there would mean
 * arming reminders against a lead time that had not arrived yet.
 */

export const REMINDER_LEAD_HOUR_OPTIONS = [24, 12, 6, 4] as const;
export type ReminderLeadHours = (typeof REMINDER_LEAD_HOUR_OPTIONS)[number];

/** What everyone gets until they choose otherwise, and the fallback whenever storage cannot be read. */
export const DEFAULT_REMINDER_LEAD_HOURS: ReminderLeadHours = 6;

const REMINDER_LEAD_KEY = 'bookflow.reminderLeadHours';

function isReminderLeadHours(value: unknown): value is ReminderLeadHours {
  return REMINDER_LEAD_HOUR_OPTIONS.some((option) => option === Number(value));
}

function readStored(): ReminderLeadHours {
  // Web is the public invoice page, which schedules nothing.
  if (Platform.OS === 'web') return DEFAULT_REMINDER_LEAD_HOURS;
  try {
    const stored = SecureStore.getItem(REMINDER_LEAD_KEY);
    return isReminderLeadHours(stored) ? (Number(stored) as ReminderLeadHours) : DEFAULT_REMINDER_LEAD_HOURS;
  } catch {
    return DEFAULT_REMINDER_LEAD_HOURS;
  }
}

let cached: ReminderLeadHours | null = null;
const listeners = new Set<() => void>();

/** The chosen lead time. Read from storage once, then served from memory. */
export function getReminderLeadHours(): ReminderLeadHours {
  if (cached === null) cached = readStored();
  return cached;
}

/** The same value as a duration, which is what every reminder calculation actually subtracts. */
export function getReminderLeadTimeMs() {
  return getReminderLeadHours() * 60 * 60 * 1000;
}

export function setReminderLeadHours(hours: ReminderLeadHours) {
  if (hours === getReminderLeadHours()) return;

  // Updated in memory and published before the write, so the screens and the scheduler act on the
  // new lead time immediately rather than waiting on storage.
  cached = hours;
  listeners.forEach((listener) => listener());

  if (Platform.OS === 'web') return;
  SecureStore.setItemAsync(REMINDER_LEAD_KEY, String(hours)).catch((error) => {
    if (__DEV__) console.warn('[reminders] could not save the reminder time', error);
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders the subscriber whenever the lead time changes, wherever it was changed from. */
export function useReminderLeadHours(): ReminderLeadHours {
  return useSyncExternalStore(subscribe, getReminderLeadHours, getReminderLeadHours);
}
