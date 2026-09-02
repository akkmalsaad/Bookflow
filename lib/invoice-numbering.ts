import type { Invoice } from '@/context/app-data-context';

export const DEFAULT_INVOICE_NUMBER_FORMAT = 'INV-{YYYY}-{####}';

/** Matches a run of #, e.g. {####}, which becomes the zero-padded sequence. */
const SEQUENCE_TOKEN = /\{(#+)\}/;

/**
 * Turns a format like `INV-{YYYY}-{####}` into `INV-2026-0001`.
 *
 * Supported tokens: {YYYY} 4-digit year, {YY} 2-digit year, {MM} month, and a run of # for the
 * sequence, zero-padded to the number of #s.
 */
export function generateInvoiceNumber(format: string, sequence: number, date: Date): string {
  const year = date.getFullYear();
  const safeSequence = Math.max(1, Math.floor(sequence));

  return format
    .replace(/\{YYYY\}/g, String(year))
    .replace(/\{YY\}/g, String(year).slice(-2))
    .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, '0'))
    .replace(/\{(#+)\}/g, (_match, hashes: string) => String(safeSequence).padStart(hashes.length, '0'));
}

/** Returns an error message for an unusable format, or null when it is valid. */
export function validateInvoiceNumberFormat(format: string): string | null {
  const trimmed = format.trim();

  if (!trimmed) return 'Enter an invoice number format.';
  if (!SEQUENCE_TOKEN.test(trimmed)) return 'Include a sequence token such as {####}.';
  if (trimmed.length > 40) return 'Keep the format under 40 characters.';

  const unknownToken = trimmed.match(/\{(?!YYYY\}|YY\}|MM\}|#+\})[^}]*\}/);
  if (unknownToken) return `${unknownToken[0]} is not a supported token.`;

  return null;
}

/**
 * Picks the next invoice number that is not already taken, advancing the sequence past any
 * collision. The counter only ever moves forward, so deleting an invoice can never cause a reuse.
 */
export function nextAvailableInvoiceNumber(
  format: string,
  startSequence: number,
  date: Date,
  taken: ReadonlySet<string>,
): { invoiceNumber: string; sequence: number } {
  let sequence = Math.max(1, Math.floor(startSequence));

  // Bounded so a format without a sequence token can never spin forever.
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const invoiceNumber = generateInvoiceNumber(format, sequence, date);
    if (!taken.has(invoiceNumber)) {
      return { invoiceNumber, sequence };
    }
    sequence += 1;
  }

  // Every candidate collided: fall back to something unique rather than reusing a number.
  return { invoiceNumber: `${generateInvoiceNumber(format, sequence, date)}-${Date.now()}`, sequence };
}

/** Payment terms are stored as days, where 0 means the invoice is due on receipt. */
export function formatPaymentTerms(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return 'Due on receipt';
  return days === 1 ? 'Due within 1 day' : `Due within ${Math.floor(days)} days`;
}

export const PAYMENT_TERM_PRESETS = [0, 7, 14, 30] as const;
export const MAX_PAYMENT_TERM_DAYS = 365;
export const MAX_PAYMENT_INSTRUCTIONS = 500;

/** The number to show for an invoice, falling back to its internal id for pre-numbering records. */
export function getInvoiceNumber(invoice: Pick<Invoice, 'id' | 'invoiceNumber'>): string {
  return invoice.invoiceNumber?.trim() || invoice.id;
}
