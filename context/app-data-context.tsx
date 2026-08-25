import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth, type AuthUser } from '@/context/auth-context';
import {
  createClerkSupabaseClient,
  getSupabaseFunctionUrl,
  isSupabaseConfigured,
  type Json,
} from '@/lib/supabase';
import { findBookingTimeConflict, normalizeBookingTime } from '@/lib/booking-conflicts';
import { fromCents, resolveInvoiceStatus, sumPaymentsInCents, toCents } from '@/lib/invoice-payments';

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
  status: 'Inquiry' | 'Confirmed' | 'Completed' | 'Cancelled';
  notes: string;
};

export type Invoice = {
  id: string;
  bookingId: string;
  customerId: string;
  amount: number;
  depositPaid?: number;
  dueDate: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Paid' | 'Partially Paid' | 'Overdue' | 'Cancelled';
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
};

export type RecordInvoicePaymentResult = {
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
  invoices: Invoice[];
  payments: InvoicePayment[];
  financeEntries: FinanceEntry[];
  reminders: Reminder[];
  notifications: AppNotification[];
  invoiceDraft: InvoiceDraftPrefill | null;
  businessProfile: BusinessProfile;
  updateBusinessProfile: (profile: BusinessProfile) => void;
  currency: CurrencyCode;
  updateCurrency: (code: CurrencyCode) => void;
  addPackage: (service: Omit<PackageOption, 'id'>) => void;
  updatePackage: (id: string, updates: Partial<PackageOption>) => void;
  removePackage: (id: string) => void;
  addCustomer: (customer: Omit<Customer, 'id'>) => Customer | null;
  updateCustomer: (id: string, updates: Partial<Omit<Customer, 'id'>>) => boolean;
  deleteCustomer: (id: string) => void;
  createBooking: (booking: CreateBookingInput) => CreateBookingResult | null;
  addInvoice: (invoice: Omit<Invoice, 'id'>) => void;
  createInvoiceShareLink: (invoiceId: string) => Promise<string>;
  refreshInvoiceStatuses: () => Promise<void>;
  setInvoiceDraft: (draft: InvoiceDraftPrefill | null) => void;
  updateInvoiceStatus: (invoiceId: string, status: Invoice['status']) => void;
  updateInvoiceDeposit: (invoiceId: string, depositPaid: number, details?: InvoicePaymentDetails) => boolean;
  recordInvoicePayment: (input: RecordInvoicePaymentInput) => RecordInvoicePaymentResult;
  addFinanceEntry: (entry: Omit<FinanceEntry, 'id'>) => void;
  addReminder: (reminder: Omit<Reminder, 'id'>) => void;
  markReminderSent: (reminderId: string) => void;
  markNotificationOpened: (notificationId: string) => void;
  markAllNotificationsOpened: () => void;
  deleteWorkspace: () => Promise<void>;
  deleteAllData: () => void;
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
};

function getInvoiceDueDate(eventDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate);
  if (!match) return eventDate;

  const [, year, month, day] = match;
  const dueDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  dueDate.setUTCDate(dueDate.getUTCDate() - 1);
  return dueDate.toISOString().slice(0, 10);
}

/**
 * Workspaces saved before payments were individual records only kept a single running total on the
 * invoice. Turn that total into one payment record so no money disappears from the ledger.
 */
