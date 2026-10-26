import { createPublicBookingUrl, createPublicInvoiceUrl, readInvoiceTokenFromUrl } from '@/lib/public-invoice-url';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth, type AuthUser } from '@/context/auth-context';
import { useSubscription } from '@/context/subscription-context';
import { findBookingConflicts, findBookingTimeConflict, normalizeBookingTime, normalizeBufferMinutes } from '@/lib/booking-conflicts';
import { normalizeFulfilment, type BookingFulfilment } from '@/lib/booking-fulfilment';
import {
  buildBookingFromOffer,
  buildInvoiceFieldsFromBooking,
  buildOfferSnapshot,
  canReviseOffer,
  detailsFromSnapshot,
  getRespondedDetails,
  matchSubmissionCustomer,
  nextQuotationNumber,
  normalizeOffers,
  offerRecordIds,
  reviseOffer,
  type BookingOffer,
  type OfferDetails,
  type OfferKind,
  type OfferResponse,
  type OfferSnapshot,
  type OfferStatus,
} from '@/lib/booking-offers';
import {
  buildPricedLines,
  normalizeIncludedServices,
  normalizeSavedAddOns,
  resolveBookingMoney,
  type BookingCharge,
  type DepositType,
  type PricedLine,
  type SavedAddOn,
} from '@/lib/booking-pricing';
import { materialiseDueBookingNotifications } from '@/lib/booking-reminders';
import { syncBookingStatuses } from '@/lib/booking-status';
import { DEFAULT_LOCALE, getInvoiceDocumentLabels, isLocale, translate, type Locale, type TranslationKey } from '@/lib/i18n';
import { purgeLinkedBookings, reconcileLinkedBookings, removalTakesLinkedBooking, removeLinkedBooking, restoreLinkedBooking } from '@/lib/invoice-booking-link';
import {
  backfillInvoiceCustomerSnapshots,
  createInvoiceCustomerSnapshot,
  refreshInvoiceCustomerSnapshots,
  resolveInvoiceCustomer,
  type InvoiceCustomerSnapshot,
} from '@/lib/invoice-customer';
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
import { applyInvoiceEdit, syncLinkedBookingSchedule, type InvoiceEditInput } from '@/lib/invoice-edit';
import { getExpiredDustbinInvoiceIds, removalRequiresReason } from '@/lib/invoice-lifecycle';
import { DEFAULT_INVOICE_NUMBER_FORMAT, getInvoiceNumber, nextAvailableInvoiceNumber } from '@/lib/invoice-numbering';
import { fromCents, resolveInvoiceStatus, sumPaymentsInCents, toCents } from '@/lib/invoice-payments';
import { onNotificationReceived, presentOwnerNotification } from '@/lib/notifications';
import {
  canCreateBooking,
  canCreateCustomer,
  canCreateInvoice,
  getPlanUsage,
  type LimitCheck,
  type LimitKind,
  type PlanUsage,
} from '@/lib/plan-limits';
import { normalizeServiceDeposit, type ServiceDepositType } from '@/lib/service-defaults';
import {
  createClerkSupabaseClient,
  isSupabaseConfigured,
  type Json,
} from '@/lib/supabase';
import { materialiseWorkflowNotifications } from '@/lib/workflow-reminders';
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
  /** Free text ("8 hours"); parsed by parsePackageDurationMinutes where a length is needed. */
  duration: string;
  price: number;
  info: string;
  /**
   * Default deposit for bookings created from this service. Both fields are optional and always
   * move together — a service saved before deposits existed simply has neither, and keeps working.
   *
   * These only ever *prefill* a new booking. Editing them never touches a booking or invoice that
   * already exists.
   */
  defaultDepositType?: ServiceDepositType;
  defaultDepositValue?: number;
  /** Deliverables included in the package ("200 edited photos"). Copied onto each booking. */
  includedServices?: string[];
  /** Optional add-ons offered with this package, each with a default price and unit. */
  addOns?: SavedAddOn[];
  /** Default preparation/travel buffer in minutes for bookings of this package. */
  bufferMinutes?: number;
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
  /** Local calendar date when this client was added, used by period-based insights. */
  createdAt?: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  notes: string;
};

export type Booking = {
  id: string;
  /** Local calendar date when this booking was created, separate from its future event date. */
  createdAt?: string;
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
   * The deposit agreed for this job, copied from the service's default at creation and editable on
   * the form. It is what the customer *owes* up front — money actually received is still an
   * InvoicePayment with kind 'deposit', and the two must not be confused.
   *
   * Optional: bookings made before this existed, and jobs with no deposit, simply omit it.
   */
  depositAmount?: number;
  /**
   * How the deposit was agreed. `depositAmount` above stays the resolved figure (so older app
   * versions keep reading it); these record whether it was fixed or a percentage, and when it is due.
   */
  depositType?: DepositType;
  depositValue?: number;
  depositDueDate?: string;
  /**
   * The agreed package price before additional charges. Absent on bookings saved before charges
   * existed, where `price` itself is the package price. When present, `price` is the booking total.
   */
  basePrice?: number;
  /** The service the booking was made from. Informational: editing the service never reaches back. */
  packageId?: string;
  /** Additional customer charges (transport, extra hours…). Revenue, never expenses. */
  charges?: BookingCharge[];
  /** Deliverables copied from the package when the booking was made. */
  includedServices?: string[];
  /** Booking terms agreed for this job, when they were set on the booking itself. */
  terms?: string;
  /** Optional preparation/travel buffer in minutes, used by conflict warnings. */
  bufferMinutes?: number;
  /** Delivery tracking, separate from both the job status and payment state. */
  fulfilment?: BookingFulfilment;
  /** The booking form or quotation this booking came from. */
  sourceOfferId?: string;
  /**
   * The job's own lifecycle, deliberately separate from Invoice['status'] (invoice state) and from
   * the InvoicePayment records (payment state). Nothing about billing belongs in here.
   */
  status: 'Inquiry' | 'Confirmed' | 'Deposit Paid' | 'In Progress' | 'Completed' | 'Cancelled';
  notes: string;
};

export type Invoice = {
  id: string;
  bookingId: string;
  /**
   * The client this invoice was raised for. It stays as written even after that client is deleted,
   * because the record itself is never rewritten — `customerSnapshot` is what keeps the invoice
   * readable once the client record is gone, and nothing may assume this id still resolves.
   */
  customerId: string;
  /**
   * The client's details, stamped at creation and kept in step while that client exists, so a
   * deleted client is remembered as they last were. Absent on invoices raised before snapshots
   * existed whose client was already deleted by then; those fall back to "Deleted client".
   */
  customerSnapshot?: InvoiceCustomerSnapshot;
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
  /** The signed-in owner (user id) who moved it to Dustbin. Cleared on restore, like the reason. */
  deletedBy?: string | null;
  /** Set only when the invoice was voided rather than plainly deleted. Survives a restore. */
  voidedAt?: string | null;
  voidReason?: string | null;
  /**
   * The status the invoice held before it was cancelled into Dustbin, so a restore returns the exact
   * record rather than leaving behind a permanently unsendable invoice. A deliberate void ignores
   * this and stays Void.
   */
  statusBeforeTrash?: Invoice['status'] | null;
  /**
   * The priced lines frozen at creation: the package plus any additional charges. Absent on invoices
   * raised before charges existed, which render as the single service line they always had.
   */
  lineItems?: PricedLine[];
  /** Deposit due on this invoice when it was raised, and its optional due date. Not a payment. */
  depositDue?: number;
  depositDueDate?: string;
  /** The booking form or quotation this invoice came from. */
  sourceOfferId?: string;
  /**
   * The booking that deleting this invoice took out of the bookings list, kept here so restoring the
   * invoice puts it back. Only a plain Delete sets it (never Cancel or Void). Released app versions
   * preserve it untouched. See lib/invoice-booking-link.
   */
  removedBooking?: Booking | null;
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

/**
 * The event an invoice is being raised for. Supplying it makes the invoice reserve a real slot:
 * one linked booking is created, and the schedule is validated against every other booking first.
 */
export type InvoiceEventSchedule = {
  date: string;
  startTime: string;
  endTime: string;
  depositAmount?: number;
  notes?: string;
  /** Booking-side detail from the booking form: package price, charges and deposit terms. */
  basePrice?: number;
  charges?: BookingCharge[];
  depositType?: DepositType;
  depositValue?: number;
  depositDueDate?: string;
  bufferMinutes?: number;
  packageId?: string;
  terms?: string;
  /** The owner chose to keep an overlapping booking after seeing the warning. */
  allowConflict?: boolean;
};

export type AddInvoiceResult =
  | { ok: true; invoiceId: string; bookingId: string }
  /** `limit` is set when the Free plan's monthly allowance is what stopped it. */
  | { ok: false; error: string; limit?: LimitCheck };

export type UpdateInvoiceResult =
  /** `sharedLink` settles once the customer-facing copy, when there is one, has been refreshed. */
  | { ok: true; sharedLink: Promise<void> }
  | { ok: false; error: string };

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
  /** Optional, except when deleting an accepted invoice (see removalRequiresReason). */
  reason?: string;
};

export type InvoiceMutationResult = {
  ok: boolean;
  error?: string;
  /** What the operation did to the invoice's linked booking, when it has one. */
  linkedBooking?: 'removed' | 'kept_shared' | 'restored';
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
  /**
   * The owner saw the schedule conflict warning and chose to keep both bookings. Without it, an
   * overlapping booking is still refused exactly as before.
   */
  allowConflict?: boolean;
};

export type UpdateBookingResult = {
  ok: boolean;
  error?: string;
  /** Linked invoices left as they were because they had already been sent or paid. */
  unchangedInvoiceNumbers?: string[];
};

export type SaveQuotationInput = {
  /** Present when revising an existing quotation. */
  offerId?: string;
  customerId?: string;
  newCustomer?: Omit<Customer, 'id'>;
  details: OfferDetails;
  validUntil?: string;
};

export type SaveOfferResult = { ok: true; offerId: string } | { ok: false; error: string };

export type CreateBookingFormInput = {
  details: OfferDetails;
  customerId?: string;
  requireEmail?: boolean;
};

export type OfferLinkResult = { ok: true; url: string; offerId: string; expiresAt: string } | { ok: false; error: string };

