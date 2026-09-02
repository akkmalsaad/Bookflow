import {
  getCurrencyFormatter,
  type BusinessProfile,
  type CurrencyCode,
  type Customer,
  type Invoice,
  type InvoicePayment,
  type InvoiceSnapshot,
} from '@/context/app-data-context';
import { getInvoicePaymentSummary, getInvoicePayments, sumPaymentsInCents, fromCents } from '@/lib/invoice-payments';
import { getInvoiceNumber } from '@/lib/invoice-numbering';

import { resolveInvoiceTokens } from './tokens';
import {
  DEFAULT_INVOICE_DESIGN,
  DEFAULT_INVOICE_VISIBILITY,
  EMPTY_BANK_DETAILS,
  INVOICE_TEMPLATE_IDS,
  type InvoiceDesign,
  type InvoiceBankDetails,
  type InvoiceRenderData,
  type InvoiceTemplateId,
  type InvoiceVisibility,
} from './types';

/** `2026-09-04` → `4 September 2026`, matching the format the app already prints on invoices. */
export function formatInvoiceDate(value?: string) {
  if (!value) return '';

  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';

  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(parsed);
}

function timeRange(start?: string, end?: string) {
  const from = (start ?? '').trim();
  const to = (end ?? '').trim();
  if (from && to) return `${from} – ${to}`;
  return from || to || '';
}

// ---------------------------------------------------------------------------------------------
// Reading persisted design settings back, tolerantly
// ---------------------------------------------------------------------------------------------

function isTemplateId(value: unknown): value is InvoiceTemplateId {
  return typeof value === 'string' && INVOICE_TEMPLATE_IDS.includes(value as InvoiceTemplateId);
}

function normalizeVisibility(value: unknown): InvoiceVisibility {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const result = { ...DEFAULT_INVOICE_VISIBILITY };

  (Object.keys(DEFAULT_INVOICE_VISIBILITY) as (keyof InvoiceVisibility)[]).forEach((key) => {
    if (typeof source[key] === 'boolean') result[key] = source[key] as boolean;
  });

  return result;
}

/**
 * Turns whatever is stored into a complete `InvoiceDesign`.
 *
 * A workspace saved before invoice customisation existed has none of these fields, and reads back
 * as the Standard template with BookFlow's own accent — which is exactly how it renders today.
 */
export function normalizeInvoiceDesign(value: unknown): InvoiceDesign {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return {
    templateId: isTemplateId(source.templateId) ? source.templateId : DEFAULT_INVOICE_DESIGN.templateId,
    accentColor:
      typeof source.accentColor === 'string' && source.accentColor.trim()
        ? source.accentColor
        : DEFAULT_INVOICE_DESIGN.accentColor,
    invoicePrefix: typeof source.invoicePrefix === 'string' ? source.invoicePrefix : '',
    thankYouMessage: typeof source.thankYouMessage === 'string' ? source.thankYouMessage : '',
    visibility: normalizeVisibility(source.visibility),
  };
}

export function normalizeBankDetails(value: unknown): InvoiceBankDetails {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const read = (key: keyof InvoiceBankDetails) =>
    typeof source[key] === 'string' ? (source[key] as string) : '';

  return {
    bankName: read('bankName'),
    accountHolder: read('accountHolder'),
    accountNumber: read('accountNumber'),
    duitNowId: read('duitNowId'),
  };
}

// ---------------------------------------------------------------------------------------------
// Building the render model
// ---------------------------------------------------------------------------------------------

/**
 * The status a customer should see, derived from BookFlow's own payment summary rather than from a
 * second status field. A lifecycle state (Draft, Cancelled, Void, Declined, Accepted) always wins;
 * otherwise the money decides between Unpaid, Partially Paid and Paid.
 */
function describePaymentStatus(invoice: Invoice, payments: InvoicePayment[]) {
  if (
    invoice.status === 'Draft' ||
    invoice.status === 'Cancelled' ||
    invoice.status === 'Void' ||
    invoice.status === 'Declined' ||
    invoice.status === 'Accepted'
  ) {
    return invoice.status;
  }

  const summary = getInvoicePaymentSummary(invoice, payments);
  if (summary.status === 'Paid') return 'Paid';

  const isOverdue =
    invoice.status === 'Overdue' ||
    (Boolean(invoice.dueDate) && invoice.dueDate < new Date().toISOString().slice(0, 10));

  if (summary.status === 'Partially Paid') return isOverdue ? 'Partially Paid · Overdue' : 'Partially Paid';
  return isOverdue ? 'Overdue' : invoice.status;
}

export type BuildInvoiceRenderDataInput = {
  invoice: Invoice;
  customer?: Customer | null;
  payments: InvoicePayment[];
  currency: CurrencyCode;
  /** Live settings, used for drafts. An issued invoice passes its snapshot instead. */
  design: InvoiceDesign;
  business: {
    name: string;
    registrationNumber: string;
    phone: string;
    email: string;
    website: string;
    address: string;
    logoUrl: string | null;
  };
  paymentDetails: InvoiceBankDetails;
  paymentInstructions: string;
  /** Workspace default, printed when the invoice has no terms of its own. */
  termsAndConditions?: string;
  serviceName?: string;
  packageDetails?: string;
  eventLocation?: string;
  eventDate?: string;
  eventStartTime?: string;
  eventEndTime?: string;
};

