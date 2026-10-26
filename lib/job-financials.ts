import type { Booking, FinanceEntry, Invoice, InvoicePayment } from '@/context/app-data-context';
import { getFinanceEntriesForBounds, isActiveInvoice } from '@/lib/financial-metrics';
import { isInvoiceClosed } from '@/lib/invoice-lifecycle';
import { fromCents, getInvoicePaymentSummary, toCents } from '@/lib/invoice-payments';

export type BookingPaymentState = 'unpaid' | 'deposit_paid' | 'partially_paid' | 'paid';

export type BookingInvoicePayment = {
  invoiceTotal: number;
  amountPaid: number;
  balance: number;
  state: BookingPaymentState;
};

/**
 * The payment picture on a booking card, read from the booking's linked invoices and their payment
 * records only — never from its job status or confirmation. Null when no open invoice is linked, so
 * the card can say so instead of showing a misleading zero.
 *
 * Linked means the invoice's stored bookingId. A booking may have several; their totals and payments
 * are summed, as the booking's outstanding balance already is. Each invoice is read through
 * getInvoicePaymentSummary, the rule the invoice screen uses (a hand-marked Paid counts as settled).
 * Cancelled, declined and void invoices have closed balances and are left out; trashed invoices and
 * their payments are already withheld from the active lists this is given.
 *
 * "Deposit paid" only when everything received so far was recorded as a deposit; any other partial
 * payment reads "Partially paid".
 */
/**
 * Whether any invoice outside the Dustbin is linked to the booking, open or closed. Lets the card
 * tell "No invoice" apart from "No active invoice" (all linked invoices cancelled, declined or void).
 */
export function hasLinkedInvoice(bookingId: string, invoices: Invoice[]) {
  return invoices.some((invoice) => invoice.bookingId === bookingId && !invoice.deletedAt);
}

export function getBookingInvoicePayment(
  bookingId: string,
  invoices: Invoice[],
  payments: InvoicePayment[],
): BookingInvoicePayment | null {
  const linked = invoices.filter((invoice) => invoice.bookingId === bookingId && !invoice.deletedAt && !isInvoiceClosed(invoice));
  if (linked.length === 0) return null;

  let totalCents = 0;
  let paidCents = 0;
  let balanceCents = 0;
  let hasDeposit = false;
  let hasOtherPayment = false;
  for (const invoice of linked) {
    const summary = getInvoicePaymentSummary(invoice, payments);
    totalCents += toCents(summary.totalAmount);
    paidCents += toCents(summary.amountPaid);
    balanceCents += toCents(summary.outstanding);
    for (const payment of summary.payments) {
      if (!(payment.amount > 0)) continue;
      if (payment.kind === 'deposit') hasDeposit = true;
      else hasOtherPayment = true;
    }
  }

  const state: BookingPaymentState = paidCents <= 0
    ? 'unpaid'
    : balanceCents === 0
      ? 'paid'
      : hasDeposit && !hasOtherPayment ? 'deposit_paid' : 'partially_paid';

  return { invoiceTotal: fromCents(totalCents), amountPaid: fromCents(paidCents), balance: fromCents(balanceCents), state };
}

/**
 * The compact money picture for one job.
 *
 * Nothing here is a second ledger. Payments are the invoice payment records the rest of the app
 * already counts, and expenses are the same Finance entries the Finance and Insights screens total —
 * only filtered to the ones the owner linked to this booking. Linking an expense therefore moves no
 * figure anywhere else and cannot deduct the same cost twice.
 *
 * The two margins are labelled for what they are: "booking value minus linked expenses" is a
 * projection, and "collected minus linked expenses" is cash so far. Neither is accounting profit.
 */
export type BookingFinancialSummary = {
  /** Agreed booking value (package plus charges). Zero for a cancelled booking. */
  bookingValue: number;
  collected: number;
  outstanding: number;
  linkedExpenses: number;
  linkedExpenseCount: number;
  projectedMargin: number;
  cashMargin: number;
  isCancelled: boolean;
};

export function getBookingLinkedExpenses(bookingId: string, financeEntries: FinanceEntry[]) {
  // The same source-deduplication the Finance totals use, so a migrated duplicate row cannot
  // count here when it does not count there.
  return getFinanceEntriesForBounds(financeEntries).filter(
    (entry) => entry.type === 'expense' && entry.bookingId === bookingId,
  );
}

/**
 * `invoices`, `payments` and `financeEntries` are the active views from the app data context:
 * trashed invoices, their payments and their ledger rows are already withheld, exactly as they are
 * from every other total.
 */
export function getBookingFinancialSummary(
  booking: Booking,
  invoices: Invoice[],
  payments: InvoicePayment[],
  financeEntries: FinanceEntry[],
): BookingFinancialSummary {
  const linkedInvoices = invoices.filter((invoice) => invoice.bookingId === booking.id && !invoice.deletedAt);
  const isCancelled = booking.status === 'Cancelled';

  // Cash received is cash received, whatever has happened to the invoice since.
  const collectedCents = linkedInvoices.reduce(
    (total, invoice) => total + toCents(getInvoicePaymentSummary(invoice, payments).amountPaid),
    0,
  );

  const billable = linkedInvoices.filter(isActiveInvoice);
  const valueCents = isCancelled ? 0 : toCents(booking.price);
  // Outstanding follows the app's existing rule — open balances on active invoices — and falls back
  // to the booking value for a job not yet invoiced (or only drafted).
  const outstandingCents = isCancelled
    ? 0
    : billable.length > 0
      ? billable.reduce((total, invoice) => total + toCents(getInvoicePaymentSummary(invoice, payments).outstanding), 0)
      : Math.max(0, valueCents - collectedCents);

  const expenses = getBookingLinkedExpenses(booking.id, financeEntries);
  const expenseCents = expenses.reduce((total, entry) => total + toCents(entry.amount), 0);

  return {
    bookingValue: fromCents(valueCents),
    collected: fromCents(collectedCents),
    outstanding: fromCents(outstandingCents),
    linkedExpenses: fromCents(expenseCents),
    linkedExpenseCount: expenses.length,
    projectedMargin: fromCents(valueCents - expenseCents),
    cashMargin: fromCents(collectedCents - expenseCents),
    isCancelled,
  };
}
