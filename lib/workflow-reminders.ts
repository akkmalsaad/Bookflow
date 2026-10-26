import type { AppNotification, Booking, Invoice, InvoicePayment } from '@/context/app-data-context';

/**
 * Owner reminders for the booking workflows: a promised delivery that has slipped, and a deposit
 * whose due date has arrived without the deposit being received in full.
 *
 * They use the existing in-app notification centre, under ids derived from the booking and the
 * date, so a reminder is written once and never again — the same rules as the booking reminders in
 * lib/booking-reminders, including respect for "Clear all". Nothing is ever sent to a customer.
 */

function startOfDay(day: string) {
  const date = new Date(`${day}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function materialiseWorkflowNotifications(
  bookings: Booking[],
  invoices: Invoice[],
  payments: InvoicePayment[],
  existing: AppNotification[],
  todayKey: string,
  clearedAt: number | null = null,
): AppNotification[] {
  const known = new Set(existing.map((notification) => notification.id));
  const created: AppNotification[] = [];

  const paidByBooking = new Map<string, number>();
  for (const invoice of invoices) {
    if (!invoice.bookingId || invoice.deletedAt) continue;
    const paid = payments
      .filter((payment) => payment.invoiceId === invoice.id)
      .reduce((total, payment) => total + Math.round(payment.amount * 100), 0);
    paidByBooking.set(invoice.bookingId, (paidByBooking.get(invoice.bookingId) ?? 0) + paid);
  }

  const push = (id: string, day: string, title: string, message: string) => {
    if (known.has(id)) return;
    const due = startOfDay(day);
    if (!due) return;
    if (clearedAt !== null && due.getTime() <= clearedAt) return;
    known.add(id);
    created.push({ id, title, message, createdAt: due.toISOString(), isOpened: false, type: 'reminder' });
  };

  for (const booking of bookings) {
    if (booking.status === 'Cancelled') continue;

    const fulfilment = booking.fulfilment;
    if (fulfilment && fulfilment.status !== 'delivered' && fulfilment.promisedDate && fulfilment.promisedDate < todayKey) {
      push(`delivery-overdue-${booking.id}-${fulfilment.promisedDate}`, fulfilment.promisedDate, booking.title, `Delivery overdue · promised ${fulfilment.promisedDate}`);
    }

    const depositCents = Math.round((booking.depositAmount ?? 0) * 100);
    if (booking.depositDueDate && booking.depositDueDate <= todayKey && depositCents > 0) {
      if ((paidByBooking.get(booking.id) ?? 0) < depositCents) {
        push(`deposit-due-${booking.id}-${booking.depositDueDate}`, booking.depositDueDate, booking.title, `Deposit due ${booking.depositDueDate} · not yet received in full`);
      }
    }
  }

  if (created.length === 0) return existing;
  return [...created, ...existing].sort(
    (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  );
}
