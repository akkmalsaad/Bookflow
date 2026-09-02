import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useAuth, type AuthUser } from '@/context/auth-context';
import { useSubscription } from '@/context/subscription-context';
import {
  createClerkSupabaseClient,
  getSupabaseFunctionUrl,
  isSupabaseConfigured,
  type Json,
} from '@/lib/supabase';
import { findBookingTimeConflict, normalizeBookingTime } from '@/lib/booking-conflicts';
import { fromCents, resolveInvoiceStatus, sumPaymentsInCents, toCents } from '@/lib/invoice-payments';
import { DEFAULT_INVOICE_NUMBER_FORMAT, getInvoiceNumber, nextAvailableInvoiceNumber } from '@/lib/invoice-numbering';
import { getExpiredDustbinInvoiceIds } from '@/lib/invoice-lifecycle';
import {
  buildInvoiceRenderData,
  DEFAULT_INVOICE_DESIGN,
  normalizeBankDetails,
  normalizeInvoiceDesign,
  resolveInvoicePresentation,
  resolveTemplateForEntitlement,
  type InvoiceBankDetails,
  type InvoiceDesign,
} from '@/lib/invoice-design';
import {
  mergeWorkspaceBackup,
  type BookflowBackup,
  type WorkspaceMergeResult,
  type WorkspaceSnapshot,
} from '@/lib/workspace-backup';

export type PackageOption = {
  id: string;
  name: string;
  details: string;
  duration: string;
  price: number;
  info: string;
};

export type BusinessProfile = {
  name: string;
  ssmRegistrationNo: string;
  nature: string;
  phone: string;
  email: string;
  address: string;
  /** Website or social handle shown on invoices. Free for everyone. */
  website?: string;
  /** Bank and DuitNow details printed in the invoice payment panel. Free for everyone. */
  paymentDetails?: InvoiceBankDetails;
  /** Public CDN URL. Rendering is still gated by the current Pro entitlement. */
  logoUrl?: string;
  /** Supabase Storage object path, used for replacement and account cleanup. */
  logoPath?: string;
};

export type BusinessLogoUpload = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  base64?: string | null;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  notes: string;
};

export type Booking = {
  id: string;
  customerId: string;
  title: string;
  date: string;
  time?: string;
  startTime?: string;
  endTime?: string;
  location: string;
  packageName: string;
  price: number;
  /**
   * The job's own lifecycle, deliberately separate from Invoice['status'] (invoice state) and from
   * the InvoicePayment records (payment state). Nothing about billing belongs in here.
   */
  status: 'Inquiry' | 'Confirmed' | 'In Progress' | 'Completed' | 'Cancelled';
  notes: string;
};

export type Invoice = {
  id: string;
  bookingId: string;
  customerId: string;
  amount: number;
  depositPaid?: number;
  dueDate: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Paid' | 'Partially Paid' | 'Overdue' | 'Cancelled' | 'Void';
  /** Cached total of this invoice's payment records. Never written on its own. */
  sentAt: string;
  serviceName?: string;
  packageDetails?: string;
  eventLocation?: string;
  eventDate?: string;
  eventTime?: string;
  eventStartTime?: string;
  eventEndTime?: string;
  terms?: string;
  /** Human-facing number from the configured format. Absent on invoices created before numbering. */
  invoiceNumber?: string;
  snapshot?: InvoiceSnapshot;
  /**
   * Soft delete. An invoice is in Dustbin when this is set; the record itself is never rewritten, so
   * restoring it returns the original invoice — same id, same number, same payments.
   */
  deletedAt?: string | null;
  deletionReason?: string | null;
  /** Set only when the invoice was voided rather than plainly deleted. Survives a restore. */
  voidedAt?: string | null;
  voidReason?: string | null;
  /**
   * The status the invoice held before it was cancelled into Dustbin, so a restore returns the exact
   * record rather than leaving behind a permanently unsendable invoice. A deliberate void ignores
   * this and stays Void.
   */
  statusBeforeTrash?: Invoice['status'] | null;
};

/** Invoice-specific defaults, applied to new invoices and snapshotted onto each one. */
export type InvoiceSettings = {
  numberFormat: string;
  /** 0 means due on receipt. */
  paymentTermDays: number;
  paymentInstructions: string;
  /** Default terms printed when an invoice carries none of its own. Free for everyone. */
  termsAndConditions: string;
  /** Next sequential number to use. Only ever moves forward. */
  nextInvoiceSequence: number;
  /**
   * Template, accent, prefix, footer message and section visibility. Lives here rather than in a
   * new table because the whole workspace is already one JSONB document — see lib/invoice-design.
   */
  design: InvoiceDesign;
};

/**
 * The settings as they stood when an invoice was created. Frozen per invoice so that later changes
 * to the business profile or invoice defaults never rewrite history.
 */
export type InvoiceSnapshot = {
  businessName: string;
  businessRegistrationNumber: string;
  businessPhone: string;
  businessEmail: string;
  businessAddress: string;
  /** null explicitly freezes an invoice without a logo; undefined identifies a legacy snapshot. */
  businessLogoUrl?: string | null;
  businessWebsite?: string;
  paymentTermDays: number;
  paymentInstructions: string;
  /** Bank details as they stood when the invoice went out. */
  paymentDetails?: InvoiceBankDetails;
  /** Default terms in force at issue, used when the invoice carries none of its own. */
  termsAndConditions?: string;
  /** Template, accent and visibility frozen at issue. Absent on invoices sent before this existed. */
  design?: InvoiceDesign;
};

export type InvoicePayment = {
  id: string;
  invoiceId: string;
  amount: number;
  method: string;
  date: string;
  notes?: string;
  kind: 'deposit' | 'payment';
  recordedAt: string;
};

export type RecordInvoicePaymentInput = {
  invoiceId: string;
  amount: number;
  method: string;
  date: string;
  notes?: string;
  kind?: InvoicePayment['kind'];
  /** Stable ID for one UI action, used to make retries idempotent. */
  sourceId?: string;
};

export type RecordInvoicePaymentResult = {
  ok: boolean;
  error?: string;
};

/** How an invoice leaves the active list. See lib/invoice-lifecycle for which one applies when. */
export type InvoiceRemovalMode = 'delete' | 'cancel' | 'void';

export type TrashInvoiceInput = {
  invoiceId: string;
  mode: InvoiceRemovalMode;
  /** Always optional — nothing is ever blocked on the user picking one. */
  reason?: string;
};

export type InvoiceMutationResult = {
  ok: boolean;
  error?: string;
};

export type FinanceEntry = {
  id: string;
  category: string;
  amount: number;
  date: string;
  description: string;
  type: 'expense' | 'income';
  sourceType?: 'manual_income' | 'manual_expense' | 'booking_payment' | 'invoice_deposit' | 'invoice_payment';
  /** ID of the payment/action that produced this ledger row. */
  sourceId?: string;
  bookingId?: string;
  invoiceId?: string;
  customerId?: string;
};

export type Reminder = {
  id: string;
  title: string;
  dueDate: string;
  channel: 'email' | 'whatsapp' | 'sms';
  status: 'scheduled' | 'sent' | 'failed';
};

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isOpened: boolean;
  type: 'booking' | 'invoice' | 'reminder';
};

export type InvoicePaymentDetails = {
  method?: string;
  date?: string;
  notes?: string;
};

export type InvoiceDraftPrefill = {
  customerId: string;
  amount: number;
  dueDate: string;
  bookingId?: string;
  serviceName?: string;
  terms?: string;
};

export type CreateBookingInput = Omit<Booking, 'id' | 'customerId'> & {
  customerId?: string;
  newCustomer?: Omit<Customer, 'id'>;
};

export type BookingMutationResult = {
  ok: boolean;
  error?: string;
};

export type CreateBookingResult = {
  booking: Booking;
  customer: Customer;
  invoice: Invoice;
};

export type CurrencyCode = 'MYR' | 'IDR' | 'USD';

export const CURRENCY_OPTIONS: { code: CurrencyCode; label: string; locale: string }[] = [
  { code: 'MYR', label: 'Malaysian Ringgit', locale: 'ms-MY' },
  { code: 'IDR', label: 'Indonesian Rupiah', locale: 'id-ID' },
  { code: 'USD', label: 'US Dollar', locale: 'en-US' },
];

export function getCurrencyFormatter(code: CurrencyCode) {
  const locale = CURRENCY_OPTIONS.find((option) => option.code === code)?.locale ?? 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: code });
}

/** Same currency, without the cents — for dense summary rows. */
export function getCompactCurrencyFormatter(code: CurrencyCode) {
  const locale = CURRENCY_OPTIONS.find((option) => option.code === code)?.locale ?? 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
  });
}

