import type { Booking, Invoice, InvoicePayment } from '@/context/app-data-context';
import type { TranslationKey } from '@/lib/i18n';
import { normalizeBookingTime } from '@/lib/booking-conflicts';
import {
  buildPricedLines,
  chargeAmountCents,
  fromCents,
  normalizePricedLines,
  resolveBookingMoney,
  toCents,
  type BookingCharge,
  type DepositType,
} from '@/lib/booking-pricing';
import type { InvoiceCustomerSnapshot } from '@/lib/invoice-customer';
import { canEditInvoice } from '@/lib/invoice-lifecycle';
import { getInvoicePayments, resolveInvoiceStatus, sumPaymentsInCents } from '@/lib/invoice-payments';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** What the invoice form hands back when an existing invoice is saved. */
export type InvoiceEditInput = {
  customerId: string;
  /** The client as they are now; omitted when the client was deleted and the invoice keeps its own. */
  customerSnapshot?: InvoiceCustomerSnapshot;
  serviceName: string;
  packageDetails?: string;
  /** The total: package price plus additional charges. */
  price: number;
  basePrice?: number;
  charges?: BookingCharge[];
  depositAmount?: number;
  depositType?: DepositType;
  depositValue?: number;
  depositDueDate?: string;
  dueDate: string;
  terms?: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
};

export type InvoiceEditResult = { ok: true; invoice: Invoice } | { ok: false; error: TranslationKey };

/**
 * The invoice as the booking form reads it, so editing reuses the creation form unchanged. Money
 * comes from the invoice's own frozen lines — never from the service, which may have changed since.
 */
export function getInvoiceEditSource(invoice: Invoice, booking?: Booking): Booking {
  const charges = (normalizePricedLines(invoice.lineItems) ?? [])
    .filter((line) => line.kind === 'charge')
    .map<BookingCharge>((line, index) => ({
      id: `${invoice.id}-charge-${index}`,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: fromCents(chargeAmountCents(line.quantity, line.unitPrice)),
      ...(line.unit ? { unit: line.unit } : {}),
    }));
  const chargesCents = charges.reduce((sum, charge) => sum + toCents(charge.amount), 0);
  const startTime = invoice.eventStartTime ?? booking?.startTime ?? invoice.eventTime ?? booking?.time;

  return {
    // The linked booking's id, so the form never reports the invoice's own slot as a clash.
    id: invoice.bookingId || invoice.id,
    customerId: invoice.customerId,
    title: invoice.serviceName ?? booking?.title ?? '',
    date: invoice.eventDate ?? booking?.date ?? invoice.sentAt,
    time: startTime,
    startTime,
    endTime: invoice.eventEndTime ?? booking?.endTime,
    location: invoice.eventLocation ?? booking?.location ?? '',
    packageName: invoice.serviceName ?? booking?.packageName ?? '',
    ...(booking?.packageId ? { packageId: booking.packageId } : {}),
    price: invoice.amount,
    ...(charges.length ? { basePrice: fromCents(Math.max(0, toCents(invoice.amount) - chargesCents)), charges } : {}),
    ...(invoice.depositDue ? { depositAmount: invoice.depositDue } : {}),
    ...(invoice.depositDueDate ? { depositDueDate: invoice.depositDueDate } : {}),
    ...(booking?.bufferMinutes ? { bufferMinutes: booking.bufferMinutes } : {}),
    // Always set, so an invoice without terms is not handed the service's terms just by opening it.
    terms: invoice.terms ?? '',
    status: booking?.status ?? 'Inquiry',
    notes: '',
  };
}

/**
 * Applies an edit to the same invoice record. Its id, number, issue date, snapshot, booking link,
 * payments and status are kept — an accepted invoice stays accepted. The only status that moves is
 * one derived from money (Paid / Partially Paid), recalculated against the new total.
 */