export type ConvertOfferResult =
  | { ok: true; bookingId: string; invoiceId: string }
  | { ok: false; error: string; conflictTitle?: string; limit?: LimitCheck };

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
  /** Resolves only after the next workspace snapshot is acknowledged by Supabase. */
  confirmWorkspaceSave: () => Promise<void>;
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
  /** Interface language, persisted with the workspace exactly as the currency is. */
  language: Locale;
  updateLanguage: (locale: Locale) => void;
  invoiceSettings: InvoiceSettings;
  updateInvoiceSettings: (updates: Partial<InvoiceSettings>) => void;
  addPackage: (service: Omit<PackageOption, 'id'>) => void;
  updatePackage: (id: string, updates: Partial<PackageOption>) => void;
  removePackage: (id: string) => void;
  /** Free-plan usage for this workspace. Pro reads the same numbers against no limit. */
  planUsage: PlanUsage;
  /**
   * The one Free-plan gate. Screens call it to decide whether to open the paywall; the create
   * mutations call it again immediately before writing, so a stale screen or a double tap cannot
   * get past it.
   */
  checkPlanLimit: (kind: LimitKind) => LimitCheck;
  addCustomer: (customer: Omit<Customer, 'id'>) => Customer | null;
  updateCustomer: (id: string, updates: Partial<Omit<Customer, 'id'>>) => boolean;
  deleteCustomer: (id: string) => void;
  createBooking: (booking: CreateBookingInput) => CreateBookingResult | null;
  /** Updates only the job status. Every other field on the booking is left untouched. */
  updateBookingStatus: (bookingId: string, status: Booking['status']) => BookingMutationResult;
  /**
   * Saves an edited booking. Its id, creation date, job status, delivery tracking and origin are
   * kept; a linked invoice follows only while it is still an unsent, unpaid draft.
   */
  updateBooking: (bookingId: string, input: CreateBookingInput) => UpdateBookingResult;
  /** Sets or clears delivery tracking. Separate from job status and payments. */
  setBookingFulfilment: (bookingId: string, fulfilment: BookingFulfilment | null) => BookingMutationResult;
  /** Replaces only this booking's notes; every other field is kept exactly as stored. */
  setBookingNotes: (bookingId: string, notes: string) => BookingMutationResult;
  /** Quotations and booking forms, newest first. */
  offers: BookingOffer[];
  saveQuotation: (input: SaveQuotationInput) => SaveOfferResult;
  createBookingForm: (input: CreateBookingFormInput) => Promise<OfferLinkResult>;
  /**
   * Saves new details onto an existing booking form as its next version. Local only, like a
   * quotation revision: the customer sees it once the link is shared again.
   */
  reviseBookingForm: (offerId: string, details: OfferDetails) => InvoiceMutationResult;
  /** (Re)publishes an offer's current version and returns its private link. */
  shareOffer: (offerId: string) => Promise<OfferLinkResult>;
  revokeOffer: (offerId: string) => Promise<InvoiceMutationResult>;
  deleteOfferDraft: (offerId: string) => void;
  /**
   * Deletes a booking form: its link (and any customer page of the booking it became) stops working,
   * and that booking leaves the bookings list. Customers, invoices and payments are kept. Resolves
   * once the change is saved; safe to call again after a failure.
   */
  deleteBookingForm: (offerId: string) => Promise<InvoiceMutationResult>;
  /** Pulls customer responses and turns submitted booking forms into records, exactly once. */
  refreshOffers: () => Promise<void>;
  convertQuotation: (offerId: string, options?: { allowConflict?: boolean }) => ConvertOfferResult;
  createCustomerPageLink: (bookingId: string) => Promise<OfferLinkResult>;
  revokeCustomerPageLink: (bookingId: string) => Promise<InvoiceMutationResult>;
  /**
   * Creates an invoice and, when an event schedule is given and the invoice is not already linked
   * to a booking, the one booking that reserves that slot. Both land together or not at all.
   */
  addInvoice: (invoice: Omit<Invoice, 'id'>, schedule?: InvoiceEventSchedule) => AddInvoiceResult;
  createInvoiceShareLink: (invoiceId: string) => Promise<string>;
  /**
   * Saves an edit over the same invoice: id, number, status, acceptance and payments are kept, and
   * an existing shared link is refreshed in place (same token, same status).
   */
  updateInvoice: (invoiceId: string, input: InvoiceEditInput) => UpdateInvoiceResult;
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
  /**
   * Empties the in-app notification history. Nothing scheduled with the OS is touched: reminders
   * already handed to iOS still fire, and reminders still to come still appear here afterwards.
   */
  clearAllNotifications: () => void;
  /**
   * Stops workspace saves and waits for any in-flight save to finish, so nothing can write the
   * workspace back while the server deletes the account. `resumeWorkspaceSync` undoes it when the
   * deletion fails.
   */
  suspendWorkspaceSync: () => Promise<void>;
  resumeWorkspaceSync: () => void;
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
  /**
   * When the notification history was last emptied, as an ISO string. Absent on workspaces saved
   * before Clear all existed, which read as "never cleared".
   */
  notificationsClearedAt?: string;
  businessProfile: BusinessProfile;
  currency: CurrencyCode;
  /** Interface language. Absent on workspaces saved before it existed, which read as English. */
  language?: Locale;
  invoiceSettings: InvoiceSettings;
  /** Quotations and booking forms. Absent on workspaces saved before they existed. */
  offers?: BookingOffer[];
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

function getCreationDateFromId(id: string) {
  const timestamp = Number(id.match(/(?:^|-)(\d{13})(?:-|$)/)?.[1]);
  if (!Number.isFinite(timestamp)) return undefined;

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : getLocalTodayKey(date);
}

function normalizeCustomerCreationDates(customers: Customer[]) {
  return customers.map((customer) =>
    customer.createdAt ? customer : { ...customer, createdAt: getCreationDateFromId(customer.id) },
  );
}

function normalizeBookingCreationDates(bookings: Booking[]) {
  return bookings.map((booking) =>
    booking.createdAt ? booking : { ...booking, createdAt: getCreationDateFromId(booking.id) },
  );
}

/**
 * Workspaces saved before payments were individual records only kept a single running total on the
 * invoice. Turn that total into one payment record so no money disappears from the ledger.
 */
/**
 * Turns a Supabase Storage failure into something the user can act on. Setup problems (such as a
 * missing bucket) are logged for developers only; the person saving just sees that it failed.
 */