type AppDataContextValue = {
  isLoading: boolean;
  loadError: string | null;
  syncError: string | null;
  reload: () => void;
  retrySync: () => void;
  packages: PackageOption[];
  customers: Customer[];
  bookings: Booking[];
  /** Active invoices only. Everything in Dustbin is filtered out here, once, for the whole app. */
  invoices: Invoice[];
  /** Soft-deleted invoices, most recently deleted first. Only the Dustbin screen reads this. */
  trashedInvoices: Invoice[];
  /** Payments for active invoices only. A trashed invoice's money leaves every total with it. */
  payments: InvoicePayment[];
  /** Every payment record, Dustbin included, for screens that must see what is being held back. */
  allPayments: InvoicePayment[];
  /** Cash ledger for active invoices only, plus all manual income and expenses. */
  financeEntries: FinanceEntry[];
  reminders: Reminder[];
  notifications: AppNotification[];
  invoiceDraft: InvoiceDraftPrefill | null;
  businessProfile: BusinessProfile;
  updateBusinessProfile: (profile: BusinessProfile) => void;
  uploadBusinessLogo: (image: BusinessLogoUpload) => Promise<{ logoPath: string; logoUrl: string }>;
  removeBusinessLogo: () => Promise<void>;
  currency: CurrencyCode;
  updateCurrency: (code: CurrencyCode) => void;
  invoiceSettings: InvoiceSettings;
  updateInvoiceSettings: (updates: Partial<InvoiceSettings>) => void;
  addPackage: (service: Omit<PackageOption, 'id'>) => void;
  updatePackage: (id: string, updates: Partial<PackageOption>) => void;
  removePackage: (id: string) => void;
  addCustomer: (customer: Omit<Customer, 'id'>) => Customer | null;
  updateCustomer: (id: string, updates: Partial<Omit<Customer, 'id'>>) => boolean;
  deleteCustomer: (id: string) => void;
  createBooking: (booking: CreateBookingInput) => CreateBookingResult | null;
  /** Updates only the job status. Every other field on the booking is left untouched. */
  updateBookingStatus: (bookingId: string, status: Booking['status']) => BookingMutationResult;
  addInvoice: (invoice: Omit<Invoice, 'id'>) => void;
  createInvoiceShareLink: (invoiceId: string) => Promise<string>;
  refreshInvoiceStatuses: () => Promise<void>;
  setInvoiceDraft: (draft: InvoiceDraftPrefill | null) => void;
  updateInvoiceStatus: (invoiceId: string, status: Invoice['status']) => void;
  updateInvoiceDeposit: (invoiceId: string, depositPaid: number, details?: InvoicePaymentDetails) => boolean;
  recordInvoicePayment: (input: RecordInvoicePaymentInput) => RecordInvoicePaymentResult;
  /** Soft-deletes an invoice: it leaves the active list, keeping every field it already had. */
  trashInvoice: (input: TrashInvoiceInput) => Promise<InvoiceMutationResult>;
  /** Clears deletedAt on the original record. Never creates, duplicates or renumbers anything. */
  restoreInvoice: (invoiceId: string) => Promise<InvoiceMutationResult>;
  /** Destroys the invoice record and revokes its public link. Payment history is kept. */
  deleteInvoicePermanently: (invoiceId: string) => Promise<InvoiceMutationResult>;
  addFinanceEntry: (entry: Omit<FinanceEntry, 'id'>) => void;
  addReminder: (reminder: Omit<Reminder, 'id'>) => void;
  markReminderSent: (reminderId: string) => void;
  markNotificationOpened: (notificationId: string) => void;
  markAllNotificationsOpened: () => void;
  deleteWorkspace: () => Promise<void>;
  deleteAllData: () => void;
  /** Everything a Workspace Backup carries, Dustbin included, straight from the live workspace. */
  readWorkspaceSnapshot: () => WorkspaceSnapshot;
  /**
   * Merges a validated backup into this workspace and lets the normal save queue persist it.
   * Records are only ever added — nothing already here is overwritten or removed.
   */
  restoreWorkspaceBackup: (backup: BookflowBackup) => WorkspaceMergeResult;
};

const initialPackages: PackageOption[] = [
  {
    id: 'pkg-1',
    name: 'Wedding Package',
    details: 'Full wedding photography coverage with two photographers.',
    duration: '8 hours',
    price: 3200,
    info: 'A 30% booking deposit is required. Final images are delivered within 8 weeks.',
  },
  {
    id: 'pkg-2',
    name: 'Family Session',
    details: 'Outdoor or studio portrait session for one family.',
    duration: '2 hours',
    price: 850,
    info: 'The session may be rescheduled once with at least 48 hours notice.',
  },
  {
    id: 'pkg-3',
    name: 'Commercial Day Rate',
    details: 'Commercial photography coverage with edited image delivery.',
    duration: '8 hours',
    price: 4200,
    info: 'Usage licensing is limited to the scope agreed in the final invoice.',
  },
];

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

type PersistedAppData = {
  version: 1;
  packages: PackageOption[];
  customers: Customer[];
  bookings: Booking[];
  invoices: Invoice[];
  payments: InvoicePayment[];
  financeEntries: FinanceEntry[];
  reminders: Reminder[];
  notifications: AppNotification[];
  businessProfile: BusinessProfile;
  currency: CurrencyCode;
  invoiceSettings: InvoiceSettings;
};

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  numberFormat: DEFAULT_INVOICE_NUMBER_FORMAT,
  paymentTermDays: 0,
  paymentInstructions: '',
  termsAndConditions: '',
  nextInvoiceSequence: 1,
  design: { ...DEFAULT_INVOICE_DESIGN, visibility: { ...DEFAULT_INVOICE_DESIGN.visibility } },
};

function getInvoiceDueDate(eventDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate);
  if (!match) return eventDate;

  const [, year, month, day] = match;
  const dueDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  dueDate.setUTCDate(dueDate.getUTCDate() - 1);
  return dueDate.toISOString().slice(0, 10);
}

function getLocalTodayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Workspaces saved before payments were individual records only kept a single running total on the
 * invoice. Turn that total into one payment record so no money disappears from the ledger.
 */
/**
 * Turns a Supabase Storage failure into something the user can act on.
 *
 * "Bucket not found" in particular means the business-logo migration has not been applied to the
 * project yet, which is a setup step rather than anything the user did wrong — saying so beats
 * surfacing the raw driver message.
 */
function describeStorageError(error: { message?: string }) {
  const message = error?.message ?? '';

  if (/bucket not found/i.test(message)) {
    return new Error(
      'Logo storage is not set up on this Supabase project yet. Apply the business-logo storage migration, then try again.',
    );
  }
  if (/mime type|content type/i.test(message)) {
    return new Error('That image type is not supported. Choose a JPG, PNG, or WebP logo.');
  }
  if (/exceeded the maximum allowed size|payload too large/i.test(message)) {
    return new Error('Choose a logo smaller than 5 MB.');
  }
  if (/row-level security|not authorized|unauthorized/i.test(message)) {
    return new Error('Your account is not allowed to change this logo. Sign out and back in, then try again.');
  }

  return new Error(message || 'The logo could not be saved. Check your connection and try again.');
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decodes base64 to bytes.
 *
 * Hermes has no global `atob` — React Native does not polyfill it — so calling one throws at
 * runtime rather than failing gracefully. This keeps the image-picker fallback working without
 * pulling in a dependency for sixteen lines of arithmetic.
 */
function decodeBase64(value: string) {
  const clean = value.replace(/[^A-Za-z0-9+/]/g, '');
  const byteLength = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(byteLength);
  let byteIndex = 0;
  let buffer = 0;
  let bits = 0;

  for (let index = 0; index < clean.length; index += 1) {
    const charValue = BASE64_ALPHABET.indexOf(clean[index]);
    if (charValue < 0) continue;

    buffer = (buffer << 6) | charValue;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[byteIndex] = (buffer >> bits) & 0xff;
      byteIndex += 1;
    }
  }

  return byteIndex === bytes.length ? bytes : bytes.subarray(0, byteIndex);
}

/**
 * The status a restored invoice should come back as when nothing was recorded for it — an invoice
 * voided before the app started remembering the status it had beforehand.
 *
 * Derived from the money against it, so a settled invoice returns settled. Only an invoice that was
 * accepted or already carried payments could have been voided, hence 'Accepted' as the floor.
 */
function reactivateInvoiceStatus(invoice: Invoice, payments: InvoicePayment[]): Invoice['status'] {
  if (invoice.status !== 'Void') return invoice.status;

  const paidCents = sumPaymentsInCents(payments.filter((payment) => payment.invoiceId === invoice.id));
  const totalCents = toCents(invoice.amount);

  if (paidCents >= totalCents && totalCents > 0) return 'Paid';
  if (paidCents > 0) return 'Partially Paid';
  return 'Accepted';
}

