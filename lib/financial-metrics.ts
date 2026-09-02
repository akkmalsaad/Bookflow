import type { FinanceEntry, Invoice, InvoicePayment } from '@/context/app-data-context';
import { fromCents, getInvoicePaymentSummary, toCents } from '@/lib/invoice-payments';

export type FinancialDateBounds = {
  start: string;
  end: string;
};

export type FinancialPeriod =
  | 'this-week'
  | 'this-month'
  | 'last-month'
  | 'last-3-months'
  | 'last-6-months'
  | 'year-to-date'
  | 'custom';

export type FinancialMetrics = {
  revenue: number;
  expenses: number;
  netProfit: number;
  outstanding: number;
  paidInvoiceCount: number;
  outstandingInvoiceCount: number;
  /** Canonical, source-deduplicated ledger rows for the selected period. */
  transactions: FinanceEntry[];
  /** Income subset of transactions; these rows reconcile exactly to revenue. */
  receivedPayments: FinanceEntry[];
};

type FinancialMetricsInput = {
  financeEntries: FinanceEntry[];
  invoices: Invoice[];
  payments: InvoicePayment[];
  /** Omit bounds for all-time cash totals and all active invoices. */
  bounds?: FinancialDateBounds;
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getFinancialPeriodBounds(
  period: FinancialPeriod,
  now = new Date(),
  custom?: FinancialDateBounds,
): FinancialDateBounds {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);

  if (period === 'custom' && custom) return custom;
  if (period === 'this-week') {
    const start = new Date(today);
    const mondayOffset = (today.getDay() + 6) % 7;
    start.setDate(today.getDate() - mondayOffset);
    return { start: dateKey(start), end: dateKey(today) };
  }
  if (period === 'last-month') {
    return {
      start: dateKey(new Date(today.getFullYear(), today.getMonth() - 1, 1, 12)),
      end: dateKey(new Date(today.getFullYear(), today.getMonth(), 0, 12)),
    };
  }
  if (period === 'last-3-months') {
    return {
      start: dateKey(new Date(today.getFullYear(), today.getMonth() - 2, 1, 12)),
      end: dateKey(today),
    };
  }
  if (period === 'last-6-months') {
    return {
      start: dateKey(new Date(today.getFullYear(), today.getMonth() - 5, 1, 12)),
      end: dateKey(today),
    };
  }
  if (period === 'year-to-date') {
    return { start: dateKey(new Date(today.getFullYear(), 0, 1, 12)), end: dateKey(today) };
  }

  return {
    start: dateKey(new Date(today.getFullYear(), today.getMonth(), 1, 12)),
    end: dateKey(today),
  };
}

export function isWithinFinancialBounds(value: string | undefined, bounds: FinancialDateBounds) {
  if (!value) return false;
  const key = value.slice(0, 10);
  return key >= bounds.start && key <= bounds.end;
}

export function getFinanceEntriesForBounds(entries: FinanceEntry[], bounds?: FinancialDateBounds) {
  const scopedEntries = bounds
    ? entries.filter((entry) => isWithinFinancialBounds(entry.date, bounds))
    : entries;
  const seenSources = new Set<string>();

  return scopedEntries.filter((entry) => {
    const sourceKey = entry.sourceId
      ? `source:${entry.sourceId}`
      : `legacy-entry:${entry.id}`;
    if (seenSources.has(sourceKey)) return false;
    seenSources.add(sourceKey);
    return true;
  });
}

/**
 * Whether an invoice still represents money the business expects. Invoices in the dustbin never reach
 * here — the app data context filters them out — but a *restored* void invoice does, and it must
 * stay out of outstanding, expected revenue and invoice counts just like a cancelled one.
 */
export function isActiveInvoice(invoice: Invoice) {
  return (
    !invoice.deletedAt &&
    invoice.status !== 'Cancelled' &&
    invoice.status !== 'Declined' &&
    invoice.status !== 'Void' &&
    invoice.status !== 'Draft'
  );
}

export function getInvoiceFinancialDate(invoice: Invoice) {
  return invoice.sentAt || invoice.eventDate || invoice.dueDate;
}

export function getOutstandingInvoiceBalances(
  invoices: Invoice[],
  payments: InvoicePayment[],
  bounds?: FinancialDateBounds,
) {
  return invoices
    .filter(
      (invoice) =>
        isActiveInvoice(invoice) &&
        (!bounds || isWithinFinancialBounds(getInvoiceFinancialDate(invoice), bounds)),
    )
    .map((invoice) => {
      const summary = getInvoicePaymentSummary(invoice, payments);
      return { invoice, amountPaid: summary.amountPaid, balance: summary.outstanding };
    });
}

/**
 * Canonical BookFlow totals. Revenue and expenses come only from the cash ledger; invoice totals
 * are consulted only for paid/outstanding status, so an invoice and its payments cannot both count.
 */
export function getFinancialMetrics({
  financeEntries,
  invoices,
  payments,
  bounds,
}: FinancialMetricsInput): FinancialMetrics {
  const entries = getFinanceEntriesForBounds(financeEntries, bounds);
  const receivedPayments = entries.filter((entry) => entry.type === 'income');
  const revenueCents = entries.reduce(
    (total, entry) => total + (entry.type === 'income' ? toCents(entry.amount) : 0),
    0,
  );
  const expenseCents = entries.reduce(
    (total, entry) => total + (entry.type === 'expense' ? toCents(entry.amount) : 0),
    0,
  );
  const invoiceBalances = getOutstandingInvoiceBalances(invoices, payments, bounds);
  const outstandingCents = invoiceBalances.reduce(
    (total, item) => total + (item.balance > 0 ? toCents(item.balance) : 0),
    0,
  );

  return {
    revenue: fromCents(revenueCents),
    expenses: fromCents(expenseCents),
    netProfit: fromCents(revenueCents - expenseCents),
    outstanding: fromCents(outstandingCents),
    paidInvoiceCount: invoiceBalances.filter((item) => item.amountPaid > 0 && item.balance === 0).length,
    outstandingInvoiceCount: invoiceBalances.filter((item) => item.balance > 0).length,
    transactions: entries,
    receivedPayments,
  };
}