function createPaymentId() {
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
      date: invoice.sentAt || new Date().toISOString().slice(0, 10),
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

  return {
    version: 1,
    packages: Array.isArray(data.packages) ? (data.packages as PackageOption[]) : fallback.packages,
    customers: Array.isArray(data.customers) ? (data.customers as Customer[]) : fallback.customers,
    bookings: Array.isArray(data.bookings) ? (data.bookings as Booking[]) : fallback.bookings,
    invoices: parsedInvoices,
    payments: migrateInvoicePayments(
      parsedInvoices,
      Array.isArray(data.payments) ? (data.payments as InvoicePayment[]) : [],
    ),
    financeEntries: Array.isArray(data.financeEntries)
      ? (data.financeEntries as FinanceEntry[])
      : fallback.financeEntries,
    reminders: Array.isArray(data.reminders) ? (data.reminders as Reminder[]) : fallback.reminders,
    notifications: Array.isArray(data.notifications)
      ? (data.notifications as AppNotification[])
      : fallback.notifications,
    businessProfile:
      profile && !Array.isArray(profile) && typeof profile === 'object'
        ? ({ ...fallback.businessProfile, ...(profile as Partial<BusinessProfile>) } as BusinessProfile)
        : fallback.businessProfile,
    currency: currency === 'MYR' || currency === 'IDR' || currency === 'USD' ? currency : fallback.currency,
  };
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { getAccessToken, isAuthenticated, user } = useAuth();
  const supabase = useMemo(
    () => (isSupabaseConfigured ? createClerkSupabaseClient(getAccessToken) : null),
    [getAccessToken],
  );
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [financeEntries, setFinanceEntries] = useState<FinanceEntry[]>([]);
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
  });
  const [currency, setCurrency] = useState<CurrencyCode>('MYR');
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

      const workspace = row ? parseWorkspace(row.data, user) : createFreshWorkspace(user);

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
      setInvoiceDraft(null);
      lastQueuedSnapshotRef.current = JSON.stringify(workspace);
      canSaveRef.current = true;
      loadedUserIdRef.current = user.id;
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
      packages,
      customers,
      bookings,
      invoices,
      payments,
      financeEntries,
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
  }, [bookings, businessProfile, currency, customers, financeEntries, invoices, notifications, packages, payments, reminders, supabase, syncRetryKey, user]);

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
      const paidCents = sumPaymentsInCents(invoicePayments);
      const isSettled = paidCents >= toCents(invoice.amount);
      const client = customers.find((customer) => customer.id === invoice.customerId);
      const entryPrefix = `fin-payment-${invoice.id}-`;

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

      setFinanceEntries((current) => {
        const incomeRows = invoicePayments.map<FinanceEntry>((payment, index) => {
          const isFinalPayment = isSettled && index === invoicePayments.length - 1;
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
            type: 'income' as const,
          };
        });

        // Replace this invoice's income rows, including the single `fin-deposit-` row written
        // before payments became individual records, so nothing is counted twice.
        const untouched = current.filter(
          (entry) => !entry.id.startsWith(entryPrefix) && entry.id !== `fin-deposit-${invoice.id}`,
        );

        return [...incomeRows, ...untouched];
      });
    },
    [customers],
  );

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
      invoices,
      payments,
      financeEntries,
      reminders,
      notifications,
      invoiceDraft,
      businessProfile,
      updateBusinessProfile: (profile: BusinessProfile) => {
        setBusinessProfile(profile);
      },
      currency,
      updateCurrency: (code: CurrencyCode) => {
        setCurrency(code);
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
        const createdInvoice: Invoice = {
          id: `inv-${createdAt}`,
          bookingId: createdBooking.id,
          customerId: resolvedCustomer.id,
          amount: createdBooking.price,
          dueDate: invoiceDueDate,
          status: 'Draft',
          sentAt: new Date().toISOString().slice(0, 10),
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
      addInvoice: (invoice: Omit<Invoice, 'id'>) => {
        if (!invoice.customerId || Number.isNaN(invoice.amount) || invoice.amount <= 0) {
          return;
        }

        setInvoices((current) => [
          {
            ...invoice,
            id: `inv-${Date.now()}`,
            status: invoice.status ?? 'Draft',
          },
          ...current,
        ]);
        setInvoiceDraft(null);
      },
      createInvoiceShareLink: async (invoiceId: string) => {
        if (!supabase || !user) {
          throw new Error('Your Supabase workspace is not connected.');
        }

        const invoice = invoices.find((item) => item.id === invoiceId);
        const customer = invoice ? customers.find((item) => item.id === invoice.customerId) : undefined;
        if (!invoice || !customer) {
          throw new Error('The invoice or customer could not be found.');
        }

        const booking = bookings.find((item) => item.id === invoice.bookingId);
        const serviceName = invoice.serviceName ?? booking?.packageName;
        const packageOption = packages.find((item) => item.name === serviceName);
        const publicStatus =
          invoice.status === 'Accepted' ||
          invoice.status === 'Declined' ||
          invoice.status === 'Paid' ||
          invoice.status === 'Cancelled'
            ? invoice.status
            : 'Sent';
        const payload = {
          invoice: {
            id: invoice.id,
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
          businessProfile,
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
        let invoiceReference: Invoice | undefined;

        setInvoices((current) => {
          invoiceReference = current.find((invoice) => invoice.id === invoiceId);
          return current.map((invoice) => (invoice.id === invoiceId ? { ...invoice, status } : invoice));
        });

        if (status === 'Accepted') {
          setFinanceEntries((current) => {
            const invoice = invoices.find((item) => item.id === invoiceId) ?? invoiceReference;
            if (!invoice || current.some((entry) => entry.description.includes(invoice.id))) {
              return current;
            }

            return [
              {
                id: `fin-${Date.now()}`,
                category: 'Accepted invoice',
                amount: invoice.amount,
                date: new Date().toISOString().slice(0, 10),
                description: `Invoice ${invoice.id} accepted by customer`,
                type: 'income',
              },
              ...current,
            ];
          });
        }

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
        const invoice = invoices.find((item) => item.id === invoiceId);
        if (!invoice || !Number.isFinite(depositPaid) || depositPaid <= 0) {
          return false;
        }

        const otherPayments = payments.filter(
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
          date: details?.date?.trim() || new Date().toISOString().slice(0, 10),
          notes: details?.notes?.trim() || undefined,
          kind: 'deposit',
          recordedAt: new Date().toISOString(),
        };
        const nextPayments = [
          ...payments.filter((payment) => payment.invoiceId !== invoiceId || payment.kind !== 'deposit'),
          depositRecord,
        ];

        applyInvoicePayments(invoice, nextPayments);
        return true;
      },
      recordInvoicePayment: ({ invoiceId, amount, method, date, notes, kind = 'payment' }: RecordInvoicePaymentInput) => {
        const invoice = invoices.find((item) => item.id === invoiceId);
        if (!invoice) {
          return { ok: false, error: 'This invoice could no longer be found.' };
        }

        if (invoice.status === 'Cancelled' || invoice.status === 'Declined') {
          return { ok: false, error: 'Payments cannot be recorded against a closed invoice.' };
        }

        const amountCents = toCents(amount);
        if (!Number.isFinite(amount) || amountCents <= 0) {
          return { ok: false, error: 'Enter a payment amount greater than zero.' };
        }

        const invoicePayments = payments.filter((payment) => payment.invoiceId === invoiceId);
        const outstandingCents = toCents(invoice.amount) - sumPaymentsInCents(invoicePayments);

        if (amountCents > outstandingCents) {
          return { ok: false, error: 'The payment is more than the outstanding balance.' };
        }

        // Each payment stays its own transaction, so history is never overwritten.
        const nextPayments = [
          ...payments,
          {
            id: createPaymentId(),
            invoiceId,
            amount: fromCents(amountCents),
            method: method.trim() || 'Cash',
            date: date.trim() || new Date().toISOString().slice(0, 10),
            notes: notes?.trim() || undefined,
            kind,
            recordedAt: new Date().toISOString(),
          } satisfies InvoicePayment,
        ];

        applyInvoicePayments(invoice, nextPayments);
        return { ok: true };
      },
      addFinanceEntry: (entry: Omit<FinanceEntry, 'id'>) => {
        setFinanceEntries((current) => [
          {
            ...entry,
            id: `fin-${Date.now()}`,
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

        const { error } = await supabase.from('bookflow_workspaces').delete().eq('user_id', user.id);
        if (error) {
          canSaveRef.current = true;
          throw error;
        }
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
        });
        setCurrency('MYR');
      },
    }),
    [
      bookings,
      businessProfile,
      currency,
      customers,
      financeEntries,
      invoiceDraft,
      invoices,
      isLoading,
      loadError,
      notifications,
      packages,
      payments,
      applyInvoicePayments,
      refreshInvoiceStatuses,
      reminders,
      syncError,
      supabase,
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