function createPaymentId() {
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildInvoicePaymentFinanceEntries(
  invoice: Invoice,
  invoicePayments: InvoicePayment[],
  customers: Customer[],
) {
  const sortedPayments = [...invoicePayments].sort(
    (first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id),
  );
  const isSettled = sumPaymentsInCents(sortedPayments) >= toCents(invoice.amount);
  const client = customers.find((customer) => customer.id === invoice.customerId);
  const entryPrefix = `fin-payment-${invoice.id}-`;

  return sortedPayments.map<FinanceEntry>((payment, index) => {
    const isFinalPayment = isSettled && index === sortedPayments.length - 1;
    const label = payment.kind === 'deposit' ? 'Deposit received' : 'Payment received';

    return {
      id: `${entryPrefix}${payment.id}`,
      category: isFinalPayment
        ? 'Full payment'
        : payment.kind === 'deposit'
          ? 'Invoice deposit'
          : 'Invoice payment',
      amount: payment.amount,
      date: payment.date,
      description: [
        client ? `${label} ${client.name}` : label,
        `For Invoice ${invoice.id}`,
        payment.method ? `Paid by ${payment.method}` : '',
        payment.notes ?? '',
      ]
        .filter(Boolean)
        .join('\n'),
      type: 'income',
      sourceType: payment.kind === 'deposit' ? 'invoice_deposit' : 'invoice_payment',
      sourceId: payment.id,
      bookingId: invoice.bookingId,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
    };
  });
}

function replaceInvoicePaymentFinanceEntries(
  entries: FinanceEntry[],
  invoice: Invoice,
  invoicePayments: InvoicePayment[],
  customers: Customer[],
) {
  const entryPrefix = `fin-payment-${invoice.id}-`;
  const legacyAcceptedDescription = `Invoice ${invoice.id} accepted by customer`;
  const untouched = entries.filter(
    (entry) =>
      !entry.id.startsWith(entryPrefix) &&
      entry.id !== `fin-deposit-${invoice.id}` &&
      !(entry.category === 'Accepted invoice' && entry.description === legacyAcceptedDescription),
  );

  return [...buildInvoicePaymentFinanceEntries(invoice, invoicePayments, customers), ...untouched];
}

/**
 * Repairs old workspaces on load: payment records are mirrored into the cash ledger exactly once,
 * and the former generated "Accepted invoice" accrual is removed because acceptance is not cash.
 */
function reconcileInvoicePaymentFinanceEntries(
  entries: FinanceEntry[],
  invoices: Invoice[],
  payments: InvoicePayment[],
  customers: Customer[],
) {
  const cashOnlyEntries = entries.filter(
    (entry) =>
      !(
        entry.type === 'income' &&
        entry.category === 'Accepted invoice' &&
        /^Invoice .+ accepted by customer$/.test(entry.description)
      ),
  );

  const reconciled = invoices.reduce(
    (current, invoice) =>
      replaceInvoicePaymentFinanceEntries(
        current,
        invoice,
        payments.filter((payment) => payment.invoiceId === invoice.id),
        customers,
      ),
    cashOnlyEntries,
  );

  return reconciled.map((entry) => ({
    ...entry,
    sourceType: entry.sourceType ?? (entry.type === 'income' ? 'manual_income' : 'manual_expense'),
    sourceId: entry.sourceId ?? entry.id,
  }));
}

function migrateInvoicePayments(invoices: Invoice[], payments: InvoicePayment[]): InvoicePayment[] {
  const invoicesWithRecords = new Set(payments.map((payment) => payment.invoiceId));
  const migrated: InvoicePayment[] = [];

  invoices.forEach((invoice) => {
    if (invoicesWithRecords.has(invoice.id)) return;

    const legacyTotal = invoice.status === 'Paid' ? invoice.amount : invoice.depositPaid ?? 0;
    if (!Number.isFinite(legacyTotal) || legacyTotal <= 0) return;

    migrated.push({
      id: `pay-legacy-${invoice.id}`,
      invoiceId: invoice.id,
      amount: legacyTotal,
      method: 'Recorded',
      date: invoice.sentAt || getLocalTodayKey(),
      kind: 'deposit',
      recordedAt: invoice.sentAt || new Date().toISOString(),
    });
  });

  return [...payments, ...migrated];
}

function createFreshWorkspace(user: AuthUser): PersistedAppData {
  return {
    version: 1,
    packages: initialPackages,
    customers: [],
    bookings: [],
    invoices: [],
    payments: [],
    financeEntries: [],
    reminders: [],
    notifications: [],
    businessProfile: {
      name: '',
      ssmRegistrationNo: '',
      nature: '',
      phone: '',
      email: user.email,
      address: '',
    },
    currency: 'MYR',
    invoiceSettings: { ...DEFAULT_INVOICE_SETTINGS },
  };
}

function parseWorkspace(value: Json, user: AuthUser): PersistedAppData {
  const fallback = createFreshWorkspace(user);

  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return fallback;
  }

  const data = value as Record<string, unknown>;
  const profile = data.businessProfile;
  const currency = data.currency;
  const parsedInvoices = Array.isArray(data.invoices) ? (data.invoices as Invoice[]) : fallback.invoices;
  const parsedCustomers = Array.isArray(data.customers) ? (data.customers as Customer[]) : fallback.customers;
  const parsedPayments = migrateInvoicePayments(
    parsedInvoices,
    Array.isArray(data.payments) ? (data.payments as InvoicePayment[]) : [],
  );
  const parsedFinanceEntries = Array.isArray(data.financeEntries)
    ? (data.financeEntries as FinanceEntry[])
    : fallback.financeEntries;
  const savedSettings = data.invoiceSettings;

  return {
    version: 1,
    packages: Array.isArray(data.packages) ? (data.packages as PackageOption[]) : fallback.packages,
    customers: parsedCustomers,
    bookings: Array.isArray(data.bookings) ? (data.bookings as Booking[]) : fallback.bookings,
    invoices: parsedInvoices,
    payments: parsedPayments,
    financeEntries: reconcileInvoicePaymentFinanceEntries(
      parsedFinanceEntries,
      parsedInvoices,
      parsedPayments,
      parsedCustomers,
    ),
    reminders: Array.isArray(data.reminders) ? (data.reminders as Reminder[]) : fallback.reminders,
    notifications: Array.isArray(data.notifications)
      ? (data.notifications as AppNotification[])
      : fallback.notifications,
    businessProfile: normalizeBusinessProfile(profile, fallback.businessProfile),
    currency: currency === 'MYR' || currency === 'IDR' || currency === 'USD' ? currency : fallback.currency,
    invoiceSettings: normalizeInvoiceSettings(savedSettings, parsedInvoices),
  };
}

/**
 * Empties anything whose 30-day stay in the dustbin has run out, exactly as a manual permanent
 * delete would: the invoice, its payment records and the ledger rows they produced all go together,
 * so a swept invoice can never come back as untraceable income.
 *
 * Runs once per workspace load. That is enough — the window is 30 days, so nothing meaningful turns
 * on catching the moment it lapses while the app happens to be open.
 */
function sweepExpiredDustbinInvoices(workspace: PersistedAppData, now = new Date()) {
  const expiredIds = new Set(getExpiredDustbinInvoiceIds(workspace.invoices, now));
  if (expiredIds.size === 0) return { workspace, expiredIds };

  return {
    workspace: {
      ...workspace,
      invoices: workspace.invoices.filter((invoice) => !expiredIds.has(invoice.id)),
      payments: workspace.payments.filter((payment) => !expiredIds.has(payment.invoiceId)),
      financeEntries: workspace.financeEntries.filter(
        (entry) => !entry.invoiceId || !expiredIds.has(entry.invoiceId),
      ),
    },
    expiredIds,
  };
}

function needsFinanceSourceMigration(value: Json) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return false;
  const entries = (value as Record<string, unknown>).financeEntries;
  if (!Array.isArray(entries)) return false;

  return entries.some((value) => {
    if (!value || Array.isArray(value) || typeof value !== 'object') return false;
    const entry = value as Partial<FinanceEntry>;
    return !entry.sourceType || !entry.sourceId || entry.category === 'Accepted invoice';
  });
}

/**
 * Workspaces saved before invoice numbering existed have no settings. Seed them with the defaults,
 * and start the counter past however many invoices they already have so a first new invoice can
 * never collide with history.
 */
/** Fills in the invoice fields added after a workspace was first saved, without losing anything. */
function normalizeBusinessProfile(value: unknown, fallback: BusinessProfile): BusinessProfile {
  if (!value || Array.isArray(value) || typeof value !== 'object') return fallback;

  const saved = value as Partial<BusinessProfile>;

  return {
    ...fallback,
    ...saved,
    website: typeof saved.website === 'string' ? saved.website : '',
    paymentDetails: normalizeBankDetails(saved.paymentDetails),
  };
}

