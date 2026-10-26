/**
 * Delivery tracking for a booking — the work that happens after the job itself.
 *
 * Deliberately its own field, separate from the booking's lifecycle status (Inquiry → Completed) and
 * from payment state: a wedding can be Completed, part-paid and still have its gallery in editing.
 *
 * `internalNotes` never leave the owner's workspace. `toPublicFulfilment` is the only projection a
 * customer-facing surface may use, and it drops them.
 */

export type FulfilmentStatus = 'not_started' | 'service_completed' | 'in_progress' | 'delivered';

export const FULFILMENT_STATUS_ORDER: readonly FulfilmentStatus[] = [
  'not_started',
  'service_completed',
  'in_progress',
  'delivered',
] as const;

export type BookingFulfilment = {
  status: FulfilmentStatus;
  /** Promised delivery date, `YYYY-MM-DD`. Optional. */
  promisedDate?: string;
  /** Owner-only notes. Never shown to customers. */
  internalNotes?: string;
  /** Optional gallery or delivery link the customer may open. */
  deliveryLink?: string;
  updatedAt?: string;
};

export function isFulfilmentStatus(value: unknown): value is FulfilmentStatus {
  return FULFILMENT_STATUS_ORDER.includes(value as FulfilmentStatus);
}

/** Accepts only http(s) links, so a stored link can never become a `javascript:` URL on a public page. */
export function normalizeDeliveryLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500) return undefined;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    if (url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function normalizeFulfilment(value: unknown): BookingFulfilment | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  if (!isFulfilmentStatus(source.status)) return undefined;
  const promisedDate = typeof source.promisedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.promisedDate)
    ? source.promisedDate
    : undefined;
  const internalNotes = typeof source.internalNotes === 'string' && source.internalNotes.trim()
    ? source.internalNotes.trim().slice(0, 2000)
    : undefined;
  const deliveryLink = normalizeDeliveryLink(source.deliveryLink);
  return {
    status: source.status,
    ...(promisedDate ? { promisedDate } : {}),
    ...(internalNotes ? { internalNotes } : {}),
    ...(deliveryLink ? { deliveryLink } : {}),
    ...(typeof source.updatedAt === 'string' ? { updatedAt: source.updatedAt } : {}),
  };
}

export type DeliveryState = 'none' | 'upcoming' | 'due_today' | 'overdue' | 'delivered';

/**
 * Where a booking's delivery stands today. A booking that has never been tracked is 'none' and
 * stays out of the delivery lists; a cancelled booking owes no delivery.
 */
export function getDeliveryState(
  booking: { status: string; fulfilment?: BookingFulfilment },
  todayKey: string,
): DeliveryState {
  const fulfilment = booking.fulfilment;
  if (!fulfilment || booking.status === 'Cancelled') return 'none';
  if (fulfilment.status === 'delivered') return 'delivered';
  if (!fulfilment.promisedDate) return 'upcoming';
  if (fulfilment.promisedDate < todayKey) return 'overdue';
  if (fulfilment.promisedDate === todayKey) return 'due_today';
  return 'upcoming';
}

export type DeliveryFilter = 'open' | 'overdue' | 'delivered';

/**
 * Bookings for the deliveries list: overdue first, then by promised date (undated last). Only
 * bookings someone has started tracking appear at all.
 */
export function filterDeliveries<T extends { id: string; status: string; date: string; fulfilment?: BookingFulfilment }>(
  bookings: T[],
  filter: DeliveryFilter,
  todayKey: string,
): T[] {
  const rank = (state: DeliveryState) => (state === 'overdue' ? 0 : state === 'due_today' ? 1 : 2);
  return bookings
    .filter((booking) => {
      const state = getDeliveryState(booking, todayKey);
      if (state === 'none') return false;
      if (filter === 'delivered') return state === 'delivered';
      if (filter === 'overdue') return state === 'overdue';
      return state !== 'delivered';
    })
    .sort((first, second) => {
      const byRank = rank(getDeliveryState(first, todayKey)) - rank(getDeliveryState(second, todayKey));
      if (byRank) return byRank;
      const firstDate = first.fulfilment?.promisedDate ?? '9999-12-31';
      const secondDate = second.fulfilment?.promisedDate ?? '9999-12-31';
      return firstDate.localeCompare(secondDate) || first.date.localeCompare(second.date);
    });
}

/** The only fulfilment fields a customer may see. Internal notes are never included. */
export function toPublicFulfilment(fulfilment: BookingFulfilment | undefined) {
  if (!fulfilment) return null;
  return {
    status: fulfilment.status,
    promisedDate: fulfilment.promisedDate ?? '',
    deliveryLink: fulfilment.status === 'delivered' || fulfilment.deliveryLink ? fulfilment.deliveryLink ?? '' : '',
  };
}
