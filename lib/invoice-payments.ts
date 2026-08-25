import type { Invoice, InvoicePayment } from '@/context/app-data-context';

export type PaymentStatus = 'Unpaid' | 'Partially Paid' | 'Paid';

export type InvoicePaymentSummary = {
  totalAmount: number;
  amountPaid: number;
  outstanding: number;
  status: PaymentStatus;
  payments: InvoicePayment[];
};

/** Money is compared and summed in sen so repeated payments never drift (RM849.999999). */
export function toCents(amount: number) {
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100);
}

export function fromCents(cents: number) {
  return cents / 100;
}

export function getInvoicePayments(invoiceId: string, payments: InvoicePayment[]) {
  return payments
    .filter((payment) => payment.invoiceId === invoiceId)
    .sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));
}

export function sumPaymentsInCents(payments: InvoicePayment[]) {
  return payments.reduce((total, payment) => total + toCents(payment.amount), 0);
}

/** Everything the UI needs about one invoice's money, derived from its payment records. */
export function getInvoicePaymentSummary(invoice: Invoice, payments: InvoicePayment[]): InvoicePaymentSummary {
  const invoicePayments = getInvoicePayments(invoice.id, payments);
  const totalCents = toCents(invoice.amount);
  // An invoice settled by hand ("Payment done") counts as fully received even without records.
  const recordedCents = sumPaymentsInCents(invoicePayments);
  const paidCents = invoice.status === 'Paid' ? totalCents : Math.min(recordedCents, totalCents);
  const outstandingCents = Math.max(0, totalCents - paidCents);

  return {
    totalAmount: invoice.amount,
    amountPaid: fromCents(paidCents),
    outstanding: fromCents(outstandingCents),
    status: paidCents <= 0 ? 'Unpaid' : outstandingCents === 0 ? 'Paid' : 'Partially Paid',
    payments: invoicePayments,
  };
}

/**
 * Invoice status after a payment change. Lifecycle states the customer owns (Cancelled, Declined)
 * are never overwritten, and an invoice only becomes Paid when nothing is outstanding.
 */
export function resolveInvoiceStatus(invoice: Invoice, paidCents: number): Invoice['status'] {
  if (invoice.status === 'Cancelled' || invoice.status === 'Declined') {
    return invoice.status;
  }

  const totalCents = toCents(invoice.amount);

  if (paidCents >= totalCents && totalCents > 0) return 'Paid';
  if (paidCents > 0) return 'Partially Paid';
  if (invoice.status === 'Paid' || invoice.status === 'Partially Paid') return 'Sent';

  return invoice.status;
}

/** Parses what a user typed into a money field. Returns null when it is not a usable amount. */
export function parseAmountInput(value: string) {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return fromCents(toCents(parsed));
}
