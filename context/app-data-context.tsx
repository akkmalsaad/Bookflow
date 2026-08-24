import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth, type AuthUser } from '@/context/auth-context';
import {
  createClerkSupabaseClient,
  getSupabaseFunctionUrl,
  isSupabaseConfigured,
  type Json,
} from '@/lib/supabase';

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
  status: 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Paid' | 'Overdue' | 'Cancelled';
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
  createBooking: (booking: CreateBookingInput) => CreateBookingResult | null;
  addInvoice: (invoice: Omit<Invoice, 'id'>) => void;
  createInvoiceShareLink: (invoiceId: string) => Promise<string>;
  refreshInvoiceStatuses: () => Promise<void>;
  setInvoiceDraft: (draft: InvoiceDraftPrefill | null) => void;
  updateInvoiceStatus: (invoiceId: string, status: Invoice['status']) => void;
  updateInvoiceDeposit: (invoiceId: string, depositPaid: number) => boolean;
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
  financeEntries: FinanceEntry[];
  reminders: Reminder[];
  notifications: AppNotification[];
  businessProfile: BusinessProfile;
  currency: CurrencyCode;
};

function createFreshWorkspace(user: AuthUser): PersistedAppData {
  return {
    version: 1,
    packages: initialPackages,
    customers: [],
    bookings: [],
    invoices: [],
    financeEntries: [],
    reminders: [],
    notifications: [],
    businessProfile: {
      name: '',
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

  return {
    version: 1,
    packages: Array.isArray(data.packages) ? (data.packages as PackageOption[]) : fallback.packages,
    customers: Array.isArray(data.customers) ? (data.customers as Customer[]) : fallback.customers,
    bookings: Array.isArray(data.bookings) ? (data.bookings as Booking[]) : fallback.bookings,
    invoices: Array.isArray(data.invoices) ? (data.invoices as Invoice[]) : fallback.invoices,
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
  const [financeEntries, setFinanceEntries] = useState<FinanceEntry[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraftPrefill | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>({
    name: '',
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
  const lastQueuedSnapshotRef = useRef('');
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let isCancelled = false;
    canSaveRef.current = false;

    if (!isAuthenticated || !user) {
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

    setIsLoading(true);
    setLoadError(null);
    setSyncError(null);

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
      setBookings(workspace.bookings);
      setInvoices(workspace.invoices);
      setFinanceEntries(workspace.financeEntries);
      setReminders(workspace.reminders);
      setNotifications(workspace.notifications);
      setBusinessProfile(workspace.businessProfile);
      setCurrency(workspace.currency);
      setInvoiceDraft(null);
      lastQueuedSnapshotRef.current = JSON.stringify(workspace);
      canSaveRef.current = true;
      setIsLoading(false);
    };

    loadWorkspace().catch((error: unknown) => {
      if (isCancelled) return;
      setIsLoading(false);
      setLoadError(error instanceof Error ? error.message : 'Bookflow could not load your Supabase workspace.');
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
  }, [bookings, businessProfile, currency, customers, financeEntries, invoices, notifications, packages, reminders, supabase, syncRetryKey, user]);

  const refreshInvoiceStatuses = useCallback(async () => {
    if (!supabase || !user) return;

    const { data, error } = await supabase
      .from('public_invoice_links')
      .select('invoice_id,status')
      .eq('user_id', user.id);
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
        if (nextStatus && nextStatus !== invoice.status) {
          hasChanges = true;
          return { ...invoice, status: nextStatus };
        }
        return invoice;
      });
      return hasChanges ? next : current;
    });
  }, [supabase, user]);

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
      createBooking: (booking: CreateBookingInput) => {
        const safeTitle = booking.title.trim();
        const safeNewCustomerName = booking.newCustomer?.name.trim() ?? '';
        const safeNewCustomerEmail = booking.newCustomer?.email.trim() ?? '';
        const existingCustomer = customers.find((customer) => customer.id === booking.customerId);

        if (
          !safeTitle ||
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
          time: booking.startTime?.trim() || booking.time?.trim() || 'Not specified',
          startTime: booking.startTime?.trim() || booking.time?.trim() || 'Not specified',
          endTime: booking.endTime?.trim() || 'Not specified',
          location: booking.location.trim(),
          packageName: booking.packageName,
          price: booking.price,
          status: booking.status,
          notes: booking.notes.trim() || 'Booking created from the app.',
        };
        const invoiceDueDate = new Date(new Date(`${booking.date}T00:00:00`).getTime() + 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
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
        setBookings((current) => [createdBooking, ...current]);
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
      updateInvoiceDeposit: (invoiceId: string, depositPaid: number) => {
        const invoice = invoices.find((item) => item.id === invoiceId);

        if (!invoice || !Number.isFinite(depositPaid) || depositPaid <= 0 || depositPaid > invoice.amount) {
          return false;
        }

        setInvoices((current) =>
          current.map((item) =>
            item.id === invoiceId
              ? {
                  ...item,
                  depositPaid,
                  status: depositPaid === item.amount ? 'Paid' : item.status,
                }
            : item,
          ),
        );

        const client = customers.find((customer) => customer.id === invoice.customerId);
        const isFullPayment = depositPaid === invoice.amount;
        const paymentCategory = isFullPayment ? 'Full payment' : 'Invoice deposit';
        const paymentLabel = isFullPayment ? 'Full payment received' : 'Deposit received';
        const depositDescription = client
          ? `${paymentLabel} ${client.name}\nFor Invoice ${invoiceId}`
          : `${paymentLabel}\nFor Invoice ${invoiceId}`;
        const depositEntryId = `fin-deposit-${invoiceId}`;
        setFinanceEntries((current) => {
          const existingDeposit = current.find((entry) => entry.id === depositEntryId);

          if (existingDeposit) {
            return current.map((entry) =>
              entry.id === depositEntryId
                ? {
                    ...entry,
                    amount: depositPaid,
                    category: paymentCategory,
                    description: depositDescription,
                  }
                : entry,
            );
          }

          return [
            {
              id: depositEntryId,
              category: paymentCategory,
              amount: depositPaid,
              date: new Date().toISOString().slice(0, 10),
              description: depositDescription,
              type: 'income',
            },
            ...current,
          ];
        });
        return true;
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
        setBookings([]);
        setInvoices([]);
        setFinanceEntries([]);
        setReminders([]);
        setNotifications([]);
        setInvoiceDraft(null);
        setBusinessProfile({ name: '', nature: '', phone: '', email: '', address: '' });
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