function describeStorageError(error: { message?: string }) {
  const message = error?.message ?? '';

  if (/bucket not found/i.test(message)) {
    if (__DEV__) console.warn('[logo] the business-logos storage bucket is missing; apply the storage migration');
    return new Error('The logo could not be saved. Please try again.');
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

  if (__DEV__ && message) console.warn('[logo] storage error', message);
  return new Error('The logo could not be saved. Check your connection and try again.');
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
    language: DEFAULT_LOCALE,
    invoiceSettings: { ...DEFAULT_INVOICE_SETTINGS },
    offers: [],
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
  const parsedCustomers = normalizeCustomerCreationDates(
    Array.isArray(data.customers) ? (data.customers as Customer[]) : fallback.customers,
  );
  // Invoices raised before client snapshots existed get one from the client they still point at, so
  // deleting that client later leaves the invoice fully readable. An invoice whose client is already
  // gone keeps no snapshot: nothing is invented for it, and the UI names it "Deleted client".
  const parsedInvoices = backfillInvoiceCustomerSnapshots(
    Array.isArray(data.invoices) ? (data.invoices as Invoice[]) : fallback.invoices,
    parsedCustomers,
  );
  const parsedBookings = normalizeBookingCreationDates(
    Array.isArray(data.bookings) ? (data.bookings as Booking[]) : fallback.bookings,
  ).map((booking) => {
    // Delivery tracking is read tolerantly; a malformed value is dropped rather than shown.
    if (booking.fulfilment === undefined) return booking;
    const fulfilment = normalizeFulfilment(booking.fulfilment);
    if (fulfilment) return { ...booking, fulfilment };
    const { fulfilment: _dropped, ...rest } = booking;
    return rest;
  });
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
    bookings: parsedBookings,
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
    notificationsClearedAt:
      typeof data.notificationsClearedAt === 'string' ? data.notificationsClearedAt : fallback.notificationsClearedAt,
    businessProfile: normalizeBusinessProfile(profile, fallback.businessProfile),
    currency: currency === 'MYR' || currency === 'IDR' || currency === 'USD' ? currency : fallback.currency,
    language: isLocale(data.language) ? data.language : fallback.language,
    invoiceSettings: normalizeInvoiceSettings(savedSettings, parsedInvoices),
    offers: normalizeOffers(data.offers),
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

  // A booking an expired invoice's deletion removed goes with it, unless another invoice still
  // references it — then it is put back (active invoice) or handed over (Dustbin invoice).
  const linked = purgeLinkedBookings(expiredIds, workspace.invoices, workspace.bookings);
  const remainingInvoices = workspace.invoices
    .filter((invoice) => !expiredIds.has(invoice.id))
    .map((invoice) => (linked.handOver.has(invoice.id) ? { ...invoice, removedBooking: linked.handOver.get(invoice.id) } : invoice));
  return {
    workspace: {
      ...workspace,
      invoices: remainingInvoices,
      bookings: linked.bookings,
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

function needsInsightsDateMigration(value: Json) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;

  return [data.customers, data.bookings].some(
    (records) =>
      Array.isArray(records) &&
      records.some((value) => {
        if (!value || Array.isArray(value) || typeof value !== 'object') return false;
        const record = value as { id?: unknown; createdAt?: unknown };
        return (
          typeof record.id === 'string' &&
          typeof record.createdAt !== 'string' &&
          Boolean(getCreationDateFromId(record.id))
        );
      }),
  );
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

/**
 * A service's optional extras, stored only when present so services saved before they existed — and
 * older app versions reading them — see exactly the record they always did.
 */
function normalizePackageExtras(service: Pick<PackageOption, 'includedServices' | 'addOns' | 'bufferMinutes'>) {
  const includedServices = normalizeIncludedServices(service.includedServices);
  const addOns = normalizeSavedAddOns(service.addOns);
  const bufferMinutes = normalizeBufferMinutes(service.bufferMinutes);
  return {
    ...(includedServices.length ? { includedServices } : { includedServices: undefined }),
    ...(addOns.length ? { addOns } : { addOns: undefined }),
    ...(bufferMinutes ? { bufferMinutes } : { bufferMinutes: undefined }),
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
  const [notificationsClearedAt, setNotificationsClearedAt] = useState<string | undefined>(undefined);
  const [offers, setOffers] = useState<BookingOffer[]>([]);
  const offersRef = useRef<BookingOffer[]>([]);
  offersRef.current = offers;
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
  const [language, setLanguage] = useState<Locale>(DEFAULT_LOCALE);
  // Error messages thrown to screens are written in the person's language. Read through a ref so the
  // callbacks that throw them keep their existing dependencies.
  const languageRef = useRef(language);
  languageRef.current = language;
  const userMessage = useCallback((key: TranslationKey) => translate(languageRef.current, key), []);
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
  const [confirmationRevision, setConfirmationRevision] = useState(0);
  const requestedRevisionRef = useRef(0);
  const saveWaitersRef = useRef<{ revision: number; resolve: () => void; reject: (error: Error) => void }[]>([]);
  const confirmWorkspaceSave = useCallback(() => new Promise<void>((resolve, reject) => {
    if (!canSaveRef.current || !supabase || !user) {
      reject(new Error(userMessage('app.error.connection')));
      return;
    }
    const revision = ++requestedRevisionRef.current;
    saveWaitersRef.current.push({ revision, resolve, reject });
    setConfirmationRevision(revision);
  }), [supabase, user, userMessage]);
  const bookingsRef = useRef<Booking[]>([]);
  // Invoices whose public link is mid-write. The status poll must not read the old remote value
  // back over the local one while a trash, restore or void is still landing.
  const linkSyncingRef = useRef<Set<string>>(new Set());

  const customersRef = useRef<Customer[]>([]);
  const invoicesRef = useRef<Invoice[]>([]);
  const paymentsRef = useRef<InvoicePayment[]>([]);
  paymentsRef.current = allPayments;

  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  // The complete record, Dustbin included: a trashed invoice still counts against the month it was
  // created in, so trashing one cannot buy another.
  useEffect(() => {
    invoicesRef.current = allInvoices;
  }, [allInvoices]);

  /**
   * The one Free-plan gate, reading the live records rather than a render's snapshot. Pro is taken
   * from the RevenueCat entitlement through the subscription context, never from screen state.
   */
  const checkPlanLimit = useCallback(
    (kind: LimitKind): LimitCheck => {
      if (kind === 'customers') return canCreateCustomer(isPro, customersRef.current);
      if (kind === 'bookings') return canCreateBooking(isPro, bookingsRef.current);
      return canCreateInvoice(isPro, invoicesRef.current);
    },
    [isPro],
  );

  /**
   * The one place invoice acceptance reaches a booking's own status. Payments never do: they are
   * not an input, so no payment path can move job progress.
   *
   * Both screens already render `bookings` straight from here, so reconciling the workspace itself
   * — rather than deriving a status per screen — is what keeps the dashboard, the schedule and the
   * Job Status sheet from ever disagreeing. The write lands in the same `bookings` state the normal
   * save queue persists, so it reaches Supabase through the existing upsert with no new call.
   *
   * `syncBookingStatuses` returns the array it was given when nothing moved, so a workspace that is
   * already consistent re-renders nothing and queues no save. It is forward-only, which is why
   * running it on every load can normalise historic records without ever undoing a manual status.
   */
  useEffect(() => {
    setBookings((current) => syncBookingStatuses(current, allInvoices));
  }, [allInvoices, bookings]);

  /**
   * Turns booking reminders that have come due into the in-app records the bell and the
   * notification centre read. The OS notification is scheduled from the same rules under the same
   * identifier, so both describe one event, and an id that already exists is never written again.
   *
   * Re-run whenever the bookings change, whenever BookFlow returns to the foreground, and the
   * moment a notification is delivered while it is open — none of which is the source of truth:
   * they only decide when to look at the clock. What is stored persists through the normal save.
   */
  useEffect(() => {
    const materialise = () => {
      const clearedAt = notificationsClearedAt ? new Date(notificationsClearedAt).getTime() : null;
      setNotifications((current) =>
        materialiseWorkflowNotifications(
          bookingsRef.current,
          invoicesRef.current,
          paymentsRef.current,
          materialiseDueBookingNotifications(bookingsRef.current, current, Date.now(), clearedAt),
          getLocalTodayKey(),
          clearedAt,
        ),
      );
    };

    materialise();
    const appState = AppState.addEventListener('change', (status) => {
      if (status === 'active') materialise();
    });
    const received = onNotificationReceived(materialise);

    return () => {
      appState.remove();
      received.remove();
    };
  }, [bookings, notificationsClearedAt]);

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
      if (__DEV__) {
        console.warn(
          '[workspace] Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart Expo.',
        );
      }
      setLoadError(translate(languageRef.current, 'app.loadFailed.body'));
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
      // Repairs what an older app version could leave behind: an invoice it restored without putting
      // back the booking that deleting it had removed.
      const reconciled = reconcileLinkedBookings(swept.workspace.invoices, swept.workspace.bookings);
      const bookingLinksRepaired = reconciled.invoices !== swept.workspace.invoices || reconciled.bookings !== swept.workspace.bookings;
      const workspace = bookingLinksRepaired
        ? { ...swept.workspace, invoices: reconciled.invoices, bookings: reconciled.bookings }
        : swept.workspace;
      const shouldPersistFinanceMigration = Boolean(row && needsFinanceSourceMigration(row.data));
      const shouldPersistInsightsMigration = Boolean(row && needsInsightsDateMigration(row.data));

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
      setNotificationsClearedAt(workspace.notificationsClearedAt);
      setBusinessProfile(workspace.businessProfile);
      setCurrency(workspace.currency);
      setLanguage(workspace.language ?? DEFAULT_LOCALE);
      setInvoiceSettings(workspace.invoiceSettings);
      offersRef.current = workspace.offers ?? [];
      setOffers(workspace.offers ?? []);
      setInvoiceDraft(null);
      // Let the normal save queue persist source metadata, legacy payment reconciliation and any
      // dustbin sweep once. Blanking the snapshot is what makes the save effect see a change.
      lastQueuedSnapshotRef.current =
        shouldPersistFinanceMigration || shouldPersistInsightsMigration || swept.expiredIds.size > 0 || bookingLinksRepaired
          ? ''
          : JSON.stringify(workspace);
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
      if (__DEV__) console.warn('[workspace] load failed', error);
      const message = translate(languageRef.current, 'app.loadFailed.body');
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
      saveWaitersRef.current.splice(0).forEach(({ reject }) => reject(new Error('Workspace connection changed.')));
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
      notificationsClearedAt,
      businessProfile,
      currency,
      language,
      offers,
    };
    const serialized = JSON.stringify(workspace);

    // A pending effect from an older render must not acknowledge a newer mutation.
    // Only attach requests whose revision was committed with this workspace snapshot.
    const waiters = saveWaitersRef.current.filter((waiter) => waiter.revision <= confirmationRevision);
    if (serialized === lastQueuedSnapshotRef.current && waiters.length === 0) return;
    saveWaitersRef.current = saveWaitersRef.current.filter((waiter) => waiter.revision > confirmationRevision);
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

          if (error) throw new Error(error.message);
          if (!canSaveRef.current || loadedUserIdRef.current !== user.id) {
            throw new Error('Workspace connection changed.');
          }
          setSyncError(null);
          waiters.forEach(({ resolve }) => resolve());
        } catch (error) {
          if (__DEV__) console.warn('[workspace] save failed', error);
          // Screens show this to the person saving, so it never carries the backend's own message.
          const failure = new Error(translate(languageRef.current, 'app.error.save'));
          setSyncError(failure.message);
          waiters.forEach(({ reject }) => reject(failure));
        }
      });
  }, [allFinanceEntries, allInvoices, allPayments, bookings, businessProfile, confirmationRevision, currency, customers, invoiceSettings, language, notifications, notificationsClearedAt, offers, packages, reminders, supabase, syncRetryKey, user]);

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

  /** A snapshot of the business details and invoice settings in force right now. */
  const snapshotCurrentInvoiceSettings = useCallback((): InvoiceSnapshot => {
    // The design is frozen alongside the business details, and gated at the moment of stamping: a
    // workspace that is not Pro records the Standard template whatever is selected, so a lapsed
    // subscription can never leave premium branding on newly issued invoices.
    const design: InvoiceDesign = {
      ...invoiceSettings.design,
      templateId: resolveTemplateForEntitlement(invoiceSettings.design.templateId, isPro),
      accentColor: isPro ? invoiceSettings.design.accentColor : DEFAULT_INVOICE_DESIGN.accentColor,
      thankYouMessage: isPro ? invoiceSettings.design.thankYouMessage : '',
      visibility: isPro
        ? { ...invoiceSettings.design.visibility }
        : { ...DEFAULT_INVOICE_DESIGN.visibility },
    };

    return {
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
  }, [businessProfile, invoiceSettings, isPro]);

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

      const snapshot = snapshotCurrentInvoiceSettings();

      // The counter only moves forward, so a deleted invoice can never free its number for reuse.
      setInvoiceSettings((current) => ({
        ...current,
        nextInvoiceSequence: Math.max(current.nextInvoiceSequence, sequence + 1),
      }));

      return { invoiceNumber, snapshot };
    },
    [invoiceSettings, isPro, snapshotCurrentInvoiceSettings],
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

  /**
   * The frozen customer-facing copy of an invoice, as its public link stores it. Shared by sending an
   * invoice and by editing one, so an edited invoice reads exactly as a freshly sent one would.
   */
  const buildPublicInvoicePayload = useCallback(
    (
      invoice: Invoice,
      client: ReturnType<typeof resolveInvoiceCustomer>,
      publicStatus: 'Sent' | 'Accepted' | 'Declined' | 'Paid' | 'Cancelled' | 'Void',
      locale: Locale,
    ) => {
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
        // Resolved at share time: the document keeps the wording it was sent with, even if the
        // owner later switches the app to another language.
        labels: getInvoiceDocumentLabels(locale),
        invoice: { ...invoice, status: publicStatus },
        client,
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

      return {
        render,
        // Travels with the link so the customer's page reads in the language it was sent in.
        locale,
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
          name: client.name,
          email: client.email,
          phone: client.phone,
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
    },
    [allPayments, bookings, businessProfile, currency, invoiceSettings, isPro, packages],
  );

  /**
   * Rewrites an edited invoice's shared copy in place. Only the payload changes: the token, the
   * link's status (and with it the customer's acceptance) and its expiry stay exactly as they were,
   * and the copy keeps the language it was sent in. An invoice that was never shared has no link.
   */
  const refreshPublicInvoicePayload = useCallback(
    async (invoice: Invoice, client: ReturnType<typeof resolveInvoiceCustomer>) => {
      if (!supabase || !user) return;

      const { data, error } = await supabase
        .from('public_invoice_links')
        .select('status,payload')
        .eq('user_id', user.id)
        .eq('invoice_id', invoice.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;

      const stored = data.payload && typeof data.payload === 'object' && !Array.isArray(data.payload)
        ? (data.payload as Record<string, unknown>)
        : null;
      const locale = isLocale(stored?.locale) ? stored.locale : language;
      const payload = buildPublicInvoicePayload(invoice, client, data.status as Parameters<typeof buildPublicInvoicePayload>[2], locale);

      const { error: updateError } = await supabase
        .from('public_invoice_links')
        .update({ payload: payload as unknown as Json, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('invoice_id', invoice.id);
      if (updateError) throw updateError;
    },
    [buildPublicInvoicePayload, language, supabase, user],
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
      // Checked here as well as in the sheet, so no caller can delete an accepted invoice unexplained.
      if (removalRequiresReason(invoice, mode) && !trimmedReason) {
        return { ok: false, error: translate(languageRef.current, 'invoice.delete.reasonRequired') };
      }
      const isVoid = mode === 'void';
      const nextStatus: Invoice['status'] =
        isVoid ? 'Void' : mode === 'cancel' ? 'Cancelled' : invoice.status;

      // Only a plain Delete takes the invoice's booking with it (found through its stored
      // bookingId, and kept unless another active invoice still uses it). Cancel and Void leave the
      // booking exactly as they always have.
      const linked = removalTakesLinkedBooking(mode)
        ? removeLinkedBooking(invoice, allInvoices, bookingsRef.current)
        : { impact: { kind: 'none' as const }, bookings: bookingsRef.current, removedBooking: null };

      const trash = (current: Invoice[]) =>
        current.map((item) =>
          item.id === invoiceId
            ? {
                ...item,
                status: nextStatus,
                statusBeforeTrash: nextStatus === item.status ? null : item.status,
                deletedAt: now,
                deletionReason: trimmedReason,
                deletedBy: user?.id ?? null,
                ...(isVoid ? { voidedAt: item.voidedAt ?? now, voidReason: trimmedReason } : null),
                // Kept on the invoice so it travels through the Dustbin and comes back on restore.
                ...(linked.removedBooking ? { removedBooking: linked.removedBooking } : null),
              }
            : item,
        );
      // Kept in step like bookingsRef, so a rollback that runs before the next render still finds
      // the trashed invoice and the booking it holds.
      invoicesRef.current = trash(invoicesRef.current);
      setInvoices(trash);
      // Same tick as the invoice change, so both land in the same workspace save.
      if (linked.bookings !== bookingsRef.current) {
        bookingsRef.current = linked.bookings;
        setBookings(linked.bookings);
      }
      const linkedBooking = linked.impact.kind === 'remove' ? 'removed' as const : linked.impact.kind === 'keep_shared' ? 'kept_shared' as const : undefined;

      try {
        await setPublicInvoiceLinkStatus(invoiceId, isVoid ? 'Void' : 'Cancelled');
        return { ok: true, linkedBooking };
      } catch {
        return {
          ok: true,
          linkedBooking,
          error: 'The invoice was moved to the Dustbin, but its shared link could not be closed. Try again from the Dustbin.',
        };
      }
    },
    [allInvoices, setPublicInvoiceLinkStatus, user?.id],
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
      // Read live: a failed Delete's rollback and the Undo snackbar call this through a closure taken
      // before the invoice was trashed, whose render-time list would still show it as active.
      const currentInvoices = invoicesRef.current;
      const invoice = currentInvoices.find((item) => item.id === invoiceId);
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
        deletedBy: null,
      };
      // Puts back the booking that deleting this invoice (or another invoice of the same booking)
      // took out; nothing else is ever revived.
      const linked = restoreLinkedBooking(invoice, currentInvoices, bookingsRef.current);
      const clear = new Set(linked.clearOn);
      const untrash = (current: Invoice[]) =>
        current.map((item) =>
          item.id === invoiceId
            ? { ...restored, ...(clear.has(item.id) ? { removedBooking: null } : null) }
            : clear.has(item.id) ? { ...item, removedBooking: null } : item,
        );
      invoicesRef.current = untrash(invoicesRef.current);
      setInvoices(untrash);
      if (linked.bookings !== bookingsRef.current) {
        bookingsRef.current = linked.bookings;
        setBookings(linked.bookings);
      }
      const linkedBooking = linked.restored ? 'restored' as const : undefined;

      try {
        await setPublicInvoiceLinkStatus(invoiceId, getPublicLinkStatus(restored));
        return { ok: true, linkedBooking };
      } catch {
        return {
          ok: true,
          linkedBooking,
          error: 'The invoice was restored, but its shared link could not be reopened. Send it again to refresh the link.',
        };
      }
    },
    [allPayments, getPublicLinkStatus, setPublicInvoiceLinkStatus],
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

      // A booking this invoice's deletion removed goes for good with it — unless another invoice
      // still references it, in which case it is put back or handed to that invoice.
      const linked = purgeLinkedBookings([invoiceId], allInvoices, bookingsRef.current);
      setInvoices((current) =>
        current
          .filter((item) => item.id !== invoiceId)
          .map((item) => (linked.handOver.has(item.id) ? { ...item, removedBooking: linked.handOver.get(item.id) } : item)),
      );
      setPayments((current) => current.filter((payment) => payment.invoiceId !== invoiceId));
      setFinanceEntries((current) => current.filter((entry) => entry.invoiceId !== invoiceId));
      if (linked.bookings !== bookingsRef.current) {
        bookingsRef.current = linked.bookings;
        setBookings(linked.bookings);
      }
      return { ok: true };
    },
    [allInvoices, supabase, user],
  );

  const uploadBusinessLogo = useCallback(
    async (image: BusinessLogoUpload) => {
      if (!isPro) {
        throw new Error('BookFlow Pro is required to upload a business logo.');
      }
      if (!supabase || !user) {
        throw new Error(userMessage('app.error.connection'));
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
    [isPro, supabase, user, userMessage],
  );

  const removeBusinessLogo = useCallback(async () => {
    if (!supabase || !user) {
      throw new Error(userMessage('app.error.connection'));
    }

    const logoPath = businessProfile.logoPath ?? `${user.id}/business-logo`;
    const { error } = await supabase.storage.from('business-logos').remove([logoPath]);
    if (error) throw describeStorageError(error);
  }, [businessProfile.logoPath, supabase, user, userMessage]);

  // ---------------------------------------------------------------------------------------------
  // Booking forms, quotations and customer booking pages
  //
  // The workspace keeps the owner's record of each offer; the shared link and every customer
  // response live in `public_booking_offers` (see supabase/migrations/20261016000000_booking_offers.sql).
  // A submitted form becomes a customer, booking and invoice here, in the owner's app, under ids
  // derived from the offer — so however many times this runs, there is only ever one of each.
  // ---------------------------------------------------------------------------------------------

  /** The latest context value, for async work that resumes after a save has re-rendered it. */
  const valueRef = useRef<AppDataContextValue | null>(null);
  const stampRef = useRef(stampNewInvoice);
  stampRef.current = stampNewInvoice;
  const refreshOffersRef = useRef<Promise<void> | null>(null);
  // Booking forms deleted in this session. A sync that is already running, or that read the link
  // just before it was deleted, must never turn one of them into records.
  const deletedOfferIdsRef = useRef<Set<string>>(new Set());

  const ownerTimeZone = useCallback(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  const buildSnapshotFor = useCallback(
    (kind: OfferKind, version: number, details: OfferDetails, extra: { validUntil?: string; requireEmail?: boolean; customerName?: string }) =>
      buildOfferSnapshot({
        kind,
        version,
        details,
        currency,
        locale: language,
        timeZone: ownerTimeZone(),
        business: {
          name: businessProfile.name,
          phone: businessProfile.phone,
          email: businessProfile.email,
          // The logo is a Pro feature everywhere else, so it is here too.
          logoUrl: isPro ? businessProfile.logoUrl ?? null : null,
        },
        ...extra,
      }),
    [businessProfile, currency, isPro, language, ownerTimeZone],
  );

  /** How long a link stays open: a form two weeks, a quotation until it lapses, a booking page past the event. */
  const linkExpiry = useCallback((kind: OfferKind, details: { date: string }, validUntil?: string) => {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const cap = now + 119 * day;
    if (kind === 'booking_form') return new Date(Math.min(cap, now + 14 * day)).toISOString();
    if (kind === 'quotation') {
      const until = validUntil ? new Date(`${validUntil}T23:59:59`).getTime() : now + 30 * day;
      return new Date(Math.min(cap, Math.max(now + day, Number.isFinite(until) ? until : now + 30 * day))).toISOString();
    }
    const event = new Date(`${details.date}T00:00:00`).getTime();
    return new Date(Math.min(cap, Math.max(now + 30 * day, Number.isFinite(event) ? event + 60 * day : now + 30 * day))).toISOString();
  }, []);

  /**
   * Says why a customer link could not be written, instead of calling every failure a connection
   * problem. Only the error code and message are logged in development — never the offer, its
   * token or any customer details.
   */
  const offerError = useCallback((error: unknown) => {
    const failure = error && typeof error === 'object' ? (error as { code?: unknown; message?: unknown; status?: unknown }) : {};
    const code = typeof failure.code === 'string' ? failure.code : '';
    const message = typeof failure.message === 'string' ? failure.message : error instanceof Error ? error.message : '';
    if (__DEV__) console.warn('[booking-offers] request failed', code || 'no code', message);
    const key: TranslationKey =
      // The table (or its migration) is not on the server yet.
      code === 'PGRST205' || code === '42P01' || /could not find the table/i.test(message) ? 'offer.error.notSetUp'
        // The signed-in session was refused by the database.
        : code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303' || /jwt|token is expired/i.test(message) ? 'offer.error.session'
          : code === '42501' ? 'offer.error.denied'
            // The workspace row the link belongs to has not reached the server yet.
            : code === '23503' ? 'offer.error.workspace'
              : code === '22023' || code === '23514' ? 'offer.error.invalid'
                : /network request failed|failed to fetch|network|timed? ?out/i.test(message) || error instanceof TypeError ? 'bm.sendForm.failed'
                  : 'offer.error.generic';
    return translate(languageRef.current, key);
  }, []);

  /**
   * Writes the customer, booking and invoice an offer becomes, using deterministic ids. Returns null
   * when the booking already exists — the records are never written twice.
   */
  const createRecordsFromOffer = useCallback(
    (input: { offerId: string; details: OfferDetails; customer: Customer; isNewCustomer: boolean; response?: OfferResponse; noteLabel: string }) => {
      const ids = offerRecordIds(input.offerId);
      if (bookingsRef.current.some((item) => item.id === ids.bookingId)) return null;

      const today = getLocalTodayKey();
      const booking = buildBookingFromOffer({
        offerId: input.offerId,
        details: input.details,
        customerId: input.customer.id,
        response: input.response,
        createdAt: today,
        noteLabel: input.noteLabel,
      });
      const existingInvoice = invoicesRef.current.find((item) => item.id === ids.invoiceId);
      let invoice: Invoice | null = null;
      if (!existingInvoice) {
        const stamp = stampRef.current(invoicesRef.current);
        invoice = {
          id: ids.invoiceId,
          bookingId: booking.id,
          customerId: input.customer.id,
          customerSnapshot: createInvoiceCustomerSnapshot(input.customer),
          invoiceNumber: stamp.invoiceNumber,
          snapshot: stamp.snapshot,
          ...buildInvoiceFieldsFromBooking(booking, input.details, getInvoiceDueDate(booking.date), today),
        };
      }

      if (input.isNewCustomer && !customersRef.current.some((item) => item.id === input.customer.id)) {
        customersRef.current = [...customersRef.current, input.customer];
        setCustomers((current) => (current.some((item) => item.id === input.customer.id) ? current : [...current, input.customer]));
      }
      const nextBookings = [booking, ...bookingsRef.current];
      bookingsRef.current = nextBookings;
      setBookings(nextBookings);
      if (invoice) {
        const created = invoice;
        invoicesRef.current = [created, ...invoicesRef.current];
        setInvoices((current) => (current.some((item) => item.id === created.id) ? current : [created, ...current]));
      }
      return { booking, invoiceId: ids.invoiceId };
    },
    [],
  );

  /** Publishes an offer's link row and returns its token. */
  const publishOfferRow = useCallback(
    async (row: {
      offerId: string;
      kind: OfferKind;
      version: number;
      snapshot: OfferSnapshot;
      status: 'sent' | 'converted';
      customerId?: string;
      expiresAt: string;
      bookingId?: string;
      invoiceId?: string;
      invoiceToken?: string | null;
    }) => {
      if (!supabase || !user) throw new Error(translate(languageRef.current, 'app.error.connection'));
      const { data, error } = await supabase
        .from('public_booking_offers')
        .upsert(
          {
            user_id: user.id,
            offer_id: row.offerId,
            kind: row.kind,
            version: row.version,
            offer: row.snapshot as unknown as Json,
            status: row.status,
            customer_id: row.customerId ?? null,
            owner_plan: isPro ? 'pro' : 'free',
            expires_at: row.expiresAt,
            updated_at: new Date().toISOString(),
            ...(row.bookingId ? { booking_id: row.bookingId } : {}),
            ...(row.invoiceId ? { invoice_id: row.invoiceId } : {}),
            ...(row.invoiceToken ? { invoice_token: row.invoiceToken } : {}),
          },
          { onConflict: 'user_id,offer_id' },
        )
        .select('token, expires_at')
        .single();
      if (error || !data) throw error ?? new Error('No link returned');
      return data;
    },
    [isPro, supabase, user],
  );

  const createBookingForm = useCallback(
    async (input: CreateBookingFormInput): Promise<OfferLinkResult> => {
      const now = new Date();
      const offerId = `ofr-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`;
      const customer = input.customerId ? customersRef.current.find((item) => item.id === input.customerId) : undefined;
      const expiresAt = linkExpiry('booking_form', input.details);
      try {
        const snapshot = buildSnapshotFor('booking_form', 1, input.details, { requireEmail: input.requireEmail });
        const row = await publishOfferRow({ offerId, kind: 'booking_form', version: 1, snapshot, status: 'sent', customerId: customer?.id, expiresAt });
        const offer: BookingOffer = {
          id: offerId,
          kind: 'booking_form',
          createdAt: getLocalTodayKey(now),
          ...(customer ? { customerId: customer.id } : {}),
          status: 'sent',
          version: 1,
          details: input.details,
          requireEmail: Boolean(input.requireEmail),
          sharedAt: now.toISOString(),
          sharedVersion: 1,
          linkExpiresAt: row.expires_at,
        };
        offersRef.current = [offer, ...offersRef.current];
        setOffers((current) => [offer, ...current]);
        return { ok: true, url: createPublicBookingUrl(row.token), offerId, expiresAt: row.expires_at };
      } catch (error) {
        return { ok: false, error: offerError(error) };
      }
    },
    [buildSnapshotFor, linkExpiry, offerError, publishOfferRow],
  );

  const reviseBookingForm = useCallback((offerId: string, details: OfferDetails): InvoiceMutationResult => {
    const existing = offersRef.current.find((item) => item.id === offerId);
    if (!existing || existing.kind !== 'booking_form') return { ok: false, error: translate(languageRef.current, 'bm.formEdit.missing') };
    if (!canReviseOffer(existing)) {
      return { ok: false, error: translate(languageRef.current, 'of.lockedNote', { version: existing.respondedVersion ?? existing.version }) };
    }
    // The same form, one version on — its status (and any change request) is untouched until it is
    // shared again, so nothing about the request is resolved by saving.
    const revised = reviseOffer(existing, details, new Date().toISOString());
    offersRef.current = offersRef.current.map((item) => (item.id === offerId ? revised : item));
    setOffers(offersRef.current);
    return { ok: true };
  }, []);

  const saveQuotation = useCallback(
    (input: SaveQuotationInput): SaveOfferResult => {
      let customer = input.customerId ? customersRef.current.find((item) => item.id === input.customerId) ?? null : null;
      if (!customer && input.newCustomer?.name.trim()) {
        if (!checkPlanLimit('customers').allowed) return { ok: false, error: 'limit' };
        const createdAt = Date.now();
        customer = {
          ...input.newCustomer,
          id: `cust-${createdAt}`,
          createdAt: getLocalTodayKey(new Date(createdAt)),
          name: input.newCustomer.name.trim(),
          email: input.newCustomer.email.trim(),
          phone: input.newCustomer.phone.trim(),
          location: input.newCustomer.location.trim(),
          notes: input.newCustomer.notes.trim(),
        };
        const created = customer;
        customersRef.current = [...customersRef.current, created];
        setCustomers((current) => [...current, created]);
      }
      if (!customer) return { ok: false, error: translate(languageRef.current, 'bm.quote.customerRequired') };

      if (input.offerId) {
        const existing = offersRef.current.find((item) => item.id === input.offerId);
        if (!existing) return { ok: false, error: 'This quotation could no longer be found.' };
        if (!canReviseOffer(existing)) {
          return { ok: false, error: translate(languageRef.current, 'of.lockedNote', { version: existing.respondedVersion ?? existing.version }) };
        }
        const revised: BookingOffer = {
          ...reviseOffer(existing, input.details, new Date().toISOString()),
          customerId: customer.id,
          ...(input.validUntil ? { validUntil: input.validUntil } : {}),
        };
        offersRef.current = offersRef.current.map((item) => (item.id === revised.id ? revised : item));
        setOffers(offersRef.current);
        return { ok: true, offerId: revised.id };
      }

      const now = new Date();
      const offer: BookingOffer = {
        id: `ofr-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: 'quotation',
        number: nextQuotationNumber(offersRef.current),
        createdAt: getLocalTodayKey(now),
        customerId: customer.id,
        status: 'draft',
        version: 1,
        details: input.details,
        ...(input.validUntil ? { validUntil: input.validUntil } : {}),
      };
      offersRef.current = [offer, ...offersRef.current];
      setOffers(offersRef.current);
      return { ok: true, offerId: offer.id };
    },
    [checkPlanLimit],
  );

  const shareOffer = useCallback(
    async (offerId: string): Promise<OfferLinkResult> => {
      const offer = offersRef.current.find((item) => item.id === offerId);
      if (!offer || !supabase || !user) return { ok: false, error: translate(languageRef.current, 'app.error.connection') };
      try {
        // Once the customer has responded, the link is re-shared exactly as it stands.
        if (offer.status === 'submitted' || offer.status === 'accepted' || offer.status === 'converted') {
          const { data, error } = await supabase
            .from('public_booking_offers')
            .select('token, expires_at')
            .eq('user_id', user.id)
            .eq('offer_id', offerId)
            .maybeSingle();
          if (error || !data) throw error ?? new Error('Link not found');
          return { ok: true, url: createPublicBookingUrl(data.token), offerId, expiresAt: data.expires_at };
        }
        // Publishing marks the link `sent`, which would wipe a change request the customer is waiting
        // on. While the version they asked about is still the one on their link (nothing has been
        // edited since), the link is handed out again exactly as it stands. Checked against the
        // server, because this copy may not have heard about the request yet.
        if (offer.sharedAt && (offer.status === 'sent' || offer.status === 'change_requested')) {
          const { data: current, error: currentError } = await supabase
            .from('public_booking_offers')
            .select('token, expires_at, status, version')
            .eq('user_id', user.id)
            .eq('offer_id', offerId)
            .maybeSingle();
          if (currentError) throw currentError;
          if (current?.status === 'change_requested' && current.version === offer.version) {
            if (offer.status !== 'change_requested') valueRef.current?.refreshOffers().catch(() => {});
            return { ok: true, url: createPublicBookingUrl(current.token), offerId, expiresAt: current.expires_at };
          }
        }
        const customer = offer.customerId ? customersRef.current.find((item) => item.id === offer.customerId) : undefined;
        const snapshot = buildSnapshotFor(offer.kind, offer.version, offer.details, {
          validUntil: offer.validUntil,
          requireEmail: offer.requireEmail,
          customerName: offer.kind === 'quotation' ? customer?.name : undefined,
        });
        const row = await publishOfferRow({
          offerId,
          kind: offer.kind,
          version: offer.version,
          snapshot,
          status: 'sent',
          customerId: offer.customerId,
          expiresAt: linkExpiry(offer.kind, offer.details, offer.validUntil),
        });
        const shared: BookingOffer = {
          ...offer,
          status: offer.status === 'draft' || offer.status === 'revoked' || offer.status === 'declined' || offer.status === 'change_requested' ? 'sent' : offer.status,
          sharedAt: new Date().toISOString(),
          sharedVersion: offer.version,
          linkExpiresAt: row.expires_at,
        };
        offersRef.current = offersRef.current.map((item) => (item.id === offerId ? shared : item));
        setOffers(offersRef.current);
        return { ok: true, url: createPublicBookingUrl(row.token), offerId, expiresAt: row.expires_at };
      } catch (error) {
        // Most likely the customer responded in the meantime; pull that in so the screen shows it.
        valueRef.current?.refreshOffers().catch(() => {});
        return { ok: false, error: offerError(error) };
      }
    },
    [buildSnapshotFor, linkExpiry, offerError, publishOfferRow, supabase, user],
  );

  const revokeOffer = useCallback(
    async (offerId: string): Promise<InvoiceMutationResult> => {
      const offer = offersRef.current.find((item) => item.id === offerId);
      if (!offer) return { ok: false, error: 'This link could no longer be found.' };
      if (supabase && user && offer.sharedAt) {
        const { error } = await supabase
          .from('public_booking_offers')
          .update({ status: 'revoked', updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('offer_id', offerId);
        if (error) return { ok: false, error: offerError(error) };
      }
      offersRef.current = offersRef.current.map((item) => (item.id === offerId && item.status !== 'converted' ? { ...item, status: 'revoked' as OfferStatus } : item));
      setOffers(offersRef.current);
      return { ok: true };
    },
    [offerError, supabase, user],
  );

  const deleteOfferDraft = useCallback((offerId: string) => {
    offersRef.current = offersRef.current.filter((item) => !(item.id === offerId && item.status === 'draft' && !item.sharedAt));
    setOffers(offersRef.current);
  }, []);

  /**
   * Takes a deleted booking form out of the workspace: the form itself and the booking it became,
   * matched only by that booking's id. Customers, invoices, payments and expenses stay. A Dustbin
   * invoice that was holding the booking stops holding it, so restoring the invoice cannot bring
   * the booking back.
   */
  const removeBookingFormLocally = useCallback((offerId: string, bookingIds: string[]) => {
    const removed = new Set(bookingIds);
    if (offersRef.current.some((item) => item.id === offerId)) {
      offersRef.current = offersRef.current.filter((item) => item.id !== offerId);
      setOffers(offersRef.current);
    }
    if (bookingsRef.current.some((item) => removed.has(item.id))) {
      const nextBookings = bookingsRef.current.filter((item) => !removed.has(item.id));
      bookingsRef.current = nextBookings;
      setBookings(nextBookings);
    }
    const holds = (item: Invoice) => Boolean(item.removedBooking && removed.has(item.removedBooking.id));
    if (invoicesRef.current.some(holds)) {
      invoicesRef.current = invoicesRef.current.map((item) => (holds(item) ? { ...item, removedBooking: null } : item));
      setInvoices((current) => current.map((item) => (holds(item) ? { ...item, removedBooking: null } : item)));
    }
  }, []);

  const deleteBookingForm = useCallback(
    async (offerId: string): Promise<InvoiceMutationResult> => {
      const failed = translate(languageRef.current, 'of.deleteForm.failed');
      const offer = offersRef.current.find((item) => item.id === offerId);
      if (offer && offer.kind !== 'booking_form') return { ok: false, error: failed };
      if (!supabase || !user) return { ok: false, error: translate(languageRef.current, 'app.error.connection') };
      // The booking a form becomes always has the id derived from the form; a recorded one is the same.
      const bookingIds = [...new Set([offerRecordIds(offerId).bookingId, ...(offer?.bookingId ? [offer.bookingId] : [])])];

      // No sync may convert this form from here on; one already running is allowed to finish first,
      // so whatever it created is removed below rather than landing afterwards.
      deletedOfferIdsRef.current.add(offerId);
      if (refreshOffersRef.current) await refreshOffersRef.current.catch(() => {});

      // The link stops working for the customer: the row is removed (deleting rows already gone is
      // a no-op, so a retry is safe), together with any customer page of the booking it became.
      const { error } = await supabase
        .from('public_booking_offers')
        .delete()
        .eq('user_id', user.id)
        .in('offer_id', [offerId, ...bookingIds.map((id) => `page-${id}`)]);
      if (error) {
        deletedOfferIdsRef.current.delete(offerId);
        return { ok: false, error: offerError(error) };
      }

      removeBookingFormLocally(offerId, bookingIds);
      try {
        await confirmWorkspaceSave();
      } catch (failure) {
        return { ok: false, error: failure instanceof Error && failure.message ? failure.message : failed };
      }
      return { ok: true };
    },
    [confirmWorkspaceSave, offerError, removeBookingFormLocally, supabase, user],
  );

  const convertQuotation = useCallback(
    (offerId: string, options?: { allowConflict?: boolean }): ConvertOfferResult => {
      const offer = offersRef.current.find((item) => item.id === offerId);
      const failed = translate(languageRef.current, 'of.convert.failed');
      if (!offer || offer.kind !== 'quotation') return { ok: false, error: failed };
      const ids = offerRecordIds(offer.id);
      // Converting twice can only ever point back at the first conversion.
      if (offer.bookingId || bookingsRef.current.some((item) => item.id === ids.bookingId)) {
        return { ok: true, bookingId: offer.bookingId ?? ids.bookingId, invoiceId: offer.invoiceId ?? ids.invoiceId };
      }
      if (offer.status !== 'accepted') return { ok: false, error: failed };
      const details = getRespondedDetails(offer);
      const customer = offer.customerId ? customersRef.current.find((item) => item.id === offer.customerId) : undefined;
      if (!details || !customer) return { ok: false, error: failed };

      // The date was agreed earlier; the calendar may have changed since. Recheck before booking it.
      const clash = findBookingConflicts(bookingsRef.current, {
        date: details.date,
        startTime: details.startTime,
        endTime: details.endTime,
        bufferMinutes: details.bufferMinutes,
      }).find((item) => item.kind === 'overlap');
      if (clash && !options?.allowConflict) {
        return { ok: false, error: 'conflict', conflictTitle: clash.booking.title };
      }
      const bookingAllowance = checkPlanLimit('bookings');
      if (!bookingAllowance.allowed) return { ok: false, error: 'limit', limit: bookingAllowance };
      const invoiceAllowance = checkPlanLimit('invoices');
      if (!invoiceAllowance.allowed) return { ok: false, error: 'limit', limit: invoiceAllowance };

      const created = createRecordsFromOffer({
        offerId: offer.id,
        details,
        customer,
        isNewCustomer: false,
        response: offer.response,
        noteLabel: `Created from accepted quotation ${offer.number ?? ''} (version ${offer.respondedVersion ?? offer.version}).`.replace('  ', ' '),
      });
      const bookingId = created?.booking.id ?? ids.bookingId;
      const converted: BookingOffer = { ...offer, status: 'converted', bookingId, invoiceId: ids.invoiceId };
      offersRef.current = offersRef.current.map((item) => (item.id === offerId ? converted : item));
      setOffers(offersRef.current);

      // Best effort: tell the link it became a booking, once the workspace holding it is saved.
      if (supabase && user) {
        const ownerId = user.id;
        confirmWorkspaceSave()
          .then(() =>
            supabase
              .from('public_booking_offers')
              .update({ status: 'converted', booking_id: bookingId, invoice_id: ids.invoiceId, expires_at: linkExpiry('booking_page', details), updated_at: new Date().toISOString() })
              .eq('user_id', ownerId)
              .eq('offer_id', offerId),
          )
          .then(() => {}, () => {});
      }
      return { ok: true, bookingId, invoiceId: ids.invoiceId };
    },
    [checkPlanLimit, confirmWorkspaceSave, createRecordsFromOffer, linkExpiry, supabase, user],
  );

  const refreshOffers = useCallback(async () => {
    if (!supabase || !user) return;
    if (refreshOffersRef.current) return refreshOffersRef.current;
    const ownerId = user.id;

    const run = async () => {
      const { data, error } = await supabase
        .from('public_booking_offers')
        .select('offer_id, kind, status, version, offer, customer_id, response, responded_version, change_request, terms_version, terms_accepted_at, submitted_at, booking_id, invoice_id, invoice_token, expires_at, created_at')
        .eq('user_id', ownerId)
        .in('kind', ['booking_form', 'quotation']);
      if (error) throw error;

      const t = (key: TranslationKey, values?: Record<string, string | number>) => translate(languageRef.current, key, values);
      let nextOffers = [...offersRef.current];
      const fresh: AppNotification[] = [];
      const acknowledge: { offerId: string; bookingId: string; invoiceId: string; date: string }[] = [];
      const needsInvoiceLink: { offerId: string; invoiceId: string }[] = [];
      for (const row of data ?? []) {
        // Deleted in this session (the read may have started before the deletion).
        if (deletedOfferIdsRef.current.has(row.offer_id)) continue;
        const snapshot = row.offer as unknown as OfferSnapshot;
        if (!snapshot || typeof snapshot !== 'object' || (row.kind !== 'booking_form' && row.kind !== 'quotation')) continue;
        const kind = row.kind as BookingOffer['kind'];
        const local = nextOffers.find((item) => item.id === row.offer_id);
        // A link whose workspace record was lost (another device, an older app overwriting the
        // document) is rebuilt from its own snapshot rather than dropped.
        const rowCreated = row.created_at ? new Date(row.created_at) : null;
        const base: BookingOffer = local ?? {
          id: row.offer_id,
          kind,
          // The link's own creation time, never the day it happened to be rebuilt (blank hides it).
          createdAt: rowCreated && !Number.isNaN(rowCreated.getTime()) ? getLocalTodayKey(rowCreated) : '',
          ...(kind === 'quotation' ? { number: nextQuotationNumber(nextOffers) } : {}),
          ...(row.customer_id ? { customerId: row.customer_id } : {}),
          status: 'sent',
          version: row.version,
          details: detailsFromSnapshot(snapshot),
          ...(snapshot.validUntil ? { validUntil: snapshot.validUntil } : {}),
          requireEmail: Boolean(snapshot.requireEmail),
          sharedAt: new Date().toISOString(),
          sharedVersion: row.version,
        };
        const remoteStatus = row.status as OfferStatus;
        const status: OfferStatus = base.status === 'converted' || remoteStatus === 'converted' ? 'converted' : remoteStatus;
        const response = row.response && typeof row.response === 'object' && !Array.isArray(row.response) ? (row.response as OfferResponse) : undefined;
        let merged: BookingOffer = {
          ...base,
          status,
          linkExpiresAt: row.expires_at,
          ...(response ? { response } : {}),
          ...(row.responded_version ? { respondedVersion: row.responded_version } : {}),
          ...(row.terms_version ? { termsVersion: row.terms_version } : {}),
          ...(row.terms_accepted_at ? { termsAcceptedAt: row.terms_accepted_at } : {}),
          ...(row.submitted_at ? { submittedAt: row.submitted_at } : {}),
          ...(row.change_request ? { changeRequest: row.change_request } : {}),
          ...(row.booking_id && !base.bookingId ? { bookingId: row.booking_id } : {}),
          ...(row.invoice_id && !base.invoiceId ? { invoiceId: row.invoice_id } : {}),
        };

        if (base.status !== remoteStatus && (remoteStatus === 'submitted' || remoteStatus === 'accepted' || remoteStatus === 'change_requested')) {
          const id = `offer-${row.offer_id}-${remoteStatus}-v${row.version}-${(row.change_request ?? '').length}`;
          if (!notifications.some((item) => item.id === id)) {
            fresh.push({
              id,
              title: remoteStatus === 'submitted' ? t('of.notify.formTitle') : remoteStatus === 'accepted' ? t('of.notify.quoteTitle') : t('of.notify.changeTitle'),
              message: remoteStatus === 'submitted'
                ? t('of.notify.form', { name: response?.name ?? '', date: snapshot.date })
                : remoteStatus === 'accepted'
                  ? t('of.notify.quote', { number: base.number ?? '' })
                  : t('of.notify.change', { title: snapshot.title }),
              createdAt: row.submitted_at ?? new Date().toISOString(),
              isOpened: false,
              type: 'booking',
            });
          }
        }

        const ids = offerRecordIds(row.offer_id);
        // Only a submission the server still lists as `submitted` is ever turned into records. Once
        // the link is `converted`, its records were saved, and their absence later cannot be told
        // apart from a deliberate deletion — so nothing is recreated for it. A submission converted
        // here whose save or acknowledgement has not landed yet is recognised by this copy's own
        // offer, or by its booking held in a deleted invoice, and is not built twice.
        const removedHere = local?.status === 'converted'
          || invoicesRef.current.some((item) => (item.id === ids.invoiceId && Boolean(item.deletedAt)) || item.removedBooking?.id === ids.bookingId);
        const hasBooking = bookingsRef.current.some((item) => item.id === ids.bookingId) || removedHere;
        if (kind === 'booking_form' && remoteStatus === 'submitted' && response) {
          if (!hasBooking) {
            const details = local?.version === row.responded_version || local?.version === row.version ? local.details : detailsFromSnapshot(snapshot);
            const matched = matchSubmissionCustomer(customersRef.current, response, row.customer_id);
            const existingNew = customersRef.current.find((item) => item.id === ids.customerId);
            const customer: Customer = matched ?? existingNew ?? {
              id: ids.customerId,
              createdAt: getLocalTodayKey(),
              name: (response.name ?? '').trim() || 'Booking form customer',
              email: (response.email ?? '').trim(),
              phone: (response.phone ?? '').trim(),
              location: (response.customerLocation ?? '').trim().slice(0, 300),
              notes: 'Created from a booking form submission.',
            };
            createRecordsFromOffer({
              offerId: row.offer_id,
              details,
              customer,
              isNewCustomer: !matched && !existingNew,
              response,
              noteLabel: `Submitted through the booking form on ${(row.submitted_at ?? '').slice(0, 10)}. Terms ${row.terms_version ?? ''} accepted.`,
            });
            merged = { ...merged, status: 'converted', bookingId: ids.bookingId, invoiceId: ids.invoiceId };
          }
          // Marked converted only after the save holding these records succeeds (below).
          acknowledge.push({ offerId: row.offer_id, bookingId: ids.bookingId, invoiceId: ids.invoiceId, date: snapshot.date });
        }
        if (kind === 'booking_form' && (remoteStatus === 'submitted' || remoteStatus === 'converted') && response && !row.invoice_token) {
          needsInvoiceLink.push({ offerId: row.offer_id, invoiceId: ids.invoiceId });
        }

        nextOffers = local ? nextOffers.map((item) => (item.id === merged.id ? merged : item)) : [merged, ...nextOffers];
      }

      offersRef.current = nextOffers;
      setOffers(nextOffers);
      if (fresh.length) {
        setNotifications((current) => [...fresh.filter((item) => !current.some((existing) => existing.id === item.id)), ...current]);
        fresh.slice(0, 3).forEach((item) => {
          presentOwnerNotification(item.title, item.message).catch(() => {});
        });
      }

      if (acknowledge.length === 0 && needsInvoiceLink.length === 0) return;
      // Only once the workspace holding the new records is safely saved is the link told so —
      // otherwise a failed save could leave a "converted" link pointing at records that never landed.
      await confirmWorkspaceSave();
      let removedConcurrently = false;
      for (const item of acknowledge) {
        const { data: acknowledged, error: ackError } = await supabase
          .from('public_booking_offers')
          .update({ status: 'converted', booking_id: item.bookingId, invoice_id: item.invoiceId, expires_at: linkExpiry('booking_page', { date: item.date }), updated_at: new Date().toISOString() })
          .eq('user_id', ownerId)
          .eq('offer_id', item.offerId)
          .select('offer_id');
        // The form was deleted (on any device) while this sync was converting it: its row is gone,
        // so the booking just made for it goes too, exactly as the deletion would have removed it.
        if (!ackError && Array.isArray(acknowledged) && acknowledged.length === 0) {
          deletedOfferIdsRef.current.add(item.offerId);
          removeBookingFormLocally(item.offerId, [item.bookingId]);
          removedConcurrently = true;
        }
      }
      if (removedConcurrently) await confirmWorkspaceSave().catch(() => {});
      // Gives the customer's page its invoice link, through the existing invoice link mechanism.
      for (const item of needsInvoiceLink) {
        if (deletedOfferIdsRef.current.has(item.offerId)) continue;
        const share = valueRef.current?.createInvoiceShareLink;
        if (!share || !invoicesRef.current.some((invoice) => invoice.id === item.invoiceId && !invoice.deletedAt)) continue;
        try {
          const invoiceToken = readInvoiceTokenFromUrl(await share(item.invoiceId));
          if (invoiceToken) {
            await supabase
              .from('public_booking_offers')
              .update({ invoice_token: invoiceToken, updated_at: new Date().toISOString() })
              .eq('user_id', ownerId)
              .eq('offer_id', item.offerId);
          }
        } catch {
          // Retried on the next refresh.
        }
      }
    };

    const pending = run().finally(() => {
      refreshOffersRef.current = null;
    });
    refreshOffersRef.current = pending;
    return pending;
  }, [confirmWorkspaceSave, createRecordsFromOffer, linkExpiry, notifications, removeBookingFormLocally, supabase, user]);

  const createCustomerPageLink = useCallback(
    async (bookingId: string): Promise<OfferLinkResult> => {
      const booking = bookingsRef.current.find((item) => item.id === bookingId);
      const failed = translate(languageRef.current, 'cp.failed');
      if (!booking || !supabase || !user) return { ok: false, error: failed };
      const offerId = `page-${bookingId}`;
      try {
        const invoice = invoicesRef.current.find((item) => item.bookingId === bookingId && !item.deletedAt && item.status !== 'Void');
        let invoiceToken: string | null = null;
        if (invoice && valueRef.current) {
          invoiceToken = readInvoiceTokenFromUrl(await valueRef.current.createInvoiceShareLink(invoice.id));
        }
        const expiresAt = linkExpiry('booking_page', booking);
        const { data: existing } = await supabase
          .from('public_booking_offers')
          .select('token')
          .eq('user_id', user.id)
          .eq('offer_id', offerId)
          .maybeSingle();
        if (existing) {
          // The page reads the live booking; only the expiry and invoice link move on a re-share.
          const { data, error } = await supabase
            .from('public_booking_offers')
            .update({ expires_at: expiresAt, invoice_id: invoice?.id ?? null, ...(invoiceToken ? { invoice_token: invoiceToken } : {}), updated_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .eq('offer_id', offerId)
            .select('token, expires_at')
            .single();
          if (error || !data) throw error ?? new Error('No link returned');
          return { ok: true, url: createPublicBookingUrl(data.token), offerId, expiresAt: data.expires_at };
        }
        const charges = booking.charges ?? [];
        const details: OfferDetails = {
          title: booking.title,
          packageName: booking.packageName,
          includedServices: booking.includedServices,
          basePrice: booking.basePrice ?? booking.price,
          charges,
          deposit: booking.depositType && booking.depositValue
            ? { type: booking.depositType, value: booking.depositValue, ...(booking.depositDueDate ? { dueDate: booking.depositDueDate } : {}) }
            : booking.depositAmount ? { type: 'fixed', value: booking.depositAmount } : null,
          date: booking.date,
          startTime: booking.startTime ?? booking.time ?? '',
          endTime: booking.endTime ?? '',
          bufferMinutes: booking.bufferMinutes,
          location: booking.location,
          terms: booking.terms ?? invoice?.terms ?? '',
        };
        const row = await publishOfferRow({
          offerId,
          kind: 'booking_page',
          version: 1,
          snapshot: buildSnapshotFor('booking_page', 1, details, {}),
          status: 'converted',
          expiresAt,
          bookingId,
          invoiceId: invoice?.id,
          invoiceToken,
        });
        return { ok: true, url: createPublicBookingUrl(row.token), offerId, expiresAt: row.expires_at };
      } catch (error) {
        if (__DEV__) console.warn('[customer-page] could not create the link', error instanceof Error ? error.message : error);
        return { ok: false, error: failed };
      }
    },
    [buildSnapshotFor, linkExpiry, publishOfferRow, supabase, user],
  );

  /** Deletes the page's link row outright, so a later share mints a brand-new token. */
  const revokeCustomerPageLink = useCallback(
    async (bookingId: string): Promise<InvoiceMutationResult> => {
      if (!supabase || !user) return { ok: false, error: translate(languageRef.current, 'app.error.connection') };
      const { error } = await supabase
        .from('public_booking_offers')
        .delete()
        .eq('user_id', user.id)
        .eq('offer_id', `page-${bookingId}`);
      return error ? { ok: false, error: translate(languageRef.current, 'cp.failed') } : { ok: true };
    },
    [supabase, user],
  );

  const value = useMemo<AppDataContextValue>(
    () => ({
      isLoading,
      loadError,
      syncError,
      reload: () => setReloadKey((current) => current + 1),
      confirmWorkspaceSave,
      planUsage: getPlanUsage({ customers, bookings, invoices: allInvoices }),
      checkPlanLimit,
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
      language,
      updateLanguage: (next: Locale) => {
        setLanguage(next);
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
            // Drops both fields unless they form a usable pair, so a partly filled deposit can
            // never be stored in a state the booking form cannot read back.
            ...normalizeServiceDeposit(service.defaultDepositType, service.defaultDepositValue),
            ...normalizePackageExtras(service),
          },
        ]);
      },
      updatePackage: (id: string, updates: Partial<PackageOption>) => {
        setPackages((current) =>
          current.map((pkg) => {
            if (pkg.id !== id) return pkg;

            const next = { ...pkg, ...updates, ...normalizePackageExtras({ ...pkg, ...updates }) };
            if (!next.includedServices?.length) delete next.includedServices;
            if (!next.addOns?.length) delete next.addOns;
            if (!next.bufferMinutes) delete next.bufferMinutes;
            // An edit that clears the deposit must actually remove both fields rather than merge
            // the old pair back in, so `normalizeServiceDeposit` decides on the incoming values.
            const isDepositEdit = 'defaultDepositType' in updates || 'defaultDepositValue' in updates;
            if (!isDepositEdit) return next;

            delete next.defaultDepositType;
            delete next.defaultDepositValue;
            return { ...next, ...normalizeServiceDeposit(updates.defaultDepositType, updates.defaultDepositValue) };
          }),
        );
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
        // Checked here, not only where the button lives, so every path in — and a second tap
        // before this one has rendered — meets the same gate.
        if (!checkPlanLimit('customers').allowed) {
          return null;
        }

        const createdCustomer: Customer = {
          ...customer,
          id: `cust-${Date.now()}`,
          createdAt: getLocalTodayKey(),
          name: safeName,
          email: safeEmail,
        };

        customersRef.current = [...customersRef.current, createdCustomer];
        setCustomers((current) => [...current, createdCustomer]);
        return createdCustomer;
      },
      updateCustomer: (id: string, updates: Partial<Omit<Customer, 'id'>>) => {
        const existing = customersRef.current.find((customer) => customer.id === id);
        const nextName = (updates.name ?? existing?.name ?? '').trim();

        if (!existing || !nextName) {
          return false;
        }

        // Built once, so the record that lands in state is the same one the invoice snapshots are
        // taken from — the two can never drift apart mid-update.
        const nextCustomer: Customer = {
          ...existing,
          ...updates,
          name: nextName,
          email: (updates.email ?? existing.email).trim(),
          phone: (updates.phone ?? existing.phone).trim(),
        };

        customersRef.current = customersRef.current.map((customer) =>
          customer.id === id ? nextCustomer : customer,
        );
        setCustomers((current) => current.map((customer) => (customer.id === id ? nextCustomer : customer)));
        // This client's invoices carry their details forward, so deleting them later leaves the
        // invoice naming them as they are now rather than as they were when it was raised. Only
        // their own invoices are considered, and an unchanged snapshot is left alone — the helper
        // hands back the same array when nothing differs, and this updater then bails out.
        setInvoices((current) => refreshInvoiceCustomerSnapshots(current, nextCustomer));
        return true;
      },
      deleteCustomer: (id: string) => {
        const customer = customersRef.current.find((item) => item.id === id) ?? null;

        // Invoices are financial records and are never deleted with their client. Any of this
        // client's invoices still missing a snapshot (raised before snapshots existed) gets one
        // now, while the record is still here to copy — the last moment it can be taken.
        if (customer) {
          const snapshot = createInvoiceCustomerSnapshot(customer);
          setInvoices((current) =>
            current.map((invoice) =>
              invoice.customerId === id && !invoice.customerSnapshot
                ? { ...invoice, customerSnapshot: snapshot }
                : invoice,
            ),
          );
        }

        customersRef.current = customersRef.current.filter((item) => item.id !== id);
        setCustomers((current) => current.filter((item) => item.id !== id));
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
        // Package price, additional charges and the deposit, validated against the final total.
        const money = resolveBookingMoney(booking);

        if (
          !safeTitle ||
          !booking.date ||
          !startTime ||
          !endTime ||
          endTime <= startTime ||
          // An overlap is still refused unless the owner saw the warning and chose to keep both.
          (conflictingBooking && !booking.allowConflict) ||
          !money.ok ||
          (!existingCustomer && !safeNewCustomerName)
        ) {
          return null;
        }
        // The booking's own allowance, plus the client allowance when this booking would also
        // create a new client. Nothing is written unless both pass.
        if (!checkPlanLimit('bookings').allowed) return null;
        if (!existingCustomer && !checkPlanLimit('customers').allowed) return null;

        const createdAt = Date.now();
        const resolvedCustomer: Customer = existingCustomer ?? {
          ...booking.newCustomer!,
          id: `cust-${createdAt}`,
          createdAt: getLocalTodayKey(new Date(createdAt)),
          name: safeNewCustomerName,
          email: safeNewCustomerEmail,
          phone: booking.newCustomer?.phone.trim() ?? '',
          location: booking.newCustomer?.location.trim() ?? '',
          notes: booking.newCustomer?.notes.trim() ?? '',
        };
        const bufferMinutes = normalizeBufferMinutes(booking.bufferMinutes);
        const servicePackage =
          packages.find((item) => item.id === booking.packageId) ??
          packages.find((item) => item.name === booking.packageName);
        const includedServices = (booking.includedServices ?? []).map((item) => item.trim()).filter(Boolean);
        const bookingTerms = booking.terms?.trim();
        // The money is whatever the form finally held, frozen on the booking: editing the service
        // later must never reach back into it.
        const createdBooking: Booking = {
          id: `bk-${createdAt}`,
          createdAt: getLocalTodayKey(new Date(createdAt)),
          customerId: resolvedCustomer.id,
          title: safeTitle,
          date: booking.date,
          time: startTime,
          startTime,
          endTime,
          location: booking.location.trim(),
          packageName: booking.packageName,
          ...(booking.packageId ? { packageId: booking.packageId } : {}),
          ...money.fields,
          ...(bufferMinutes ? { bufferMinutes } : {}),
          ...(includedServices.length ? { includedServices } : {}),
          ...(bookingTerms ? { terms: bookingTerms } : {}),
          ...(booking.sourceOfferId ? { sourceOfferId: booking.sourceOfferId } : {}),
          status: booking.status,
          notes: booking.notes.trim() || 'Booking created from the app.',
        };
        const invoiceDueDate = getInvoiceDueDate(booking.date);
        // Numbers taken by trashed invoices stay taken, so a restore can never collide.
        const stamp = stampNewInvoice(allInvoices);
        const packageDetails = servicePackage?.details;
        const createdInvoice: Invoice = {
          id: `inv-${createdAt}`,
          invoiceNumber: stamp.invoiceNumber,
          snapshot: stamp.snapshot,
          bookingId: createdBooking.id,
          customerId: resolvedCustomer.id,
          customerSnapshot: createInvoiceCustomerSnapshot(resolvedCustomer),
          amount: createdBooking.price,
          dueDate: invoiceDueDate,
          status: 'Draft',
          sentAt: getLocalTodayKey(),
          serviceName: createdBooking.packageName,
          packageDetails,
          eventLocation: createdBooking.location,
          eventDate: createdBooking.date,
          eventTime: createdBooking.time,
          eventStartTime: createdBooking.startTime,
          eventEndTime: createdBooking.endTime,
          terms: bookingTerms || servicePackage?.info,
          // Charge lines are frozen onto the invoice; a booking without charges keeps the single
          // service line invoices have always had.
          ...(createdBooking.charges?.length
            ? {
                lineItems: buildPricedLines({
                  packageName: createdBooking.packageName,
                  packageDetails,
                  basePrice: createdBooking.basePrice ?? createdBooking.price,
                  charges: createdBooking.charges,
                }),
              }
            : {}),
          // What the customer owes up front. Not a payment: nothing is recorded as received.
          ...(createdBooking.depositAmount ? { depositDue: createdBooking.depositAmount } : {}),
          ...(createdBooking.depositDueDate ? { depositDueDate: createdBooking.depositDueDate } : {}),
        };

        if (!existingCustomer) {
          customersRef.current = [...customersRef.current, resolvedCustomer];
          setCustomers((current) => [...current, resolvedCustomer]);
        }
        const nextBookings = [createdBooking, ...bookingsRef.current];
        bookingsRef.current = nextBookings;
        setBookings(nextBookings);
        invoicesRef.current = [createdInvoice, ...invoicesRef.current];
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
      updateBooking: (bookingId: string, input: CreateBookingInput): UpdateBookingResult => {
        const existing = bookingsRef.current.find((item) => item.id === bookingId);
        if (!existing) return { ok: false, error: 'This booking could no longer be found.' };

        const safeTitle = input.title.trim();
        const startTime = normalizeBookingTime(input.startTime ?? input.time);
        const endTime = normalizeBookingTime(input.endTime);
        const money = resolveBookingMoney(input);
        const existingCustomer = customersRef.current.find((customer) => customer.id === input.customerId) ?? null;
        const safeNewCustomerName = input.newCustomer?.name.trim() ?? '';
        if (!safeTitle || !input.date || !startTime || !endTime || endTime <= startTime || !money.ok || (!existingCustomer && !safeNewCustomerName)) {
          return { ok: false, error: 'Check the booking details and try again.' };
        }
        // The booking being edited never conflicts with itself.
        const conflict = findBookingTimeConflict(bookingsRef.current, input.date, startTime, endTime, bookingId);
        if (conflict && !input.allowConflict) {
          return { ok: false, error: 'This time overlaps with an existing booking. Choose another time.' };
        }
        if (!existingCustomer && !checkPlanLimit('customers').allowed) {
          return { ok: false, error: 'limit' };
        }

        const now = Date.now();
        const customer: Customer = existingCustomer ?? {
          ...input.newCustomer!,
          id: `cust-${now}`,
          createdAt: getLocalTodayKey(new Date(now)),
          name: safeNewCustomerName,
          email: input.newCustomer?.email.trim() ?? '',
          phone: input.newCustomer?.phone.trim() ?? '',
          location: input.newCustomer?.location.trim() ?? '',
          notes: input.newCustomer?.notes.trim() ?? '',
        };
        const bufferMinutes = normalizeBufferMinutes(input.bufferMinutes);
        const includedServices = (input.includedServices ?? []).map((item) => item.trim()).filter(Boolean);
        const bookingTerms = input.terms?.trim();

        // Money fields are replaced as a set, so removing every charge or the deposit really
        // removes it rather than leaving the old value behind.
        const {
          basePrice: _basePrice,
          charges: _charges,
          depositAmount: _depositAmount,
          depositType: _depositType,
          depositValue: _depositValue,
          depositDueDate: _depositDueDate,
          bufferMinutes: _bufferMinutes,
          includedServices: _includedServices,
          terms: _terms,
          ...kept
        } = existing;
        const updated: Booking = {
          ...kept,
          customerId: customer.id,
          title: safeTitle,
          date: input.date,
          time: startTime,
          startTime,
          endTime,
          location: input.location.trim(),
          packageName: input.packageName,
          ...(input.packageId ? { packageId: input.packageId } : {}),
          ...money.fields,
          ...(bufferMinutes ? { bufferMinutes } : {}),
          ...(includedServices.length ? { includedServices } : {}),
          ...(bookingTerms ? { terms: bookingTerms } : {}),
          notes: input.notes.trim() || existing.notes,
        };

        if (!existingCustomer) {
          customersRef.current = [...customersRef.current, customer];
          setCustomers((current) => [...current, customer]);
        }
        const nextBookings = bookingsRef.current.map((item) => (item.id === bookingId ? updated : item));
        bookingsRef.current = nextBookings;
        setBookings(nextBookings);

        // A linked invoice follows the edit only while it is an unsent draft with no money against
        // it. Anything already sent, accepted or paid keeps exactly what was agreed and issued.
        const servicePackage = packages.find((item) => item.id === updated.packageId) ?? packages.find((item) => item.name === updated.packageName);
        const unchanged: string[] = [];
        const nextInvoices = invoicesRef.current.map((invoice) => {
          if (invoice.bookingId !== bookingId || invoice.deletedAt) return invoice;
          const hasPayments = allPayments.some((payment) => payment.invoiceId === invoice.id);
          if (invoice.status !== 'Draft' || hasPayments) {
            if (toCents(invoice.amount) !== toCents(updated.price)) unchanged.push(getInvoiceNumber(invoice));
            return invoice;
          }
          const packageDetails = invoice.packageDetails ?? servicePackage?.details;
          const {
            lineItems: _lineItems,
            depositDue: _depositDue,
            depositDueDate: _invoiceDepositDueDate,
            ...invoiceKept
          } = invoice;
          return {
            ...invoiceKept,
            customerId: customer.id,
            customerSnapshot: createInvoiceCustomerSnapshot(customer),
            amount: updated.price,
            serviceName: updated.packageName,
            eventLocation: updated.location,
            eventDate: updated.date,
            eventTime: updated.time,
            eventStartTime: updated.startTime,
            eventEndTime: updated.endTime,
            ...(bookingTerms ? { terms: bookingTerms } : {}),
            ...(updated.charges?.length
              ? { lineItems: buildPricedLines({ packageName: updated.packageName, packageDetails, basePrice: updated.basePrice ?? updated.price, charges: updated.charges }) }
              : {}),
            ...(updated.depositAmount ? { depositDue: updated.depositAmount } : {}),
            ...(updated.depositDueDate ? { depositDueDate: updated.depositDueDate } : {}),
          };
        });
        invoicesRef.current = nextInvoices;
        setInvoices(nextInvoices);
        return { ok: true, ...(unchanged.length ? { unchangedInvoiceNumbers: unchanged } : {}) };
      },
      setBookingFulfilment: (bookingId: string, fulfilment: BookingFulfilment | null) => {
        const booking = bookingsRef.current.find((item) => item.id === bookingId);
        if (!booking) return { ok: false, error: 'This booking could no longer be found.' };
        const normalized = fulfilment ? normalizeFulfilment({ ...fulfilment, updatedAt: new Date().toISOString() }) : undefined;
        if (fulfilment && !normalized) return { ok: false, error: 'Check the delivery details and try again.' };
        const nextBookings = bookingsRef.current.map((item) => {
          if (item.id !== bookingId) return item;
          if (normalized) return { ...item, fulfilment: normalized };
          const { fulfilment: _removed, ...rest } = item;
          return rest;
        });
        bookingsRef.current = nextBookings;
        setBookings(nextBookings);
        return { ok: true };
      },
      setBookingNotes: (bookingId: string, notes: string) => {
        if (!bookingsRef.current.some((item) => item.id === bookingId)) {
          return { ok: false, error: 'This booking could no longer be found.' };
        }
        const nextBookings = bookingsRef.current.map((item) => (item.id === bookingId ? { ...item, notes } : item));
        bookingsRef.current = nextBookings;
        setBookings(nextBookings);
        return { ok: true };
      },
      offers,
      saveQuotation,
      createBookingForm,
      reviseBookingForm,
      shareOffer,
      revokeOffer,
      deleteOfferDraft,
      deleteBookingForm,
      refreshOffers,
      convertQuotation,
      createCustomerPageLink,
      revokeCustomerPageLink,
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
      addInvoice: (invoice: Omit<Invoice, 'id'>, schedule?: InvoiceEventSchedule): AddInvoiceResult => {
        if (!invoice.customerId || Number.isNaN(invoice.amount) || invoice.amount <= 0) {
          return { ok: false, error: 'This invoice needs a customer and an amount greater than zero.' };
        }
        const invoiceAllowance = checkPlanLimit('invoices');
        if (!invoiceAllowance.allowed) {
          return { ok: false, error: 'limit', limit: invoiceAllowance };
        }

        const createdAt = Date.now();
        const invoiceId = `inv-${createdAt}`;
        // An invoice raised from a booking already has its slot; only a standalone one reserves a
        // new booking, so a job is never represented twice.
        const linkedBooking = bookingsRef.current.find((item) => item.id === invoice.bookingId) ?? null;
        let createdBooking: Booking | null = null;
        let bookingId = invoice.bookingId;

        if (schedule && !linkedBooking) {
          const startTime = normalizeBookingTime(schedule.startTime);
          const endTime = normalizeBookingTime(schedule.endTime);

          if (!schedule.date || !startTime || !endTime || endTime <= startTime) {
            return { ok: false, error: 'Choose an event date with a finish time later than the start time.' };
          }

          // The same half-open interval rule the booking composer uses, over the same records.
          if (findBookingTimeConflict(bookingsRef.current, schedule.date, startTime, endTime) && !schedule.allowConflict) {
            return { ok: false, error: 'This time overlaps with an existing booking. Choose another time.' };
          }

          bookingId = `bk-${createdAt}`;
          createdBooking = {
            id: bookingId,
            createdAt: getLocalTodayKey(new Date(createdAt)),
            customerId: invoice.customerId,
            title: invoice.serviceName?.trim() || 'Booked event',
            date: schedule.date,
            time: startTime,
            startTime,
            endTime,
            location: invoice.eventLocation?.trim() ?? '',
            packageName: invoice.serviceName?.trim() ?? '',
            price: invoice.amount,
            status: 'Inquiry',
            depositAmount: schedule.depositAmount,
            ...(schedule.packageId ? { packageId: schedule.packageId } : {}),
            ...(schedule.charges?.length ? { basePrice: schedule.basePrice ?? invoice.amount, charges: schedule.charges } : {}),
            ...(schedule.depositType ? { depositType: schedule.depositType, depositValue: schedule.depositValue } : {}),
            ...(schedule.depositDueDate ? { depositDueDate: schedule.depositDueDate } : {}),
            ...(normalizeBufferMinutes(schedule.bufferMinutes) ? { bufferMinutes: normalizeBufferMinutes(schedule.bufferMinutes) } : {}),
            ...(schedule.terms?.trim() ? { terms: schedule.terms.trim() } : {}),
            notes: schedule.notes?.trim() || 'Booking created from an invoice.',
          };
        }

        // Both writes are decided before either is applied, so a rejected schedule leaves nothing
        // behind and a saved invoice always has the booking it claims.
        if (createdBooking) {
          const nextBookings = [createdBooking, ...bookingsRef.current];
          bookingsRef.current = nextBookings;
          setBookings(nextBookings);
        }

        // Stamped here rather than read at display time, so the invoice keeps its "Bill to" details
        // even after the client is deleted from the Clients screen. Editing that client later
        // refreshes it; deleting them is what finally freezes it.
        const invoiceCustomer = customersRef.current.find((item) => item.id === invoice.customerId) ?? null;
        const customerSnapshot =
          invoice.customerSnapshot ?? (invoiceCustomer ? createInvoiceCustomerSnapshot(invoiceCustomer) : undefined);

        const stampedInvoice = { id: invoiceId, sentAt: invoice.sentAt } as Invoice;
        invoicesRef.current = [stampedInvoice, ...invoicesRef.current];
        setInvoices((current) => {
          const stamp = stampNewInvoice(current);
          return [
            {
              ...invoice,
              id: invoiceId,
              bookingId,
              ...(customerSnapshot ? { customerSnapshot } : {}),
              invoiceNumber: stamp.invoiceNumber,
              snapshot: stamp.snapshot,
              status: invoice.status ?? 'Draft',
              // The booking owns the schedule; these carry it for the invoice's own display and
              // for the customer-facing copy, exactly as a booking-raised invoice already does.
              ...(createdBooking
                ? {
                    eventDate: createdBooking.date,
                    eventTime: createdBooking.time,
                    eventStartTime: createdBooking.startTime,
                    eventEndTime: createdBooking.endTime,
                  }
                : {}),
            },
            ...current,
          ];
        });
        setInvoiceDraft(null);
        return { ok: true, invoiceId, bookingId };
      },
      createInvoiceShareLink: async (invoiceId: string) => {
        if (!supabase || !user) {
          throw new Error(translate(languageRef.current, 'app.error.connection'));
        }

        const storedInvoice = allInvoices.find((item) => item.id === invoiceId);
        if (!storedInvoice) {
          throw new Error('The invoice could not be found.');
        }
        // The client record may be gone; the invoice's own snapshot is what the link then carries.
        const client = resolveInvoiceCustomer(
          storedInvoice,
          customers.find((item) => item.id === storedInvoice.customerId),
        );
        if (storedInvoice.deletedAt || storedInvoice.status === 'Void') {
          throw new Error('This invoice is no longer active and cannot be sent.');
        }
        // A draft follows the live settings until it is sent (that is how the app previews it), so
        // sending one freezes the settings in force now rather than those from when it was created.
        const isSendingDraft = storedInvoice.status === 'Draft';
        const invoice: Invoice = isSendingDraft
          ? { ...storedInvoice, snapshot: snapshotCurrentInvoiceSettings() }
          : storedInvoice;

        const publicStatus =
          invoice.status === 'Accepted' ||
          invoice.status === 'Declined' ||
          invoice.status === 'Paid' ||
          invoice.status === 'Cancelled'
            ? invoice.status
            : 'Sent';
        const payload = buildPublicInvoicePayload(invoice, client, publicStatus, language);
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

        if (error) {
          if (__DEV__) console.warn('[invoice-link] could not create the link', error);
          throw new Error(translate(languageRef.current, 'app.error.connection'));
        }

        if (isSendingDraft || invoice.status === 'Overdue') {
          setInvoices((current) =>
            current.map((item) =>
              item.id === invoice.id
                ? { ...item, status: 'Sent', ...(isSendingDraft ? { snapshot: invoice.snapshot } : {}) }
                : item,
            ),
          );
        }

        return createPublicInvoiceUrl(data.token);
      },
      updateInvoice: (invoiceId: string, input: InvoiceEditInput): UpdateInvoiceResult => {
        const invoice = invoicesRef.current.find((item) => item.id === invoiceId);
        if (!invoice) return { ok: false, error: 'This invoice could no longer be found.' };

        // A client deleted since the invoice was raised may stay on it, remembered by its snapshot;
        // any other client must exist.
        const customer = customersRef.current.find((item) => item.id === input.customerId) ?? null;
        if (!customer && input.customerId !== invoice.customerId) {
          return { ok: false, error: translate(languageRef.current, 'bookings.error.fields') };
        }

        // Checked here as well as in the form, so no caller can skip it.
        const result = applyInvoiceEdit(
          invoice,
          { ...input, ...(customer ? { customerSnapshot: createInvoiceCustomerSnapshot(customer) } : {}) },
          allPayments,
        );
        if (!result.ok) return { ok: false, error: translate(languageRef.current, result.error) };

        const updated = result.invoice;
        invoicesRef.current = invoicesRef.current.map((item) => (item.id === invoiceId ? updated : item));
        setInvoices((current) => current.map((item) => (item.id === invoiceId ? updated : item)));

        // The linked booking (found by the invoice's stored bookingId, never by name or date) moves
        // with the event details this edit changed. Same tick as the invoice, so both land in one
        // workspace save: they are stored together or not at all. An invoice with no booking, or
        // whose booking is gone, saves exactly as before.
        const linkedBooking = invoice.bookingId ? bookingsRef.current.find((item) => item.id === invoice.bookingId) : undefined;
        if (linkedBooking) {
          const syncedBooking = syncLinkedBookingSchedule(linkedBooking, invoice, updated);
          if (syncedBooking !== linkedBooking) {
            const nextBookings = bookingsRef.current.map((item) => (item.id === linkedBooking.id ? syncedBooking : item));
            bookingsRef.current = nextBookings;
            setBookings(nextBookings);
          }
        }

        // Payment records are untouched; only their ledger mirror is rebuilt, so a changed client or
        // total is reflected in the same rows (same ids, same amounts).
        const invoicePayments = allPayments.filter((payment) => payment.invoiceId === invoiceId);
        if (invoicePayments.length) {
          setFinanceEntries((current) =>
            replaceInvoicePaymentFinanceEntries(current, updated, invoicePayments, customersRef.current),
          );
        }

        // The customer's page reads the total from the workspace and the rest from the link, so the
        // link is rewritten only once the edit itself is stored — the two can never disagree.
        const client = resolveInvoiceCustomer(updated, customer ?? undefined);
        return {
          ok: true,
          sharedLink: confirmWorkspaceSave().then(() => refreshPublicInvoicePayload(updated, client)),
        };
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
      clearAllNotifications: () => {
        setNotifications([]);
        // Stamped so the reminders that produced these records are not materialised all over again
        // on the next foreground or the next launch. The normal save queue persists both, because
        // the workspace document carries this field alongside the list itself.
        setNotificationsClearedAt(new Date().toISOString());
      },
      suspendWorkspaceSync: async () => {
        canSaveRef.current = false;
        await saveQueueRef.current.catch(() => {});
      },
      resumeWorkspaceSync: () => {
        // Only a workspace that finished loading for this user may save again.
        if (user && loadedUserIdRef.current === user.id) canSaveRef.current = true;
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
        offersRef.current = [];
        setOffers([]);
        setNotifications([]);
        // Reset with the rest, so a wiped workspace is not left holding a Clear all stamp that
        // would suppress reminders for whatever is put back into it.
        setNotificationsClearedAt(undefined);
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
        // Open booking forms and quotations are closed too, so a customer cannot submit into the
        // emptied workspace.
        if (supabase && user) {
          void supabase
            .from('public_booking_offers')
            .update({ status: 'revoked', updated_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .in('status', ['sent', 'change_requested'])
            .then(() => {}, () => {});
        }
      },
    }),
    [
      confirmWorkspaceSave,
      offers,
      saveQuotation,
      createBookingForm,
      reviseBookingForm,
      shareOffer,
      revokeOffer,
      deleteOfferDraft,
      deleteBookingForm,
      refreshOffers,
      convertQuotation,
      createCustomerPageLink,
      revokeCustomerPageLink,
      bookings,
      businessProfile,
      currency,
      customers,
      invoiceSettings,
      language,
      stampNewInvoice,
      snapshotCurrentInvoiceSettings,
      activeFinanceEntries,
      allFinanceEntries,
      checkPlanLimit,
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
      buildPublicInvoicePayload,
      refreshPublicInvoicePayload,
      refreshInvoiceStatuses,
      removeBusinessLogo,
      reminders,
      syncError,
      supabase,
      uploadBusinessLogo,
      user,
    ],
  );

  valueRef.current = value;

  /**
   * Customer responses arrive in their own table, so they are pulled in when the workspace finishes
   * loading and whenever BookFlow returns to the foreground — at most every 30 seconds. A failure is
   * silent here; the Quotes & forms screen offers a manual check that reports it.
   */
  const lastOfferRefreshRef = useRef(0);
  const workspaceReady = !isLoading && !loadError && Boolean(user) && loadedUserIdRef.current === user?.id;
  useEffect(() => {
    if (!workspaceReady) return;
    const pull = () => {
      if (Date.now() - lastOfferRefreshRef.current < 30_000) return;
      lastOfferRefreshRef.current = Date.now();
      valueRef.current?.refreshOffers().catch((error) => {
        if (__DEV__) console.warn('[booking-offers] refresh failed', error instanceof Error ? error.message : error);
      });
    };
    pull();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') pull();
    });
    return () => subscription.remove();
  }, [workspaceReady]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error('useAppData must be used within AppDataProvider');
  }

  return context;
}