function normalizeInvoiceSettings(value: unknown, invoices: Invoice[]): InvoiceSettings {
  const saved = value && !Array.isArray(value) && typeof value === 'object' ? (value as Partial<InvoiceSettings>) : {};
  const numberFormat = typeof saved.numberFormat === 'string' && saved.numberFormat.trim()
    ? saved.numberFormat
    : DEFAULT_INVOICE_SETTINGS.numberFormat;
  const paymentTermDays = Number.isFinite(saved.paymentTermDays) ? Math.max(0, Math.floor(saved.paymentTermDays as number)) : 0;
  const paymentInstructions = typeof saved.paymentInstructions === 'string' ? saved.paymentInstructions : '';
  const termsAndConditions = typeof saved.termsAndConditions === 'string' ? saved.termsAndConditions : '';
  const savedSequence = Number.isFinite(saved.nextInvoiceSequence) ? Math.floor(saved.nextInvoiceSequence as number) : 0;

  return {
    numberFormat,
    paymentTermDays,
    paymentInstructions,
    termsAndConditions,
    nextInvoiceSequence: Math.max(1, savedSequence, invoices.length + 1),
    // A workspace saved before invoice customisation existed reads back as the Standard template
    // with BookFlow's own accent — exactly how those invoices already look.
    design: normalizeInvoiceDesign(saved.design),
  };
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { getAccessToken, isAuthenticated, user } = useAuth();
  const { isPro } = useSubscription();
  const supabase = useMemo(
    () => (isSupabaseConfigured ? createClerkSupabaseClient(getAccessToken) : null),
    [getAccessToken],
  );
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allInvoices, setInvoices] = useState<Invoice[]>([]);
  const [allPayments, setPayments] = useState<InvoicePayment[]>([]);
  const [allFinanceEntries, setFinanceEntries] = useState<FinanceEntry[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraftPrefill | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>({
    name: '',
    ssmRegistrationNo: '',
    nature: '',
    phone: '',
    email: '',
    address: '',
    logoUrl: undefined,
    logoPath: undefined,
  });
  const [currency, setCurrency] = useState<CurrencyCode>('MYR');
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>({ ...DEFAULT_INVOICE_SETTINGS });
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [syncRetryKey, setSyncRetryKey] = useState(0);
  const canSaveRef = useRef(false);
  const loadedUserIdRef = useRef<string | null>(null);
  const lastQueuedSnapshotRef = useRef('');
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const bookingsRef = useRef<Booking[]>([]);
  // Invoices whose public link is mid-write. The status poll must not read the old remote value
  // back over the local one while a trash, restore or void is still landing.
  const linkSyncingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  useEffect(() => {
    let isCancelled = false;
    canSaveRef.current = false;

    if (!isAuthenticated || !user) {
      loadedUserIdRef.current = null;
      setIsLoading(false);
      setLoadError(null);
      return () => {
        isCancelled = true;
      };
    }

    if (!supabase) {
      setIsLoading(false);
      setLoadError(
        'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and ' +
          'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart Expo.',
      );
      return () => {
        isCancelled = true;
      };
    }

    const isInitialLoad = loadedUserIdRef.current !== user.id;
    if (isInitialLoad) {
      setIsLoading(true);
      setLoadError(null);
      setSyncError(null);
    }

    const loadWorkspace = async () => {
      const { data: row, error } = await supabase
        .from('bookflow_workspaces')
        .select('data')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      const parsed = row ? parseWorkspace(row.data, user) : createFreshWorkspace(user);
      const swept = sweepExpiredDustbinInvoices(parsed);
      const workspace = swept.workspace;
      const shouldPersistFinanceMigration = Boolean(row && needsFinanceSourceMigration(row.data));

      if (!row) {
        const { error: insertError } = await supabase.from('bookflow_workspaces').insert({
          user_id: user.id,
          data: workspace as unknown as Json,
        });
        if (insertError) throw insertError;
      }

      if (isCancelled) return;

      setPackages(workspace.packages);
      setCustomers(workspace.customers);
      bookingsRef.current = workspace.bookings;
      setBookings(workspace.bookings);
      setInvoices(workspace.invoices);
      setPayments(workspace.payments);
      setFinanceEntries(workspace.financeEntries);
      setReminders(workspace.reminders);
      setNotifications(workspace.notifications);
      setBusinessProfile(workspace.businessProfile);
      setCurrency(workspace.currency);
      setInvoiceSettings(workspace.invoiceSettings);
      setInvoiceDraft(null);
      // Let the normal save queue persist source metadata, legacy payment reconciliation and any
      // dustbin sweep once. Blanking the snapshot is what makes the save effect see a change.
      lastQueuedSnapshotRef.current =
        shouldPersistFinanceMigration || swept.expiredIds.size > 0 ? '' : JSON.stringify(workspace);
      canSaveRef.current = true;
      loadedUserIdRef.current = user.id;

      // Best effort, and deliberately not awaited: the workspace is already loaded, and a failure
      // here only leaves behind link rows that expire on their own after 30 days anyway.
      if (swept.expiredIds.size > 0) {
        supabase
          .from('public_invoice_links')
          .delete()
          .eq('user_id', user.id)
          .in('invoice_id', Array.from(swept.expiredIds))
          .then(() => {}, () => {});
      }
      setLoadError(null);
      setIsLoading(false);
    };

    loadWorkspace().catch((error: unknown) => {
      if (isCancelled) return;
      const message = error instanceof Error ? error.message : 'Bookflow could not load your Supabase workspace.';
      if (isInitialLoad) {
        setIsLoading(false);
        setLoadError(message);
      } else {
        setSyncError(message);
      }
    });

    return () => {
      isCancelled = true;
      canSaveRef.current = false;
    };
  }, [isAuthenticated, reloadKey, supabase, user?.id]);

  useEffect(() => {
    if (!canSaveRef.current || !supabase || !user) return;

    const workspace: PersistedAppData = {
      version: 1,
      invoiceSettings,
      packages,
      customers,
      bookings,
      // The persisted document always carries the full record — Dustbin lives inside it, and the
      // payments and ledger rows it is holding back are stored intact so a restore is exact.
      invoices: allInvoices,
      payments: allPayments,
      financeEntries: allFinanceEntries,
      reminders,
      notifications,
      businessProfile,
      currency,
    };
    const serialized = JSON.stringify(workspace);

    if (serialized === lastQueuedSnapshotRef.current) return;
    lastQueuedSnapshotRef.current = serialized;

    saveQueueRef.current = saveQueueRef.current
      .catch(() => {})
      .then(async () => {
        try {
          const { error } = await supabase.from('bookflow_workspaces').upsert({
            user_id: user.id,
            data: workspace as unknown as Json,
            updated_at: new Date().toISOString(),
          });

          setSyncError(error?.message ?? null);
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : 'Bookflow could not sync changes to Supabase.');
        }
      });
  }, [allFinanceEntries, allInvoices, allPayments, bookings, businessProfile, currency, customers, invoiceSettings, notifications, packages, reminders, supabase, syncRetryKey, user]);

  /**
   * The single place Dustbin is filtered out. Every screen, selector and finance calculation reads
   * `invoices` off this context, so soft-deleted invoices leave the active app in one step and can
   * never leak into an outstanding total, a client balance or an invoice count by omission.
   */
  const activeInvoices = useMemo(() => allInvoices.filter((invoice) => !invoice.deletedAt), [allInvoices]);
  const trashedInvoices = useMemo(
    () =>
      allInvoices
        .filter((invoice) => Boolean(invoice.deletedAt))
        .sort((first, second) => (second.deletedAt ?? '').localeCompare(first.deletedAt ?? '')),
    [allInvoices],
  );
  const trashedInvoiceIds = useMemo(
    () => new Set(trashedInvoices.map((invoice) => invoice.id)),
    [trashedInvoices],
  );

  /**
   * Trashing an invoice takes its money out of the app with it: the payment records and the cash
   * ledger rows they produced are withheld from every total, so revenue, income and the transaction
   * lists all drop by exactly the amount that invoice contributed.
   *
   * Withheld, not destroyed — both lists still hold every row, and restoring the invoice brings its
   * figures straight back. Only a permanent delete actually removes them.
   */
  const activePayments = useMemo(
    () => allPayments.filter((payment) => !trashedInvoiceIds.has(payment.invoiceId)),
    [allPayments, trashedInvoiceIds],
  );
  const activeFinanceEntries = useMemo(
    () => allFinanceEntries.filter((entry) => !entry.invoiceId || !trashedInvoiceIds.has(entry.invoiceId)),
    [allFinanceEntries, trashedInvoiceIds],
  );

  const refreshInvoiceStatuses = useCallback(async () => {
    const userId = user?.id;
    if (!supabase || !userId) return;

    const { data, error } = await supabase
      .from('public_invoice_links')
      .select('invoice_id,status')
      .eq('user_id', userId);
    if (error) throw error;

    const statusByInvoice = new Map(data.map((item) => [item.invoice_id, item.status]));
    setInvoices((current) => {
      let hasChanges = false;
      const next = current.map((invoice) => {
        // A trashed or voided invoice owns its status locally: the customer-facing link is closed
        // and must never pull it back to Sent/Accepted, nor overwrite Void with Cancelled. The same
        // applies for as long as a link write for it is still in flight.
        if (invoice.deletedAt || invoice.status === 'Void' || linkSyncingRef.current.has(invoice.id)) {
          return invoice;
        }

        const remoteStatus = statusByInvoice.get(invoice.id);
        const nextStatus: Invoice['status'] | null =
          remoteStatus === 'Sent' ||
          remoteStatus === 'Accepted' ||
          remoteStatus === 'Declined' ||
          remoteStatus === 'Paid' ||
          remoteStatus === 'Cancelled'
            ? remoteStatus
            : null;
        // Payment-derived statuses are owned locally: never let a customer-facing 'Sent' or
        // 'Accepted' overwrite money that has actually been recorded.
        const isLocallyPaidState = invoice.status === 'Paid' || invoice.status === 'Partially Paid';
        const isRemoteDowngrade = nextStatus === 'Sent' || nextStatus === 'Accepted';

        if (isLocallyPaidState && isRemoteDowngrade) {
          return invoice;
        }

        if (nextStatus && nextStatus !== invoice.status) {
          hasChanges = true;
          return { ...invoice, status: nextStatus };
        }
        return invoice;
      });
      return hasChanges ? next : current;
    });
  }, [supabase, user?.id]);

  /**
   * Single writer for anything money related: it stores the payment records, refreshes the invoice
   * status and its cached total, and mirrors the payments into the finance ledger as income.
   */
  const applyInvoicePayments = useCallback(
    (invoice: Invoice, nextPayments: InvoicePayment[]) => {
      const invoicePayments = nextPayments.filter((payment) => payment.invoiceId === invoice.id);
      // nextPayments is always built from the complete record, never the active-only view, so
      // writing one payment can never drop the rows a trashed invoice is holding.

      const paidCents = sumPaymentsInCents(invoicePayments);

      setPayments(nextPayments);
      setInvoices((current) =>
        current.map((item) =>
          item.id === invoice.id
            ? {
                ...item,
                depositPaid: fromCents(paidCents),
                status: resolveInvoiceStatus(item, paidCents),
              }
            : item,
        ),
      );

      setFinanceEntries((current) =>
        replaceInvoicePaymentFinanceEntries(current, invoice, invoicePayments, customers),
      );
    },
    [customers],
  );

  /**
   * Stamps a new invoice with its number and a snapshot of the settings in force right now. Later
   * edits to the business profile or invoice defaults leave the stamped invoice untouched.
   */
  const stampNewInvoice = useCallback(
    (existing: Invoice[]) => {
      const taken = new Set(existing.map((item) => item.invoiceNumber ?? item.id));
      // Pro's optional prefix joins the configured format for this stamping only. Numbers already
      // issued keep exactly the text they were given — nothing is ever renumbered.
      const prefix = isPro ? invoiceSettings.design.invoicePrefix.trim() : '';
      const { invoiceNumber, sequence } = nextAvailableInvoiceNumber(
        `${prefix}${invoiceSettings.numberFormat}`,
        invoiceSettings.nextInvoiceSequence,
        new Date(),
        taken,
      );

      // The design is frozen here alongside the business details, and gated at the moment of
      // stamping: a workspace that is not Pro records the Standard template whatever is selected,
      // so a lapsed subscription can never leave premium branding on newly issued invoices.
      const design: InvoiceDesign = {
        ...invoiceSettings.design,
        templateId: resolveTemplateForEntitlement(invoiceSettings.design.templateId, isPro),
        accentColor: isPro ? invoiceSettings.design.accentColor : DEFAULT_INVOICE_DESIGN.accentColor,
        thankYouMessage: isPro ? invoiceSettings.design.thankYouMessage : '',
        visibility: isPro
          ? { ...invoiceSettings.design.visibility }
          : { ...DEFAULT_INVOICE_DESIGN.visibility },
      };

      const snapshot: InvoiceSnapshot = {
        businessName: businessProfile.name,
        businessRegistrationNumber: businessProfile.ssmRegistrationNo,
        businessPhone: businessProfile.phone,
        businessEmail: businessProfile.email,
        businessAddress: businessProfile.address,
        businessWebsite: businessProfile.website ?? '',
        businessLogoUrl: isPro ? businessProfile.logoUrl ?? null : null,
        paymentTermDays: invoiceSettings.paymentTermDays,
        paymentInstructions: invoiceSettings.paymentInstructions,
        paymentDetails: normalizeBankDetails(businessProfile.paymentDetails),
        termsAndConditions: invoiceSettings.termsAndConditions,
        design,
      };

      // The counter only moves forward, so a deleted invoice can never free its number for reuse.
      setInvoiceSettings((current) => ({
        ...current,
        nextInvoiceSequence: Math.max(current.nextInvoiceSequence, sequence + 1),
      }));

      return { invoiceNumber, snapshot };
    },
    [businessProfile, invoiceSettings, isPro],
  );

  /** Writes one link row's status and mirrors it into the frozen payload the public page renders. */
  const writePublicInvoiceLinkStatus = useCallback(
    async (invoiceId: string, status: 'Sent' | 'Accepted' | 'Declined' | 'Paid' | 'Cancelled' | 'Void') => {
      if (!supabase || !user) return;

      const { data, error } = await supabase
        .from('public_invoice_links')
        .select('payload')
        .eq('user_id', user.id)
        .eq('invoice_id', invoiceId)
        .maybeSingle();

      if (error) throw error;
      // Never shared, so there is no link to close.
      if (!data) return;

      const payload = data.payload && typeof data.payload === 'object' && !Array.isArray(data.payload)
        ? (data.payload as Record<string, unknown>)
        : null;
      const invoicePayload = payload?.invoice && typeof payload.invoice === 'object' && !Array.isArray(payload.invoice)
        ? (payload.invoice as Record<string, unknown>)
        : null;
      const nextPayload = payload && invoicePayload
        ? { ...payload, invoice: { ...invoicePayload, status } }
        : payload;

      const { error: updateError } = await supabase
        .from('public_invoice_links')
        .update({
          status,
          ...(nextPayload ? { payload: nextPayload as unknown as Json } : null),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('invoice_id', invoiceId);

      if (updateError) throw updateError;
    },
    [supabase, user],
  );

  /**
   * Points an invoice's public link at a new status. The capability token itself is never rotated
   * or dropped, so a restore re-opens the same link the customer already has rather than forcing a
   * weaker or re-shared one. The database refuses customer responses on 'Cancelled' and 'Void'.
   */
  const setPublicInvoiceLinkStatus = useCallback(
    async (invoiceId: string, status: 'Sent' | 'Accepted' | 'Declined' | 'Paid' | 'Cancelled' | 'Void') => {
      linkSyncingRef.current.add(invoiceId);
      try {
        await writePublicInvoiceLinkStatus(invoiceId, status);
      } finally {
        linkSyncingRef.current.delete(invoiceId);
      }
    },
    [writePublicInvoiceLinkStatus],
  );

  /** The public status an active invoice should present, mirroring createInvoiceShareLink. */
  const getPublicLinkStatus = useCallback((invoice: Invoice) => {
    if (
      invoice.status === 'Accepted' ||
      invoice.status === 'Declined' ||
      invoice.status === 'Paid' ||
      invoice.status === 'Cancelled' ||
      invoice.status === 'Void'
    ) {
      return invoice.status;
    }
    return 'Sent' as const;
  }, []);

  /**
   * Moves an invoice to Dustbin. The record is only ever *annotated* — no field is cleared, no
   * payment or ledger row is touched — so Dustbin holds the original invoice and a restore is exact.
   *
   * A 'void' additionally stamps voidedAt and flips the status to Void, which keeps the invoice out
   * of every outstanding/expected-revenue calculation while its received payments stay in the cash
   * ledger exactly as they were.
   *
   * The local change lands first so the invoice disappears from the list immediately; closing the
   * customer-facing link follows and is reported separately if it fails.
   */
  const trashInvoice = useCallback(
    async ({ invoiceId, mode, reason }: TrashInvoiceInput): Promise<InvoiceMutationResult> => {
      const invoice = allInvoices.find((item) => item.id === invoiceId);
      if (!invoice) {
        return { ok: false, error: 'This invoice could no longer be found.' };
      }
      if (invoice.deletedAt) {
        // A double tap on the confirm button must not stamp a second, later deletion time.
        return { ok: true };
      }

      const now = new Date().toISOString();
      const trimmedReason = reason?.trim() || null;
      const isVoid = mode === 'void';
      const nextStatus: Invoice['status'] =
        isVoid ? 'Void' : mode === 'cancel' ? 'Cancelled' : invoice.status;

      setInvoices((current) =>
        current.map((item) =>
          item.id === invoiceId
            ? {
                ...item,
                status: nextStatus,
                statusBeforeTrash: nextStatus === item.status ? null : item.status,
                deletedAt: now,
                deletionReason: trimmedReason,
                ...(isVoid ? { voidedAt: item.voidedAt ?? now, voidReason: trimmedReason } : null),
              }
            : item,
        ),
      );

      try {
        await setPublicInvoiceLinkStatus(invoiceId, isVoid ? 'Void' : 'Cancelled');
        return { ok: true };
      } catch {
        return {
          ok: true,
          error: 'The invoice was moved to the Dustbin, but its shared link could not be closed. Try again from the Dustbin.',
        };
      }
    },
    [allInvoices, setPublicInvoiceLinkStatus],
  );

  /**
   * Restores the original record in place. The invoice id, number, customer, line detail, deposits,
   * payments, acceptance, snapshot and public link token all survive untouched, so nothing is
   * duplicated and no number is reissued.
   *
   * The invoice comes back working, not voided: it returns to the status it held before it was put
   * in the dustbin, its money counts again, and its shared link reopens.
   */
  const restoreInvoice = useCallback(
    async (invoiceId: string): Promise<InvoiceMutationResult> => {
      const invoice = allInvoices.find((item) => item.id === invoiceId);
      if (!invoice) {
        return { ok: false, error: 'This invoice could no longer be found.' };
      }
      if (!invoice.deletedAt) {
        return { ok: true };
      }

      // Restoring returns a working invoice, whether it was deleted, cancelled or voided: the
      // status it held before going into the dustbin comes back, and the void stamps are cleared
      // with it. Voiding is how an invoice leaves the active list, not a state it stays stuck in.
      const restored: Invoice = {
        ...invoice,
        status: invoice.statusBeforeTrash ?? reactivateInvoiceStatus(invoice, allPayments),
        statusBeforeTrash: null,
        voidedAt: null,
        voidReason: null,
        deletedAt: null,
        deletionReason: null,
      };
      setInvoices((current) => current.map((item) => (item.id === invoiceId ? restored : item)));

      try {
        await setPublicInvoiceLinkStatus(invoiceId, getPublicLinkStatus(restored));
        return { ok: true };
      } catch {
        return {
          ok: true,
          error: 'The invoice was restored, but its shared link could not be reopened. Send it again to refresh the link.',
        };
      }
    },
    [allInvoices, allPayments, getPublicLinkStatus, setPublicInvoiceLinkStatus],
  );

  /**
   * Destroys the invoice record for good, together with its payment records and the cash-ledger
   * rows they produced.
   *
   * Dustbin already withheld all three from every total, so this changes no figure on any screen —
   * it only makes the removal final. Purging them keeps the two states consistent: an invoice that
   * has stopped counting does not start counting again because it was deleted harder.
   *
   * The link row is revoked first and the local purge only follows a success, because a purged
   * invoice would leave no way to reach its token again.
   */
  const deleteInvoicePermanently = useCallback(
    async (invoiceId: string): Promise<InvoiceMutationResult> => {
      const invoice = allInvoices.find((item) => item.id === invoiceId);
      if (!invoice) {
        return { ok: false, error: 'This invoice could no longer be found.' };
      }

      if (supabase && user) {
        try {
          const { error } = await supabase
            .from('public_invoice_links')
            .delete()
            .eq('user_id', user.id)
            .eq('invoice_id', invoiceId);
          if (error) throw error;
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error && error.message
                ? `The invoice could not be deleted: ${error.message}`
                : 'The invoice could not be deleted. Check your connection and try again.',
          };
        }
      }

      setInvoices((current) => current.filter((item) => item.id !== invoiceId));
      setPayments((current) => current.filter((payment) => payment.invoiceId !== invoiceId));
      setFinanceEntries((current) => current.filter((entry) => entry.invoiceId !== invoiceId));
      return { ok: true };
    },
    [allInvoices, supabase, user],
  );

  const uploadBusinessLogo = useCallback(
    async (image: BusinessLogoUpload) => {
      if (!isPro) {
        throw new Error('Bookflow Pro is required to upload a business logo.');
      }
      if (!supabase || !user) {
        throw new Error('Your Supabase workspace is not connected.');
      }

      const normalizedMimeType = image.mimeType?.toLowerCase() ?? '';
      // The picker frequently reports no mimeType at all — notably on the iOS simulator and after
      // `allowsEditing` crops — so the extension and then JPEG stand in. The bucket only accepts
      // jpeg/png/webp, and `quality` makes the picker hand back a JPEG, so that is the safe default.
      const contentType = normalizedMimeType === 'image/jpeg' || normalizedMimeType === 'image/png' || normalizedMimeType === 'image/webp'
        ? normalizedMimeType
        : normalizedMimeType === 'image/jpg'
          ? 'image/jpeg'
          : /\.png(\?|$)/i.test(image.uri)
            ? 'image/png'
            : /\.webp(\?|$)/i.test(image.uri)
              ? 'image/webp'
              : 'image/jpeg';
      let body: ArrayBuffer | Blob | Uint8Array;

      if (Platform.OS === 'web') {
        const response = await fetch(image.uri);
        if (!response.ok) throw new Error('The selected logo could not be read.');
        body = await response.blob();
      } else if (image.base64) {
        // The picker is always asked for base64, so this is the normal native path. Decoding it
        // here keeps the upload off any dynamically imported native module: one that is missing
        // from the running bundle fails as an uncaught module error rather than something this
        // can catch and recover from.
        body = decodeBase64(image.base64);
      } else {
        // Only for a picker result that carried no base64 at all.
        try {
          const { File } = await import('expo-file-system');
          body = await new File(image.uri).arrayBuffer();
        } catch {
          throw new Error('The selected logo could not be read. Choose a different image.');
        }
      }

      if (!body || (body instanceof ArrayBuffer && body.byteLength === 0)) {
        throw new Error('The selected logo could not be read. Choose a JPG, PNG, or WebP image.');
      }

      const byteLength = body instanceof ArrayBuffer
        ? body.byteLength
        : body instanceof Uint8Array
          ? body.byteLength
          : body.size;
      if (byteLength > 5 * 1024 * 1024) {
        throw new Error('Choose a logo smaller than 5 MB.');
      }

      const logoPath = `${user.id}/business-logo`;
      const { error } = await supabase.storage.from('business-logos').upload(logoPath, body, {
        cacheControl: '3600',
        contentType,
        upsert: true,
      });
      if (error) throw describeStorageError(error);

      const { data } = supabase.storage.from('business-logos').getPublicUrl(logoPath);
      return {
        logoPath,
        // A version query prevents the CDN and React Native image cache showing the previous upload.
        logoUrl: `${data.publicUrl}?v=${Date.now()}`,
      };
    },
    [isPro, supabase, user],
  );

  const removeBusinessLogo = useCallback(async () => {
    if (!supabase || !user) {
      throw new Error('Your Supabase workspace is not connected.');
    }

    const logoPath = businessProfile.logoPath ?? `${user.id}/business-logo`;
    const { error } = await supabase.storage.from('business-logos').remove([logoPath]);
    if (error) throw describeStorageError(error);
  }, [businessProfile.logoPath, supabase, user]);

  const value = useMemo<AppDataContextValue>(
    () => ({
      isLoading,
      loadError,
      syncError,
      reload: () => setReloadKey((current) => current + 1),
      retrySync: () => {
        lastQueuedSnapshotRef.current = '';
        setSyncRetryKey((current) => current + 1);
      },
      packages,
      customers,
      bookings,
      invoices: activeInvoices,
      trashedInvoices,
      payments: activePayments,
      /** Every payment record, Dustbin included. Only the Dustbin screen needs this view. */
      allPayments,
      financeEntries: activeFinanceEntries,
      reminders,
      notifications,
      invoiceDraft,
      businessProfile,
      updateBusinessProfile: (profile: BusinessProfile) => {
        setBusinessProfile(profile);
      },
      uploadBusinessLogo,
      removeBusinessLogo,
      currency,
      updateCurrency: (code: CurrencyCode) => {
        setCurrency(code);
      },
      invoiceSettings,
      updateInvoiceSettings: (updates: Partial<InvoiceSettings>) => {
        setInvoiceSettings((current) => ({
          ...current,
          ...updates,
          // Never let an edit walk the counter backwards.
          nextInvoiceSequence: Math.max(current.nextInvoiceSequence, updates.nextInvoiceSequence ?? 0),
        }));
      },
      addPackage: (service: Omit<PackageOption, 'id'>) => {
        if (!service.name.trim() || Number.isNaN(service.price) || service.price <= 0) {
          return;
        }

        setPackages((current) => [
          ...current,
          {
            ...service,
            id: `pkg-${Date.now()}`,
            name: service.name.trim(),
            details: service.details.trim(),
            duration: service.duration.trim(),
            info: service.info.trim(),
          },
        ]);
      },
      updatePackage: (id: string, updates: Partial<PackageOption>) => {
        setPackages((current) => current.map((pkg) => (pkg.id === id ? { ...pkg, ...updates } : pkg)));
      },
      removePackage: (id: string) => {
        setPackages((current) => current.filter((item) => item.id !== id));
      },
      addCustomer: (customer: Omit<Customer, 'id'>) => {
        const safeName = customer.name.trim();
        const safeEmail = customer.email.trim();

        if (!safeName || !safeEmail) {
          return null;
        }

        const createdCustomer: Customer = {
          ...customer,
          id: `cust-${Date.now()}`,
          name: safeName,
          email: safeEmail,
        };

        setCustomers((current) => [...current, createdCustomer]);
        return createdCustomer;
      },
      updateCustomer: (id: string, updates: Partial<Omit<Customer, 'id'>>) => {
        const existing = customers.find((customer) => customer.id === id);
        const nextName = (updates.name ?? existing?.name ?? '').trim();

        if (!existing || !nextName) {
          return false;
        }

        setCustomers((current) =>
          current.map((customer) =>
            customer.id === id
              ? {
                  ...customer,
                  ...updates,
                  name: nextName,
                  email: (updates.email ?? customer.email).trim(),
                  phone: (updates.phone ?? customer.phone).trim(),
                }
              : customer,
          ),
        );
        return true;
      },
      deleteCustomer: (id: string) => {
        setCustomers((current) => current.filter((customer) => customer.id !== id));
      },
      createBooking: (booking: CreateBookingInput) => {
        const safeTitle = booking.title.trim();
        const safeNewCustomerName = booking.newCustomer?.name.trim() ?? '';
        const safeNewCustomerEmail = booking.newCustomer?.email.trim() ?? '';
        const existingCustomer = customers.find((customer) => customer.id === booking.customerId);
        const startTime = normalizeBookingTime(booking.startTime ?? booking.time);
        const endTime = normalizeBookingTime(booking.endTime);
        const conflictingBooking = startTime && endTime
          ? findBookingTimeConflict(bookingsRef.current, booking.date, startTime, endTime)
          : null;

        if (
          !safeTitle ||
          !booking.date ||
          !startTime ||
          !endTime ||
          endTime <= startTime ||
          conflictingBooking ||
          Number.isNaN(booking.price) ||
          booking.price <= 0 ||
          (!existingCustomer && !safeNewCustomerName)
        ) {
          return null;
        }

        const createdAt = Date.now();
        const resolvedCustomer: Customer = existingCustomer ?? {
          ...booking.newCustomer!,
          id: `cust-${createdAt}`,
          name: safeNewCustomerName,
          email: safeNewCustomerEmail,
          phone: booking.newCustomer?.phone.trim() ?? '',
          location: booking.newCustomer?.location.trim() ?? '',
          notes: booking.newCustomer?.notes.trim() ?? '',
        };
        const createdBooking: Booking = {
          id: `bk-${createdAt}`,
          customerId: resolvedCustomer.id,
          title: safeTitle,
          date: booking.date,
          time: startTime,
          startTime,
          endTime,
          location: booking.location.trim(),
          packageName: booking.packageName,
          price: booking.price,
          status: booking.status,
          notes: booking.notes.trim() || 'Booking created from the app.',
        };
        const invoiceDueDate = getInvoiceDueDate(booking.date);
        // Numbers taken by trashed invoices stay taken, so a restore can never collide.
        const stamp = stampNewInvoice(allInvoices);
        const createdInvoice: Invoice = {
          id: `inv-${createdAt}`,
          invoiceNumber: stamp.invoiceNumber,
          snapshot: stamp.snapshot,
          bookingId: createdBooking.id,
          customerId: resolvedCustomer.id,
          amount: createdBooking.price,
          dueDate: invoiceDueDate,
          status: 'Draft',
          sentAt: getLocalTodayKey(),
          serviceName: createdBooking.packageName,
          packageDetails: packages.find((item) => item.name === createdBooking.packageName)?.details,
          eventLocation: createdBooking.location,
          eventDate: createdBooking.date,
          eventTime: createdBooking.time,
          eventStartTime: createdBooking.startTime,
          eventEndTime: createdBooking.endTime,
          terms: packages.find((item) => item.name === createdBooking.packageName)?.info,
        };

        if (!existingCustomer) {
          setCustomers((current) => [...current, resolvedCustomer]);
        }
        const nextBookings = [createdBooking, ...bookingsRef.current];
        bookingsRef.current = nextBookings;
        setBookings(nextBookings);
        setInvoices((current) => [createdInvoice, ...current]);
        setReminders((current) => [
          {
            id: `rem-${createdAt}`,
            title: `${safeTitle} reminder`,
            dueDate: booking.date,
            channel: 'email',
            status: 'scheduled',
          },
          ...current,
        ]);
        return { booking: createdBooking, customer: resolvedCustomer, invoice: createdInvoice };
      },
      updateBookingStatus: (bookingId: string, status: Booking['status']) => {
        const booking = bookingsRef.current.find((item) => item.id === bookingId);
        if (!booking) {
          return { ok: false, error: 'This booking could no longer be found.' };
        }
        // A repeated tap on the status already selected is a no-op rather than a redundant write.
        if (booking.status === status) {
          return { ok: true };
        }

        // Optimistic by construction: the change lands in state immediately and the workspace save
        // queue persists it. A failed sync surfaces through the app's existing sync banner, which
        // retries the whole document — the booking's other fields are never touched either way.
        const nextBookings = bookingsRef.current.map((item) =>
          item.id === bookingId ? { ...item, status } : item,
        );
        bookingsRef.current = nextBookings;
        setBookings(nextBookings);
        return { ok: true };
      },
      addInvoice: (invoice: Omit<Invoice, 'id'>) => {
        if (!invoice.customerId || Number.isNaN(invoice.amount) || invoice.amount <= 0) {
          return;
        }

        setInvoices((current) => {
          const stamp = stampNewInvoice(current);
          return [
            {
              ...invoice,
              id: `inv-${Date.now()}`,
              invoiceNumber: stamp.invoiceNumber,
              snapshot: stamp.snapshot,
              status: invoice.status ?? 'Draft',
            },
            ...current,
          ];
        });
        setInvoiceDraft(null);
      },
      createInvoiceShareLink: async (invoiceId: string) => {
        if (!supabase || !user) {
          throw new Error('Your Supabase workspace is not connected.');
        }

        const invoice = allInvoices.find((item) => item.id === invoiceId);
        const customer = invoice ? customers.find((item) => item.id === invoice.customerId) : undefined;
        if (!invoice || !customer) {
          throw new Error('The invoice or customer could not be found.');
        }
        if (invoice.deletedAt || invoice.status === 'Void') {
          throw new Error('This invoice is no longer active and cannot be sent.');
        }

        const booking = bookings.find((item) => item.id === invoice.bookingId);
        const serviceName = invoice.serviceName ?? booking?.packageName;
        const packageOption = packages.find((item) => item.name === serviceName);
        const hasLogoSnapshot = invoice.snapshot
          ? Object.prototype.hasOwnProperty.call(invoice.snapshot, 'businessLogoUrl')
          : false;
        const logoUrl = isPro
          ? hasLogoSnapshot
            ? invoice.snapshot?.businessLogoUrl ?? undefined
            : businessProfile.logoUrl
          : undefined;
        const invoiceBusinessProfile = {
          name: invoice.snapshot?.businessName ?? businessProfile.name,
          ssmRegistrationNo:
            invoice.snapshot?.businessRegistrationNumber ?? businessProfile.ssmRegistrationNo,
          phone: invoice.snapshot?.businessPhone ?? businessProfile.phone,
          email: invoice.snapshot?.businessEmail ?? businessProfile.email,
          address: invoice.snapshot?.businessAddress ?? businessProfile.address,
          logoUrl,
        };
        const publicStatus =
          invoice.status === 'Accepted' ||
          invoice.status === 'Declined' ||
          invoice.status === 'Paid' ||
          invoice.status === 'Cancelled'
            ? invoice.status
            : 'Sent';
        // The customer's page renders from this frozen model rather than recalculating anything of
        // its own, so the figures, template, accent and hidden sections they see are exactly the
        // ones the invoice was issued with. Older links have no `render` and keep their old layout.
        const presentation = resolveInvoicePresentation(
          { ...invoice, status: publicStatus },
          {
            design: invoiceSettings.design,
            business: businessProfile,
            paymentDetails: normalizeBankDetails(businessProfile.paymentDetails),
            paymentInstructions: invoiceSettings.paymentInstructions,
            termsAndConditions: invoiceSettings.termsAndConditions,
            allowBusinessLogo: isPro,
          },
        );
        const render = buildInvoiceRenderData({
          invoice: { ...invoice, status: publicStatus },
          customer,
          payments: allPayments,
          currency,
          design: presentation.design,
          business: presentation.business,
          paymentDetails: presentation.paymentDetails,
          paymentInstructions: presentation.paymentInstructions,
          termsAndConditions: presentation.termsAndConditions,
          serviceName,
          packageDetails: invoice.packageDetails ?? packageOption?.details,
          eventLocation: invoice.eventLocation ?? booking?.location,
          eventDate: invoice.eventDate ?? booking?.date,
          eventStartTime: invoice.eventStartTime ?? booking?.startTime ?? invoice.eventTime ?? booking?.time,
          eventEndTime: invoice.eventEndTime ?? booking?.endTime,
        });

        const payload = {
          render,
          invoice: {
            id: invoice.id,
            invoiceNumber: getInvoiceNumber(invoice),
            amount: invoice.amount,
            depositPaid: invoice.depositPaid,
            dueDate: invoice.dueDate,
            sentAt: invoice.sentAt,
            status: publicStatus,
            terms: invoice.terms,
          },
          customer: {
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
          },
          businessProfile: invoiceBusinessProfile,
          currency,
          serviceName,
          packageDetails: invoice.packageDetails ?? packageOption?.details,
          eventLocation: invoice.eventLocation ?? booking?.location,
          eventDate: invoice.eventDate ?? booking?.date,
          eventStartTime: invoice.eventStartTime ?? booking?.startTime ?? invoice.eventTime ?? booking?.time,
          eventEndTime: invoice.eventEndTime ?? booking?.endTime,
        };
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('public_invoice_links')
          .upsert(
            {
              user_id: user.id,
              invoice_id: invoice.id,
              payload: payload as unknown as Json,
              status: publicStatus,
              expires_at: expiresAt,
              updated_at: now.toISOString(),
            },
            { onConflict: 'user_id,invoice_id' },
          )
          .select('token')
          .single();

        if (error) throw error;

        if (invoice.status === 'Draft' || invoice.status === 'Overdue') {
          setInvoices((current) =>
            current.map((item) => (item.id === invoice.id ? { ...item, status: 'Sent' } : item)),
          );
        }

        return `${getSupabaseFunctionUrl('invoice-public')}?token=${encodeURIComponent(data.token)}`;
      },
      refreshInvoiceStatuses,
      setInvoiceDraft: (draft: InvoiceDraftPrefill | null) => {
        setInvoiceDraft(draft);
      },
      updateInvoiceStatus: (invoiceId: string, status: Invoice['status']) => {
        const invoice = allInvoices.find((item) => item.id === invoiceId);
        // Dustbin is left and entered only through trashInvoice/restoreInvoice.
        if (invoice?.deletedAt) return;

        // "Payment done" represents cash received. Record only the unpaid remainder so earlier
        // deposits plus this final payment can never exceed the invoice total.
        if (status === 'Paid' && invoice) {
          const invoicePayments = allPayments.filter((payment) => payment.invoiceId === invoiceId);
          const outstandingCents = Math.max(0, toCents(invoice.amount) - sumPaymentsInCents(invoicePayments));
          const nextPayments = outstandingCents > 0
            ? [
                ...allPayments,
                {
                  id: `paid-in-full-${invoiceId}-${sumPaymentsInCents(invoicePayments)}`,
                  invoiceId,
                  amount: fromCents(outstandingCents),
                  method: 'Recorded as paid',
                  date: getLocalTodayKey(),
                  kind: 'payment' as const,
                  recordedAt: new Date().toISOString(),
                },
              ]
            : allPayments;

          applyInvoicePayments(invoice, nextPayments);
          return;
        }

        setInvoices((current) => {
          return current.map((invoice) => (invoice.id === invoiceId ? { ...invoice, status } : invoice));
        });

        if (status === 'Accepted' || status === 'Declined') {
          setReminders((current) => [
            {
              id: `rem-${Date.now()}`,
              title: `Invoice ${invoiceId} follow-up`,
              dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
              channel: 'whatsapp',
              status: 'scheduled',
            },
            ...current,
          ]);
        }
      },
      updateInvoiceDeposit: (invoiceId: string, depositPaid: number, details?: InvoicePaymentDetails) => {
        const invoice = allInvoices.find((item) => item.id === invoiceId);
        if (!invoice || !Number.isFinite(depositPaid) || depositPaid <= 0) {
          return false;
        }
        // Voided and trashed invoices keep the deposits they already have, but take no new ones.
        if (invoice.deletedAt || invoice.status === 'Void') {
          return false;
        }

        const otherPayments = allPayments.filter(
          (payment) => payment.invoiceId === invoiceId && payment.kind !== 'deposit',
        );
        const otherCents = sumPaymentsInCents(otherPayments);
        const depositCents = toCents(depositPaid);

        // The deposit modal sets the deposit outright, so it replaces earlier deposit records while
        // every other payment recorded against the invoice is preserved.
        if (depositCents + otherCents > toCents(invoice.amount)) {
          return false;
        }

        const depositRecord: InvoicePayment = {
          id: createPaymentId(),
          invoiceId,
          amount: fromCents(depositCents),
          method: details?.method?.trim() || 'Deposit',
          date: details?.date?.trim() || getLocalTodayKey(),
          notes: details?.notes?.trim() || undefined,
          kind: 'deposit',
          recordedAt: new Date().toISOString(),
        };
        const nextPayments = [
          ...allPayments.filter((payment) => payment.invoiceId !== invoiceId || payment.kind !== 'deposit'),
          depositRecord,
        ];

        applyInvoicePayments(invoice, nextPayments);
        return true;
      },
      recordInvoicePayment: ({ invoiceId, amount, method, date, notes, kind = 'payment', sourceId }: RecordInvoicePaymentInput) => {
        const invoice = allInvoices.find((item) => item.id === invoiceId);
        if (!invoice) {
          return { ok: false, error: 'This invoice could no longer be found.' };
        }

        if (invoice.deletedAt || invoice.status === 'Cancelled' || invoice.status === 'Declined' || invoice.status === 'Void') {
          return { ok: false, error: 'Payments cannot be recorded against a closed invoice.' };
        }

        const amountCents = toCents(amount);
        if (!Number.isFinite(amount) || amountCents <= 0) {
          return { ok: false, error: 'Enter a payment amount greater than zero.' };
        }

        const paymentId = sourceId?.trim() || createPaymentId();
        const existingPayment = allPayments.find((payment) => payment.id === paymentId);
        if (existingPayment) {
          const isSamePayment =
            existingPayment.invoiceId === invoiceId &&
            toCents(existingPayment.amount) === amountCents &&
            existingPayment.kind === kind;
          return isSamePayment
            ? { ok: true }
            : { ok: false, error: 'This payment action conflicts with an existing payment.' };
        }

        const invoicePayments = allPayments.filter((payment) => payment.invoiceId === invoiceId);
        const outstandingCents = toCents(invoice.amount) - sumPaymentsInCents(invoicePayments);

        if (amountCents > outstandingCents) {
          return { ok: false, error: 'The payment is more than the outstanding balance.' };
        }

        // Each payment stays its own transaction, so history is never overwritten.
        const nextPayments = [
          ...allPayments,
          {
            id: paymentId,
            invoiceId,
            amount: fromCents(amountCents),
            method: method.trim() || 'Cash',
            date: date.trim() || getLocalTodayKey(),
            notes: notes?.trim() || undefined,
            kind,
            recordedAt: new Date().toISOString(),
          } satisfies InvoicePayment,
        ];

        applyInvoicePayments(invoice, nextPayments);
        return { ok: true };
      },
      trashInvoice,
      restoreInvoice,
      deleteInvoicePermanently,
      addFinanceEntry: (entry: Omit<FinanceEntry, 'id'>) => {
        const entryId = `fin-${Date.now()}`;
        setFinanceEntries((current) => [
          {
            ...entry,
            id: entryId,
            sourceType: entry.sourceType ?? (entry.type === 'income' ? 'manual_income' : 'manual_expense'),
            sourceId: entry.sourceId ?? entryId,
          },
          ...current,
        ]);
      },
      addReminder: (reminder: Omit<Reminder, 'id'>) => {
        setReminders((current) => [
          {
            ...reminder,
            id: `rem-${Date.now()}`,
          },
          ...current,
        ]);
      },
      markReminderSent: (reminderId: string) => {
        setReminders((current) =>
          current.map((item) => (item.id === reminderId ? { ...item, status: 'sent' } : item)),
        );
      },
      markNotificationOpened: (notificationId: string) => {
        setNotifications((current) =>
          current.map((item) => (item.id === notificationId ? { ...item, isOpened: true } : item)),
        );
      },
      markAllNotificationsOpened: () => {
        setNotifications((current) => current.map((item) => ({ ...item, isOpened: true })));
      },
      deleteWorkspace: async () => {
        if (!supabase || !user) {
          throw new Error('Your Supabase workspace is not connected.');
        }

        canSaveRef.current = false;
        await saveQueueRef.current.catch(() => {});

        if (businessProfile.logoPath) {
          const { error: logoError } = await supabase.storage.from('business-logos').remove([businessProfile.logoPath]);
          if (logoError) {
            canSaveRef.current = true;
            throw logoError;
          }
        }

        const { error } = await supabase.from('bookflow_workspaces').delete().eq('user_id', user.id);
        if (error) {
          canSaveRef.current = true;
          throw error;
        }
      },
      /**
       * The backup reads `allInvoices`, `allPayments` and `allFinanceEntries` rather than the
       * filtered views: a workspace backup is a copy of the workspace, so an invoice sitting in
       * Dustbin — and the payments and ledger rows being held back with it — is copied intact and
       * comes back in the same state it left in.
       */
      readWorkspaceSnapshot: () => ({
        packages,
        customers,
        bookings,
        invoices: allInvoices,
        payments: allPayments,
        financeEntries: allFinanceEntries,
        reminders,
        businessProfile,
        currency,
        invoiceSettings,
      }),
      restoreWorkspaceBackup: (backup: BookflowBackup) => {
        const result = mergeWorkspaceBackup(
          {
            packages,
            customers,
            bookings,
            invoices: allInvoices,
            payments: allPayments,
            financeEntries: allFinanceEntries,
            reminders,
            businessProfile,
            currency,
            invoiceSettings,
          },
          backup,
        );
        const restored = result.snapshot;

        setPackages(restored.packages);
        setCustomers(restored.customers);
        bookingsRef.current = restored.bookings;
        setBookings(restored.bookings);
        setInvoices(restored.invoices);
        setPayments(restored.payments);
        setFinanceEntries(restored.financeEntries);
        setReminders(restored.reminders);
        setBusinessProfile(restored.businessProfile);
        setCurrency(restored.currency);
        setInvoiceSettings(restored.invoiceSettings);

        // Nothing is written to Supabase here. The save effect notices the changed snapshot and
        // upserts the whole document under the signed-in user's own id, so a restore lands in the
        // authenticated workspace and nowhere else, under the same RLS policy as every other write.
        return result;
      },
      deleteAllData: () => {
        setPackages([]);
        setCustomers([]);
        bookingsRef.current = [];
        setBookings([]);
        setInvoices([]);
        setPayments([]);
        setFinanceEntries([]);
        setReminders([]);
        setNotifications([]);
        setInvoiceDraft(null);
        setBusinessProfile({
          name: '',
          ssmRegistrationNo: '',
          nature: '',
          phone: '',
          email: '',
          address: '',
          logoUrl: undefined,
          logoPath: undefined,
        });
        setCurrency('MYR');
        setInvoiceSettings({ ...DEFAULT_INVOICE_SETTINGS });
      },
    }),
    [
      bookings,
      businessProfile,
      currency,
      customers,
      invoiceSettings,
      stampNewInvoice,
      activeFinanceEntries,
      allFinanceEntries,
      invoiceDraft,
      activeInvoices,
      allInvoices,
      trashedInvoices,
      trashInvoice,
      restoreInvoice,
      deleteInvoicePermanently,
      isLoading,
      isPro,
      loadError,
      notifications,
      packages,
      activePayments,
      allPayments,
      applyInvoicePayments,
      refreshInvoiceStatuses,
      removeBusinessLogo,
      reminders,
      syncError,
      supabase,
      uploadBusinessLogo,
      user,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error('useAppData must be used within AppDataProvider');
  }

  return context;
}
