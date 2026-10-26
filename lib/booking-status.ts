import type { Ionicons } from '@expo/vector-icons';

import type { Booking, Invoice } from '@/context/app-data-context';
import type { TranslationKey } from '@/lib/i18n';

/**
 * The job's lifecycle. Deliberately separate from invoice status and payment status: nothing about
 * billing ("Deposit Paid", "Invoice Sent", "Overdue") belongs in here.
 *
 * The values are the stored ones. BookFlow persists booking and invoice states as their display
 * strings throughout, so this reuses the field the app already has rather than introducing a second,
 * competing status key that every existing record and consumer would have to be migrated onto.
 */
export type BookingStatus = Booking['status'];

/** The job stages a person can pick, in the natural progression of a job. */
export const BOOKING_STATUS_ORDER: readonly BookingStatus[] = [
  'Inquiry',
  'Confirmed',
  'In Progress',
  'Completed',
  'Cancelled',
] as const;

/**
 * Stored values that are no longer job stages. 'Deposit Paid' was payment information; the card's
 * payment badge shows it now. Bookings that hold it keep it, shown as legacy, until someone picks a
 * stage — nothing converts them automatically.
 */
const LEGACY_BOOKING_STATUSES: readonly BookingStatus[] = ['Deposit Paid'] as const;

export function isLegacyBookingStatus(status: string | null | undefined) {
  return LEGACY_BOOKING_STATUSES.some((candidate) => candidate === status);
}

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
  'Deposit Paid': {
    label: 'Deposit Paid',
    icon: 'wallet-outline',
    destructive: false,
    pillTone: 'green',
    light: { tint: '#E7F8F3', text: '#0F766E', dot: '#14B8A6' },
    dark: { tint: '#123536', text: '#5EEAD4', dot: '#2DD4BF' },
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
  return [...BOOKING_STATUS_ORDER, ...LEGACY_BOOKING_STATUSES].find((candidate) => candidate === status) ?? DEFAULT_BOOKING_STATUS;
}

/** The translated label for a stored status. The stored value itself is never changed. */
export function getBookingStatusLabelKey(status: string | null | undefined): TranslationKey {
  const resolved = resolveBookingStatus(status);
  return isLegacyBookingStatus(resolved) ? 'jobStatus.legacyDepositPaid' : `status.booking.${resolved}`;
}

export function getBookingStatusConfig(status: string | null | undefined) {
  return BOOKING_STATUS_CONFIG[resolveBookingStatus(status)];
}

/** The config plus the colours for the active theme, which is what components actually want. */
export function getBookingStatusVisual(status: string | null | undefined, isDarkMode: boolean) {
  const config = getBookingStatusConfig(status);
  return { ...config, colors: isDarkMode ? config.dark : config.light };
}

/**
 * The lane the automatic synchronisation may walk a booking along, in order. Cancelled is
 * deliberately absent: it is terminal, reached only by a person, and nothing derived from an
 * invoice may enter or leave it. A legacy 'Deposit Paid' is off the lane too, so it is left exactly
 * as stored until someone picks a stage.
 */
const AUTOMATIC_PROGRESSION: readonly BookingStatus[] = [
  'Inquiry',
  'Confirmed',
  'In Progress',
  'Completed',
] as const;

/**
 * Moves a booking forward to `target`, or leaves it exactly where it is.
 *
 * This is the single rule that stops derived data from undoing a person's decision: a booking that
 * is already further along the lane — or off it, on Cancelled — is returned untouched.
 */
export function advanceBookingStatus(
  current: string | null | undefined,
  target: BookingStatus,
): BookingStatus {
  const status = resolveBookingStatus(current);
  const currentRank = AUTOMATIC_PROGRESSION.indexOf(status);
  const targetRank = AUTOMATIC_PROGRESSION.indexOf(target);

  // Cancelled and a legacy status sit off the lane (rank -1) and so never move.
  if (currentRank === -1 || targetRank === -1) return status;
  return targetRank > currentRank ? target : status;
}

/**
 * Reconciles every booking against its invoices' acceptance. A live linked invoice the customer has
 * accepted confirms the booking; that is the only automatic move.
 *
 * Payments are deliberately not read: recording, editing or removing a payment never changes job
 * progress — payment state lives on the invoice and is shown beside the job status, not in it. (No
 * payment write sets an invoice to Accepted, so payments cannot reach this through acceptance.)
 *
 * Forward-only, so a manual 'In Progress', 'Completed' or 'Cancelled' is never pulled back by an
 * invoice accepted earlier in the job's life. Returns the array it was given when nothing moved, so
 * callers can hand the result straight to setState without causing a render.
 */
export function syncBookingStatuses(bookings: Booking[], invoices: Invoice[]): Booking[] {
  const acceptedBookingIds = new Set<string>();
  for (const invoice of invoices) {
    // A trashed invoice's link is closed, so it stops being evidence of anything new. Bookings it
    // already moved forward stay where they are — this pass only ever advances.
    if (!invoice.bookingId || invoice.deletedAt) continue;
    if (invoice.status === 'Accepted') acceptedBookingIds.add(invoice.bookingId);
  }

  let changed = false;
  const next = bookings.map((booking) => {
    if (!acceptedBookingIds.has(booking.id)) return booking;

    const synced = advanceBookingStatus(booking.status, 'Confirmed');
    // Compared against the *resolved* status so a legacy or unknown value is only ever rewritten
    // by a real advance, never by the display fallback.
    if (synced === resolveBookingStatus(booking.status)) return booking;

    changed = true;
    return { ...booking, status: synced };
  });

  return changed ? next : bookings;
}
