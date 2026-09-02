import type { Invoice, InvoicePayment } from '@/context/app-data-context';
import { getInvoicePaymentSummary } from '@/lib/invoice-payments';

/**
 * How an invoice leaves the active list. All three move it to Dustbin — they differ in how much
 * history is at stake, and therefore in how strongly the app words the confirmation.
 */
export type InvoiceRemovalMode = 'delete' | 'cancel' | 'void';

export type InvoiceRemovalAction = {
  mode: InvoiceRemovalMode;
  /** Label for the destructive row in the ••• menu. */
  menuLabel: string;
  sheetTitle: string;
  description: string;
  confirmLabel: string;
  /** Only a plain delete offers the lightweight reason picker; a void asks for a reason instead. */
  reasonLabel: string;
};

/** Statuses that mean the invoice is closed: no payments, no sending, no customer response. */
export function isInvoiceClosed(invoice: Invoice) {
  return invoice.status === 'Cancelled' || invoice.status === 'Declined' || invoice.status === 'Void';
}

export function isInvoiceTrashed(invoice: Invoice) {
  return Boolean(invoice.deletedAt);
}

export function isInvoiceVoided(invoice: Invoice) {
  return Boolean(invoice.voidedAt) || invoice.status === 'Void';
}

/** True once an invoice carries history a delete must not quietly destroy. */
export function hasInvoiceFinancialHistory(invoice: Invoice, payments: InvoicePayment[]) {
  if (invoice.status === 'Paid' || invoice.status === 'Partially Paid') return true;
  return getInvoicePaymentSummary(invoice, payments).amountPaid > 0;
}

const REMOVAL_ACTIONS: Record<InvoiceRemovalMode, Omit<InvoiceRemovalAction, 'mode'>> = {
  delete: {
    menuLabel: 'Delete invoice',
    sheetTitle: 'Move invoice to the Dustbin?',
    description:
      'This invoice will be removed from your active invoices.\nYou can restore it later from the Dustbin.',
    confirmLabel: 'Move to Dustbin',
    reasonLabel: 'Reason',
  },
  cancel: {
    menuLabel: 'Cancel invoice',
    sheetTitle: 'Cancel this invoice?',
    description:
      'The invoice will be marked as cancelled and moved to the Dustbin, so your customer can no longer respond to it.\n\nNothing about the invoice is erased — you can restore it from the Dustbin.',
    confirmLabel: 'Cancel invoice',
    reasonLabel: 'Reason',
  },
  void: {
    menuLabel: 'Void invoice',
    sheetTitle: 'Void invoice?',
    description:
      'This invoice will be marked as void and moved out of your active invoices.\n\nIts payment history is kept on the invoice, but stops counting towards your finance totals. Restoring it from the Dustbin makes it a working invoice again.',
    confirmLabel: 'Void invoice',
    reasonLabel: 'Reason',
  },
};

/**
 * The one place that decides what removing an invoice means, so the ••• menu, the confirmation
 * sheet and the context all agree.
 *
 * A never-sent draft is a plain delete. A sent invoice is cancelled, because the customer has seen
 * it. Anything the customer accepted, or that has money against it, is voided so its history stays
 * intact.
 */
export function getInvoiceRemovalAction(invoice: Invoice, payments: InvoicePayment[]): InvoiceRemovalAction {
  // An invoice that is already closed — declined, cancelled, or voided and restored — has nothing
  // left to cancel or void, so removing it is a plain move to Dustbin that leaves its status alone.
  const mode: InvoiceRemovalMode = isInvoiceClosed(invoice)
    ? 'delete'
    : hasInvoiceFinancialHistory(invoice, payments) || invoice.status === 'Accepted'
      ? 'void'
      : invoice.status === 'Draft'
        ? 'delete'
        : 'cancel';

  return { mode, ...REMOVAL_ACTIONS[mode] };
}

/**
 * Optional, and deliberately short — the sheet must never feel like a form. These are stored on the
 * invoice verbatim and shown on its Dustbin card, so what you tap is exactly what gets recorded.
 */
export const INVOICE_DELETION_REASONS = ['Cancel', 'Duplicate', 'Mistake', 'Other'] as const;

export type InvoiceDeletionReason = (typeof INVOICE_DELETION_REASONS)[number];

/** How long a soft-deleted invoice is kept before the app removes it for good. */
export const DUSTBIN_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days left before an invoice is permanently deleted. 0 means its window has run out and the
 * next sweep will purge it. Null when the invoice is not in the dustbin, or carries no usable
 * timestamp — an unreadable date must never be treated as expired.
 */
export function getDaysUntilPermanentDelete(deletedAt: string | null | undefined, now = new Date()) {
  if (!deletedAt) return null;

  const deleted = new Date(deletedAt);
  if (Number.isNaN(deleted.getTime())) return null;

  const elapsedDays = (now.getTime() - deleted.getTime()) / DAY_MS;
  return Math.max(0, Math.ceil(DUSTBIN_RETENTION_DAYS - elapsedDays));
}

/**
 * Invoices whose retention window has run out. Anything without a readable deletedAt is left alone,
 * so a malformed timestamp can never cause an invoice to be destroyed.
 */
export function getExpiredDustbinInvoiceIds(invoices: Invoice[], now = new Date()) {
  return invoices
    .filter((invoice) => {
      if (!invoice.deletedAt) return false;
      const deleted = new Date(invoice.deletedAt);
      if (Number.isNaN(deleted.getTime())) return false;
      return now.getTime() - deleted.getTime() >= DUSTBIN_RETENTION_DAYS * DAY_MS;
    })
    .map((invoice) => invoice.id);
}

