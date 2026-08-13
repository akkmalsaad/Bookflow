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
  price: number;
  notes?: string;
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

export type InvoiceDraftPrefill = {
  customerId: string;
  amount: number;
  dueDate: string;
  bookingId?: string;
};

type AppDataContextValue = {
  packages: PackageOption[];
  customers: Customer[];
  bookings: Booking[];
  invoices: Invoice[];
  financeEntries: FinanceEntry[];
  reminders: Reminder[];
  invoiceDraft: InvoiceDraftPrefill | null;
  businessProfile: { name: string; email?: string; phone?: string };
  updateBusinessProfile: (profile: { name: string; email?: string; phone?: string }) => void;
  addPackage: (name: string, price: number, notes?: string) => void;
  updatePackage: (id: string, updates: Partial<PackageOption>) => void;
  removePackage: (id: string) => void;
  addCustomer: (customer: Omit<Customer, 'id'>) => void;
  addBooking: (booking: Omit<Booking, 'id'>) => void;
  addInvoice: (invoice: Omit<Invoice, 'id'>) => void;
  setInvoiceDraft: (draft: InvoiceDraftPrefill | null) => void;
  updateInvoiceStatus: (invoiceId: string, status: Invoice['status']) => void;
  addFinanceEntry: (entry: Omit<FinanceEntry, 'id'>) => void;
  addReminder: (reminder: Omit<Reminder, 'id'>) => void;
  markReminderSent: (reminderId: string) => void;
};

const initialPackages: PackageOption[] = [
  { id: 'pkg-1', name: 'Wedding Package', price: 3200, notes: '' },
  { id: 'pkg-2', name: 'Family Session', price: 850, notes: '' },
  { id: 'pkg-3', name: 'Commercial Day Rate', price: 4200, notes: '' },
];

const initialReminders: Reminder[] = [
  { id: 'rem-1', title: 'Wedding reminder', dueDate: '2026-08-16', channel: 'email', status: 'scheduled' },
  { id: 'rem-2', title: 'Invoice follow-up', dueDate: '2026-08-10', channel: 'whatsapp', status: 'scheduled' },
  { id: 'rem-3', title: 'Booking confirmation', dueDate: '2026-08-20', channel: 'sms', status: 'sent' },
];

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [packages, setPackages] = useState<PackageOption[]>(initialPackages);
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [financeEntries, setFinanceEntries] = useState<FinanceEntry[]>(initialFinanceEntries);
  const [reminders, setReminders] = useState<Reminder[]>(initialReminders);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraftPrefill | null>(null);
  const [businessProfile, setBusinessProfile] = useState({ name: 'Lena Hart Photography', email: 'lena@example.com', phone: '' });

  const value = useMemo<AppDataContextValue>(
    () => ({
      packages,
      customers,
      bookings,
      invoices,
      financeEntries,
      reminders,
      invoiceDraft,
    businessProfile,
    updateBusinessProfile: (profile: { name: string; email?: string; phone?: string }) => {
      setBusinessProfile(profile);
    },
    addPackage: (name: string, price: number, notes?: string) => {
        if (!name.trim() || Number.isNaN(price) || price <= 0) {
          return;
        }

        setPackages((current) => [
          ...current,
          {
            id: `pkg-${Date.now()}`,
            name: name.trim(),
            price,
            notes: notes ?? '',
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
          return;
        }

        setCustomers((current) => [
          ...current,
          {
            ...customer,
            id: `cust-${Date.now()}`,
            name: safeName,
            email: safeEmail,
          },
        ]);
      },
      addBooking: (booking: Omit<Booking, 'id'>) => {
        if (!booking.title.trim() || !booking.customerId) {
          return;
        }

        const createdBooking = {
          ...booking,
          id: `bk-${Date.now()}`,
          title: booking.title.trim(),
          notes: booking.notes.trim() || 'Booking created from the app.',
        };

        setBookings((current) => [createdBooking, ...current]);
        setReminders((current) => [
          {
            id: `rem-${Date.now()}`,
            title: `${booking.title.trim()} reminder`,
            dueDate: booking.date,
            channel: 'email',
            status: 'scheduled',
          },
          ...current,
        ]);
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
    }),
    [bookings, customers, financeEntries, invoiceDraft, invoices, packages, reminders],
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
