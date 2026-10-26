import type { Booking, Invoice } from '@/context/app-data-context';

/**
 * What happens to an invoice's booking when the invoice is deleted, restored or destroyed.
 *
 * Scope: only a plain *Delete* (and its Undo / Dustbin restore, permanent delete and 30-day purge)
 * touches the booking. Cancelling or voiding an invoice leaves its booking exactly as before.
 *
 * The link is the invoice's own stored `bookingId` — never a match on customer, date or amount. A
 * booking can be referenced by more than one invoice, so it is only removed when no *other active*
 * invoice still points at it.
 *
 * Storage, chosen for the released App Store app: the removed booking is taken *out* of the
 * workspace `bookings` list and kept on the invoice that removed it (`invoice.removedBooking`).
 * The released app renders, conflict-checks and reminds from `bookings`, so it simply never sees a
 * removed booking; and it preserves unknown fields on invoices when it saves, so the booking travels
 * through the Dustbin with its invoice. If that app restores the invoice it cannot put the booking
 * back itself — `reconcileLinkedBookings` does that the next time this version loads the workspace.
 *
 * Pure on purpose: every entry point and the tests apply the same rules.
 */

export type LinkedBookingImpact =
  | { kind: 'none' }
  | { kind: 'remove'; booking: Booking }
  /** Another active invoice still uses this booking, so it stays. */
  | { kind: 'keep_shared'; booking: Booking; sharedWith: Invoice[] };

/**
 * Whether removing an invoice in this way takes its booking too. Only a plain Delete does; a Cancel
 * or a Void keeps the booking exactly as it always has.
 */
export function removalTakesLinkedBooking(mode: 'delete' | 'cancel' | 'void') {
  return mode === 'delete';
}

function linkedBookingId(invoice: Pick<Invoice, 'bookingId'>) {
  return typeof invoice.bookingId === 'string' ? invoice.bookingId.trim() : '';
}

function isRemovedBooking(value: unknown): value is Booking {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Booking).id === 'string');
}

/** Decides, before anything changes, what deleting this invoice will do to its booking. */
export function getLinkedBookingImpact(invoice: Invoice, allInvoices: Invoice[], bookings: Booking[]): LinkedBookingImpact {
  const bookingId = linkedBookingId(invoice);
  if (!bookingId) return { kind: 'none' };
  const booking = bookings.find((item) => item.id === bookingId);
  if (!booking) return { kind: 'none' };

  const sharedWith = allInvoices.filter(
    (item) => item.id !== invoice.id && !item.deletedAt && linkedBookingId(item) === bookingId,
  );
  return sharedWith.length > 0 ? { kind: 'keep_shared', booking, sharedWith } : { kind: 'remove', booking };
}

/**
 * Deleting `invoice`: the bookings that remain, and the booking to keep on the invoice (or null).
 * Returns the same `bookings` array when nothing is removed.
 */
export function removeLinkedBooking(invoice: Invoice, allInvoices: Invoice[], bookings: Booking[]) {
  const impact = getLinkedBookingImpact(invoice, allInvoices, bookings);
  if (impact.kind !== 'remove') return { impact, bookings, removedBooking: null as Booking | null };
  return {
    impact,
    bookings: bookings.filter((booking) => booking.id !== impact.booking.id),
    removedBooking: impact.booking,
  };
}

/**
 * Restoring `invoice`: puts its booking back if an invoice deletion removed it. The booking may be
 * held by this invoice, or by another invoice of the same booking that was deleted after it. The
 * invoices to clear `removedBooking` on are returned, so the caller updates them in the same step.
 */
export function restoreLinkedBooking(invoice: Invoice, allInvoices: Invoice[], bookings: Booking[]) {
  const bookingId = linkedBookingId(invoice);
  if (!bookingId) return { bookings, restored: false, clearOn: [] as string[] };

  const holders = allInvoices.filter((item) => isRemovedBooking(item.removedBooking) && item.removedBooking.id === bookingId);
  if (holders.length === 0) return { bookings, restored: false, clearOn: [] as string[] };

  const clearOn = holders.map((item) => item.id);
  if (bookings.some((booking) => booking.id === bookingId)) return { bookings, restored: false, clearOn };
  // The holder that removed it most recently has the latest copy.
  const holder = holders.find((item) => item.id === invoice.id) ?? holders[holders.length - 1];
  return { bookings: [...bookings, holder.removedBooking as Booking], restored: true, clearOn };
}

/**
 * Destroying invoices for good (permanent delete or the 30-day purge): a booking they hold goes with
 * them — unless an invoice that still exists references it. Then it is kept: put back if that
 * invoice is active, or handed to it if it is still in the Dustbin (so restoring it brings the
 * booking back).
 */
export function purgeLinkedBookings(purgedIds: Iterable<string>, allInvoices: Invoice[], bookings: Booking[]) {
  const purged = new Set(purgedIds);
  let nextBookings = bookings;
  const handOver = new Map<string, Booking>();

  for (const invoice of allInvoices) {
    if (!purged.has(invoice.id) || !isRemovedBooking(invoice.removedBooking)) continue;
    const booking = invoice.removedBooking;
    const successor = allInvoices.find((item) => !purged.has(item.id) && linkedBookingId(item) === booking.id);
    if (!successor) continue;
    if (!successor.deletedAt) {
      if (!nextBookings.some((item) => item.id === booking.id)) nextBookings = [...nextBookings, booking];
    } else if (!isRemovedBooking(successor.removedBooking)) {
      handOver.set(successor.id, booking);
    }
  }
  return { bookings: nextBookings, handOver };
}

/**
 * Makes the workspace consistent whichever app version last changed it. Run on every load.
 *
 *  - An active invoice holding a removed booking (restored by an app version that did not know to
 *    put it back) returns that booking to the list.
 *  - An active invoice whose booking is missing gets it back from a Dustbin invoice holding it.
 *
 * Returns the same arrays when nothing needs changing, so a consistent workspace queues no save.
 */
export function reconcileLinkedBookings(invoices: Invoice[], bookings: Booking[]) {
  let nextBookings = bookings;
  const clear = new Set<string>();

  for (const invoice of invoices) {
    if (invoice.deletedAt) continue;
    const bookingId = linkedBookingId(invoice);
    const ownHeld = isRemovedBooking(invoice.removedBooking) ? invoice.removedBooking : null;
    const missing = bookingId && !nextBookings.some((booking) => booking.id === bookingId);
    if (!ownHeld && !missing) continue;

    const { bookings: restoredBookings, clearOn } = restoreLinkedBooking(invoice, invoices, nextBookings);
    nextBookings = restoredBookings;
    clearOn.forEach((id) => clear.add(id));
    if (ownHeld) {
      // Held by an active invoice for a booking id it no longer points at: put it back as-is.
      if (!nextBookings.some((booking) => booking.id === ownHeld.id)) nextBookings = [...nextBookings, ownHeld];
      clear.add(invoice.id);
    }
  }

  if (clear.size === 0 && nextBookings === bookings) return { invoices, bookings };
  const nextInvoices = clear.size
    ? invoices.map((invoice) => (clear.has(invoice.id) ? { ...invoice, removedBooking: null } : invoice))
    : invoices;
  return { invoices: nextInvoices, bookings: nextBookings };
}
