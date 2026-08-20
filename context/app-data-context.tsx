import React, { createContext, useContext, useMemo, useState } from 'react';

import {
  bookings as initialBookings,
  customers as initialCustomers,
  financeEntries as initialFinanceEntries,
  invoices as initialInvoices,
} from '@/data/mockData';

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
  setInvoiceDraft: (draft: InvoiceDraftPrefill | null) => void;
  updateInvoiceStatus: (invoiceId: string, status: Invoice['status']) => void;
  addFinanceEntry: (entry: Omit<FinanceEntry, 'id'>) => void;
  addReminder: (reminder: Omit<Reminder, 'id'>) => void;
  markReminderSent: (reminderId: string) => void;
  markNotificationOpened: (notificationId: string) => void;
  markAllNotificationsOpened: () => void;
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

const initialReminders: Reminder[] = [
  { id: 'rem-1', title: 'Akad nikah reminder', dueDate: '2026-08-16', channel: 'email', status: 'scheduled' },
  { id: 'rem-2', title: 'Invoice follow-up', dueDate: '2026-08-10', channel: 'whatsapp', status: 'scheduled' },
  { id: 'rem-3', title: 'Booking confirmation', dueDate: '2026-08-20', channel: 'sms', status: 'sent' },
];

const initialNotifications: AppNotification[] = [
  {
    id: 'notification-1',
    title: 'Invoice accepted',
    message: 'Priya Nair accepted invoice inv-103.',
    createdAt: '2026-08-13T09:30:00.000Z',
    isOpened: false,
    type: 'invoice',
  },
  {
    id: 'notification-2',
    title: 'Invoice overdue',
    message: 'Invoice inv-104 for Daniel Tan Wei Ming is now overdue.',
    createdAt: '2026-08-12T08:15:00.000Z',
    isOpened: false,
    type: 'invoice',
  },
  {
    id: 'notification-3',
    title: 'Booking coming up',
    message: 'Akad Nikah & Reception is scheduled for 18 August.',
    createdAt: '2026-08-11T04:00:00.000Z',
    isOpened: true,
    type: 'booking',
  },
];

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [packages, setPackages] = useState<PackageOption[]>(initialPackages);
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [financeEntries, setFinanceEntries] = useState<FinanceEntry[]>(initialFinanceEntries);
  const [reminders, setReminders] = useState<Reminder[]>(initialReminders);
  const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraftPrefill | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>({
    name: 'Studio Lensa KL',
    nature: 'Photographer',
    phone: '',
    email: '',
    address: '',
  });
  const [currency, setCurrency] = useState<CurrencyCode>('MYR');

  const value = useMemo<AppDataContextValue>(
    () => ({
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
    }),
    [bookings, businessProfile, currency, customers, financeEntries, invoiceDraft, invoices, notifications, packages, reminders],
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
