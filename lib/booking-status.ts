import type { Ionicons } from '@expo/vector-icons';

import type { Booking } from '@/context/app-data-context';

/**
 * The job's lifecycle. Deliberately separate from invoice status and payment status: nothing about
 * billing ("Deposit Paid", "Invoice Sent", "Overdue") belongs in here.
 *
 * The values are the stored ones. BookFlow persists booking and invoice states as their display
 * strings throughout, so this reuses the field the app already has rather than introducing a second,
 * competing status key that every existing record and consumer would have to be migrated onto.
 */
export type BookingStatus = Booking['status'];

/** Presentation order for pickers and legends — the natural progression of a job. */
export const BOOKING_STATUS_ORDER: readonly BookingStatus[] = [
  'Inquiry',
  'Confirmed',
  'In Progress',
  'Completed',
  'Cancelled',
] as const;

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type BookingStatusPalette = {
  /** Soft tinted pill background. */
  tint: string;
  /** Label colour, contrast-checked against `tint`. */
  text: string;
  /** The status dot. */
  dot: string;
};

export type BookingStatusConfig = {
  label: string;
  /** A second, non-colour signal — the status is never carried by hue alone. */
  icon: IoniconName;
  /** Selecting this needs an explicit confirmation. */
  destructive: boolean;
  /** Maps onto the existing StatusPill tones, so other surfaces stay consistent. */
  pillTone: 'blue' | 'green' | 'amber' | 'red' | 'gray';
  light: BookingStatusPalette;
  dark: BookingStatusPalette;
};

/**
 * One definition per status: label, icon, and both themes' colours. Everything that renders a
 * booking status reads from here rather than re-deriving its own mapping, so the calendar can later
 * pick up the same indicators for free.
 *
 * The light tints match the existing StatusPill tones exactly, so a booking status looks the same
 * wherever it appears.
 */
export const BOOKING_STATUS_CONFIG: Record<BookingStatus, BookingStatusConfig> = {
  Inquiry: {
    label: 'Inquiry',
    icon: 'help-circle-outline',
    destructive: false,
    pillTone: 'amber',
    light: { tint: '#FFF6E7', text: '#B26C00', dot: '#F59E0B' },
    dark: { tint: '#3A2E12', text: '#FBBF24', dot: '#FBBF24' },
  },
  Confirmed: {
    label: 'Confirmed',
    icon: 'checkmark-circle-outline',
    destructive: false,
    pillTone: 'blue',
    light: { tint: '#EEF2FF', text: '#4F46E5', dot: '#4F46E5' },
    dark: { tint: '#29284B', text: '#A5B4FC', dot: '#818CF8' },
  },
  'In Progress': {
    label: 'In Progress',
    icon: 'play-circle-outline',
    destructive: false,
    pillTone: 'blue',
    light: { tint: '#EAF3FF', text: '#1C5FDA', dot: '#2563EB' },
    dark: { tint: '#16304D', text: '#7DD3FC', dot: '#38BDF8' },
  },
  Completed: {
    label: 'Completed',
    icon: 'checkmark-done-circle-outline',
    destructive: false,
    pillTone: 'green',
    light: { tint: '#EAFBF2', text: '#117A4C', dot: '#10B981' },
    dark: { tint: '#12362B', text: '#34D399', dot: '#34D399' },
  },
  Cancelled: {
    label: 'Cancelled',
    icon: 'close-circle-outline',
    destructive: true,
    pillTone: 'red',
    light: { tint: '#FDECEC', text: '#B42318', dot: '#DC2626' },
    dark: { tint: '#3B1F2B', text: '#FCA5A5', dot: '#F87171' },
  },
};

export const DEFAULT_BOOKING_STATUS: BookingStatus = 'Inquiry';

/**
 * The status to *render* for a booking, including legacy records saved before a status existed or
 * carrying a value this build does not know.
 *
 * Read-only on purpose: it never writes the fallback back to the workspace, so simply opening a
 * screen can never rewrite history. A record is only corrected when someone picks a status.
 */
export function resolveBookingStatus(status: string | null | undefined): BookingStatus {
  return BOOKING_STATUS_ORDER.find((candidate) => candidate === status) ?? DEFAULT_BOOKING_STATUS;
}

export function getBookingStatusConfig(status: string | null | undefined) {
  return BOOKING_STATUS_CONFIG[resolveBookingStatus(status)];
}

/** The config plus the colours for the active theme, which is what components actually want. */
export function getBookingStatusVisual(status: string | null | undefined, isDarkMode: boolean) {
  const config = getBookingStatusConfig(status);
  return { ...config, colors: isDarkMode ? config.dark : config.light };
}
