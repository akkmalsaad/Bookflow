import type { CurrencyCode } from '@/context/app-data-context';

/**
 * The six invoice designs. `standard` is the Free template and is always selectable; the other five
 * are the Pro set. Ids are persisted, so they are never renamed.
 */
export type InvoiceTemplateId = 'standard' | 'modern' | 'minimal' | 'bold' | 'elegant' | 'compact';

export const INVOICE_TEMPLATE_IDS: InvoiceTemplateId[] = [
  'standard',
  'modern',
  'minimal',
  'bold',
  'elegant',
  'compact',
];

/** Sections a Pro user may hide. Nothing here affects a total or a calculation. */
export type InvoiceVisibility = {
  businessAddress: boolean;
  clientAddress: boolean;
  dueDate: boolean;
  paymentStatus: boolean;
  paymentInformation: boolean;
  paymentInstructions: boolean;
  terms: boolean;
  thankYou: boolean;
  bookflowBranding: boolean;
};

export const DEFAULT_INVOICE_VISIBILITY: InvoiceVisibility = {
  businessAddress: true,
  clientAddress: true,
  dueDate: true,
  paymentStatus: true,
  paymentInformation: true,
  paymentInstructions: true,
  terms: true,
  thankYou: true,
  bookflowBranding: true,
};

/** BookFlow indigo. The default accent for every workspace, Free or Pro. */
export const DEFAULT_ACCENT_COLOR = '#4F46E5';

/**
 * The appearance half of a user's invoice settings.
 *
 * Stored inside the existing `invoiceSettings` object in the workspace JSONB document — no new
 * table, no migration. Every field has a default, so a workspace saved before this feature existed
 * reads back as the Standard template with BookFlow's own accent.
 */
export type InvoiceDesign = {
  templateId: InvoiceTemplateId;
  accentColor: string;
  /** Prepended to newly generated invoice numbers. Never applied retroactively. */
  invoicePrefix: string;
  thankYouMessage: string;
  visibility: InvoiceVisibility;
};

export const DEFAULT_INVOICE_DESIGN: InvoiceDesign = {
  templateId: 'standard',
  accentColor: DEFAULT_ACCENT_COLOR,
  invoicePrefix: '',
  thankYouMessage: '',
  visibility: { ...DEFAULT_INVOICE_VISIBILITY },
};

/** Bank and DuitNow details. Free for everyone — getting paid is not a paid feature. */
export type InvoiceBankDetails = {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  duitNowId: string;
};

export const EMPTY_BANK_DETAILS: InvoiceBankDetails = {
  bankName: '',
  accountHolder: '',
  accountNumber: '',
  duitNowId: '',
};

/**
 * Colours every template draws from. Derived once from the accent so no component hard-codes a
 * colour of its own, and so a light accent can never leave white text unreadable on top of it.
 */
export type InvoiceDesignTokens = {
  accent: string;
  /** Readable foreground for text sitting on `accent`. */
  accentText: string;
  /** Very light wash of the accent, for panels and table headers. */
  accentSoft: string;
  text: string;
  muted: string;
  border: string;
  background: string;
  surface: string;
};

/**
 * One priced line on the invoice. BookFlow issues single-service invoices today.
 *
 * `amountLabel` is already formatted by the workspace's own currency formatter — templates never
 * format money themselves, which is what keeps every rendering of an invoice showing the same
 * figures in the same notation.
 */
export type InvoiceLineItem = {
  description: string;
  detail?: string;
  amountLabel: string;
};

/**
 * Everything a template needs, already calculated and already formatted.
 *
 * Templates receive this and lay it out. They never compute a total, never re-derive a status and
 * never format a currency or a date themselves — that is what keeps the app view, the customer's
 * public page and the PDF showing the same numbers.
 */
export type InvoiceRenderData = {
  design: InvoiceDesign;
  tokens: InvoiceDesignTokens;
  business: {
    name: string;
    registrationNumber: string;
    phone: string;
    email: string;
    website: string;
    address: string;
    logoUrl: string | null;
  };
  client: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  invoice: {
    number: string;
    status: string;
    /** Display-ready status for the badge, e.g. "Partially Paid". */
    paymentStatus: string;
    issuedOn: string;
    dueOn: string;
    eventDate: string;
    eventTime: string;
    eventLocation: string;
  };
  items: InvoiceLineItem[];
  /** Formatted strings only — the raw figures were resolved by BookFlow's own calculators. */
  totals: {
    subtotal: string;
    depositPaid: string;
    amountPaid: string;
    balance: string;
    total: string;
    hasDeposit: boolean;
    isSettled: boolean;
  };
  payment: InvoiceBankDetails;
  paymentInstructions: string;
  terms: string;
  thankYouMessage: string;
  currency: CurrencyCode;
};