export function applyInvoiceEdit(invoice: Invoice, input: InvoiceEditInput, payments: InvoicePayment[]): InvoiceEditResult {
  if (!canEditInvoice(invoice)) return { ok: false, error: 'invoice.edit.error.closed' };

  const startTime = normalizeBookingTime(input.startTime);
  const endTime = normalizeBookingTime(input.endTime);
  if (!input.customerId || !DATE_KEY.test(input.date) || !startTime || !endTime || endTime <= startTime) {
    return { ok: false, error: 'bookings.error.fields' };
  }
  // An untouched due date is kept as stored, even one typed in another format before.
  if (input.dueDate !== invoice.dueDate && !DATE_KEY.test(input.dueDate)) return { ok: false, error: 'invoice.edit.error.dueDate' };

  // The same money rules every booking and invoice is saved with.
  const money = resolveBookingMoney({
    price: input.price,
    basePrice: input.basePrice,
    charges: input.charges,
    depositAmount: input.depositAmount,
    depositType: input.depositType,
    depositValue: input.depositValue,
    depositDueDate: input.depositDueDate,
  });
  if (!money.ok) {
    return {
      ok: false,
      error: money.error === 'price' ? 'bookings.error.fields'
        : money.error === 'charges' ? 'bm.error.charges'
          : money.error === 'deposit_percent' ? 'bm.error.depositPercent'
            : money.error === 'deposit_too_high' ? 'bm.error.depositTotal'
              : 'bookings.error.deposit',
    };
  }
  const fields = money.fields;

  // Payments already received are never rewritten, so the total cannot drop below them.
  const paidCents = sumPaymentsInCents(getInvoicePayments(invoice.id, payments));
  if (toCents(fields.price) < paidCents) return { ok: false, error: 'invoice.edit.error.belowPaid' };

  const isMoneyStatus = invoice.status === 'Paid' || invoice.status === 'Partially Paid';
  const status = isMoneyStatus && paidCents > 0 ? resolveInvoiceStatus({ ...invoice, amount: fields.price }, paidCents) : invoice.status;
  // Text the form only trimmed is kept exactly as stored, so saving an untouched form changes nothing.
  const keepText = (next: string | undefined, stored: string | undefined) =>
    (next ?? '').trim() === (stored ?? '').trim() ? stored : next?.trim() || undefined;
  const serviceName = keepText(input.serviceName, invoice.serviceName);
  const terms = keepText(input.terms, invoice.terms);
  const location = keepText(input.location, invoice.eventLocation);
  const packageDetails = keepText(input.packageDetails, invoice.packageDetails);

  // Replaced as a set, so removing every charge, the deposit or the terms really removes them.
  const {
    lineItems: _lineItems,
    depositDue: _depositDue,
    depositDueDate: _depositDueDate,
    terms: _terms,
    packageDetails: _packageDetails,
    serviceName: _serviceName,
    eventLocation: _eventLocation,
    ...kept
  } = invoice;

  return {
    ok: true,
    invoice: {
      ...kept,
      customerId: input.customerId,
      ...(input.customerSnapshot ? { customerSnapshot: input.customerSnapshot } : {}),
      amount: fields.price,
      dueDate: input.dueDate,
      status,
      ...(serviceName !== undefined ? { serviceName } : {}),
      ...(packageDetails !== undefined ? { packageDetails } : {}),
      ...(terms !== undefined ? { terms } : {}),
      ...(location !== undefined ? { eventLocation: location } : {}),
      eventDate: input.date,
      eventTime: startTime,
      eventStartTime: startTime,
      eventEndTime: endTime,
      ...(fields.charges?.length
        ? { lineItems: buildPricedLines({ packageName: serviceName ?? '', packageDetails, basePrice: fields.basePrice ?? fields.price, charges: fields.charges }) }
        : {}),
      ...(fields.depositAmount ? { depositDue: fields.depositAmount } : {}),
      ...(fields.depositDueDate ? { depositDueDate: fields.depositDueDate } : {}),
    },
  };
}

/**
 * After an invoice edit, the booking it is linked to (by the invoice's stored `bookingId`) takes the
 * event details the edit changed — date, start and finish time, location — so the calendar shows
 * what the invoice now says. The same booking record moves; nothing is created.
 *
 * Only fields this edit actually changed are carried over. A booking can legitimately differ from a
 * sent invoice (updateBooking leaves issued invoices as they were), and an edit that only touches
 * money must not pull such a booking back to the invoice's older details. Everything else on the
 * booking — price, deposit, charges, status, customer, notes, fulfilment, form origin — is its own.
 *
 * Returns the same booking object when nothing moves.
 */
export function syncLinkedBookingSchedule(booking: Booking, before: Invoice, after: Invoice): Booking {
  const changed = (previous: string | undefined, next: string | undefined) => (previous ?? '').trim() !== (next ?? '').trim();
  const updates: Partial<Booking> = {};

  if (after.eventDate && changed(before.eventDate, after.eventDate) && after.eventDate !== booking.date) {
    updates.date = after.eventDate;
  }
  const startTime = after.eventStartTime ?? after.eventTime;
  if (startTime && changed(before.eventStartTime ?? before.eventTime, startTime) && startTime !== (booking.startTime ?? booking.time)) {
    // `time` is the legacy start field older records and versions read; it is kept in step.
    updates.startTime = startTime;
    updates.time = startTime;
  }
  if (after.eventEndTime && changed(before.eventEndTime, after.eventEndTime) && after.eventEndTime !== booking.endTime) {
    updates.endTime = after.eventEndTime;
  }
  const location = (after.eventLocation ?? '').trim();
  if (changed(before.eventLocation, after.eventLocation) && location !== booking.location.trim()) {
    updates.location = location;
  }

  return Object.keys(updates).length ? { ...booking, ...updates } : booking;
}