/**
 * Assembles everything the six templates render.
 *
 * Every figure comes from `getInvoicePaymentSummary` — the same function the invoice screen, the
 * finance totals and the payment modals read — and is formatted once here with the workspace's own
 * currency formatter. No template ever adds, subtracts or formats a number, so the app view, the
 * customer's page and the PDF cannot disagree about what is owed.
 */
export function buildInvoiceRenderData(input: BuildInvoiceRenderDataInput): InvoiceRenderData {
  const { invoice, customer, payments, currency, design, business, paymentDetails } = input;
  const formatter = getCurrencyFormatter(currency);
  const summary = getInvoicePaymentSummary(invoice, payments);
  const depositCents = sumPaymentsInCents(
    getInvoicePayments(invoice.id, payments).filter((payment) => payment.kind === 'deposit'),
  );
  const depositPaid = fromCents(depositCents);

  return {
    design,
    tokens: resolveInvoiceTokens(design.accentColor, design.templateId),
    business,
    client: {
      name: customer?.name ?? '',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
      address: customer?.location ?? '',
    },
    invoice: {
      number: getInvoiceNumber(invoice),
      status: invoice.status,
      paymentStatus: describePaymentStatus(invoice, payments),
      issuedOn: formatInvoiceDate(invoice.sentAt),
      dueOn: formatInvoiceDate(invoice.dueDate),
      eventDate: formatInvoiceDate(input.eventDate ?? invoice.eventDate),
      eventTime: timeRange(
        input.eventStartTime ?? invoice.eventStartTime ?? invoice.eventTime,
        input.eventEndTime ?? invoice.eventEndTime,
      ),
      eventLocation: (input.eventLocation ?? invoice.eventLocation ?? '').trim(),
    },
    items: [
      {
        description: (input.serviceName ?? invoice.serviceName ?? '').trim() || 'Professional services',
        detail: (input.packageDetails ?? invoice.packageDetails ?? '').trim() || undefined,
        amountLabel: formatter.format(summary.totalAmount),
      },
    ],
    totals: {
      subtotal: formatter.format(summary.totalAmount),
      total: formatter.format(summary.totalAmount),
      depositPaid: formatter.format(depositPaid),
      amountPaid: formatter.format(summary.amountPaid),
      balance: formatter.format(summary.outstanding),
      hasDeposit: depositCents > 0,
      isSettled: summary.outstanding <= 0,
    },
    payment: paymentDetails ?? { ...EMPTY_BANK_DETAILS },
    paymentInstructions: input.paymentInstructions ?? '',
    terms: (invoice.terms ?? '').trim() || (input.termsAndConditions ?? ''),
    thankYouMessage: design.thankYouMessage,
    currency,
  };
}

/**
 * An issued invoice renders from the snapshot taken when it was sent; a draft renders from the
 * workspace's current settings. A snapshot saved before invoice customisation existed has no design
 * of its own, so it falls back to Standard — which is precisely how those invoices already look.
 */
export function resolveInvoicePresentation(
  invoice: Invoice,
  live: {
    design: InvoiceDesign;
    business: BusinessProfile;
    paymentDetails: InvoiceBankDetails;
    paymentInstructions: string;
    termsAndConditions: string;
    allowBusinessLogo: boolean;
  },
) {
  const snapshot = invoice.snapshot as (InvoiceSnapshot & Record<string, unknown>) | undefined;
  const isDraft = invoice.status === 'Draft';
  const hasSnapshot = Boolean(snapshot) && !isDraft;

  if (!hasSnapshot || !snapshot) {
    return {
      design: live.design,
      business: {
        name: live.business.name,
        registrationNumber: live.business.ssmRegistrationNo,
        phone: live.business.phone,
        email: live.business.email,
        website: live.business.website ?? '',
        address: live.business.address,
        logoUrl: live.allowBusinessLogo ? live.business.logoUrl ?? null : null,
      },
      paymentDetails: live.paymentDetails,
      paymentInstructions: live.paymentInstructions,
      termsAndConditions: live.termsAndConditions,
    };
  }

  const snapshotHasLogoField = Object.prototype.hasOwnProperty.call(snapshot, 'businessLogoUrl');

  return {
    // A legacy snapshot carries no `design`, and normalising `undefined` yields Standard.
    design: normalizeInvoiceDesign(snapshot.design),
    business: {
      name: snapshot.businessName ?? live.business.name,
      registrationNumber: snapshot.businessRegistrationNumber ?? live.business.ssmRegistrationNo,
      phone: snapshot.businessPhone ?? live.business.phone,
      email: snapshot.businessEmail ?? live.business.email,
      website: typeof snapshot.businessWebsite === 'string' ? snapshot.businessWebsite : '',
      address: snapshot.businessAddress ?? live.business.address,
      logoUrl: snapshotHasLogoField ? snapshot.businessLogoUrl ?? null : live.business.logoUrl ?? null,
    },
    paymentDetails: normalizeBankDetails(snapshot.paymentDetails),
    paymentInstructions:
      typeof snapshot.paymentInstructions === 'string' ? snapshot.paymentInstructions : live.paymentInstructions,
    termsAndConditions:
      typeof snapshot.termsAndConditions === 'string' ? snapshot.termsAndConditions : live.termsAndConditions,
  };
}
