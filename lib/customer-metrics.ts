import type { Booking, Customer, Invoice, InvoicePayment, PackageOption } from '@/context/app-data-context';
import { getInvoicePaymentSummary } from '@/lib/invoice-payments';

export type StatusTone = 'blue' | 'green' | 'amber' | 'red' | 'gray';

export type BookingBadge = {
  label: string;
  tone: StatusTone;
};

export type CustomerMetrics = {
  bookingCount: number;
  revenue: number;
  outstanding: number;
  lastBookingDate: string | null;
};

export type CustomerSortKey = 'recent' | 'name' | 'bookings' | 'spending' | 'lastBooking';

export const customerSortOptions: { key: CustomerSortKey; label: string }[] = [
  { key: 'recent', label: 'Recently added' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'bookings', label: 'Most bookings' },
  { key: 'spending', label: 'Highest spending' },
  { key: 'lastBooking', label: 'Recent booking' },
];

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `Izzati` -> `IZ`, `Nur Aisyah Rahman` -> `NA`. */
export function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

/** Money actually received against an invoice, from its payment records. */
export function getInvoiceCollected(invoice: Invoice, payments: InvoicePayment[]) {
  return getInvoicePaymentSummary(invoice, payments).amountPaid;
}

/**
 * Money still owed on an invoice. Closed invoices owe nothing; drafts still count, because a
 * booking always generates one and the balance is genuinely outstanding.
 */
export function getInvoiceOutstanding(invoice: Invoice, payments: InvoicePayment[]) {
  if (invoice.status === 'Declined' || invoice.status === 'Cancelled') {
    return 0;
  }

  return getInvoicePaymentSummary(invoice, payments).outstanding;
}

export function getCustomerMetrics(
  customerId: string,
  bookings: Booking[],
  invoices: Invoice[],
  payments: InvoicePayment[],
): CustomerMetrics {
  const customerBookings = bookings.filter((booking) => booking.customerId === customerId);
  const customerInvoices = invoices.filter((invoice) => invoice.customerId === customerId);

  return {
    bookingCount: customerBookings.length,
    revenue: customerInvoices.reduce((total, invoice) => total + getInvoiceCollected(invoice, payments), 0),
    outstanding: customerInvoices.reduce((total, invoice) => total + getInvoiceOutstanding(invoice, payments), 0),
    lastBookingDate: customerBookings.reduce<string | null>(
      (latest, booking) => (!latest || booking.date > latest ? booking.date : latest),
      null,
    ),
  };
}

export function matchesCustomerSearch(customer: Customer, searchTerm: string) {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return true;

  const digits = term.replace(/\D/g, '');
  const phoneDigits = customer.phone.replace(/\D/g, '');

  return (
    customer.name.toLowerCase().includes(term) ||
    customer.email.toLowerCase().includes(term) ||
    customer.phone.toLowerCase().includes(term) ||
    (digits.length > 0 && phoneDigits.includes(digits))
  );
}

export function sortCustomers(
  customers: Customer[],
  sortKey: CustomerSortKey,
  metricsById: Map<string, CustomerMetrics>,
) {
  const order = new Map(customers.map((customer, index) => [customer.id, index]));
  const metricsFor = (customer: Customer) =>
    metricsById.get(customer.id) ?? { bookingCount: 0, revenue: 0, outstanding: 0, lastBookingDate: null };

  return [...customers].sort((first, second) => {
    switch (sortKey) {
      case 'name':
        return first.name.localeCompare(second.name);
      case 'bookings':
        return metricsFor(second).bookingCount - metricsFor(first).bookingCount;
      case 'spending':
        return metricsFor(second).revenue - metricsFor(first).revenue;
      case 'lastBooking': {
        const firstDate = metricsFor(first).lastBookingDate ?? '';
        const secondDate = metricsFor(second).lastBookingDate ?? '';
        if (firstDate === secondDate) break;
        return secondDate.localeCompare(firstDate);
      }
      default:
        break;
    }

    // Newest record first: addCustomer appends, so a later index is a later signup.
    return (order.get(second.id) ?? 0) - (order.get(first.id) ?? 0);
  });
}

function bookingSortValue(booking: Booking) {
  return `${booking.date} ${booking.startTime ?? booking.time ?? '00:00'}`;
}

/** Upcoming first (soonest date first), then past bookings (most recent first). */
export function groupCustomerBookings(bookings: Booking[], todayKey: string) {
  const upcoming = bookings
    .filter((booking) => booking.date >= todayKey)
    .sort((first, second) => bookingSortValue(first).localeCompare(bookingSortValue(second)));
  const past = bookings
    .filter((booking) => booking.date < todayKey)
    .sort((first, second) => bookingSortValue(second).localeCompare(bookingSortValue(first)));

  return { upcoming, past };
}

/** Schedule state, derived from the booking's own status plus its event date. */
export function getBookingScheduleBadge(booking: Booking, todayKey: string): BookingBadge {
  if (booking.status === 'Cancelled') return { label: 'Cancelled', tone: 'gray' };
  if (booking.status === 'Completed') return { label: 'Completed', tone: 'green' };
  if (booking.status === 'Inquiry') return { label: 'Pending', tone: 'amber' };
  if (booking.date >= todayKey) return { label: 'Upcoming', tone: 'blue' };

  return { label: 'Confirmed', tone: 'gray' };
}

export type PaymentStatus = 'Unpaid' | 'Deposit Paid' | 'Partially Paid' | 'Paid';

export type BookingPaymentState = {
  invoice: Invoice | null;
  status: PaymentStatus;
  tone: StatusTone;
  totalAmount: number;
  amountPaid: number;
  outstanding: number;
  depositAmount: number | null;
  isDepositPaid: boolean;
};

/**
 * The deposit a package asks for, read off the package's own terms (e.g. "A 30% booking deposit
 * is required."). Null when the package does not configure one.
 */
export function getBookingDepositAmount(booking: Booking, packages: PackageOption[], totalAmount: number) {
  const bookingPackage = packages.find((item) => item.name === booking.packageName);
  if (!bookingPackage) return null;

  const percentage =
    /(\d+(?:\.\d+)?)\s*%[^.]*deposit/i.exec(bookingPackage.info) ??
    /deposit[^.]*?(\d+(?:\.\d+)?)\s*%/i.exec(bookingPackage.info);

  if (!percentage) return null;

  const deposit = Math.round((totalAmount * Number(percentage[1])) / 100);
  return deposit > 0 ? deposit : null;
}

/**
 * Payment state for one booking, kept separate from the booking's schedule status. Amounts come
 * from the booking's invoice, so they stay in step with the customer summary totals.
 */
export function getBookingPaymentState(
  booking: Booking,
  invoices: Invoice[],
  packages: PackageOption[],
  payments: InvoicePayment[],
): BookingPaymentState {
  const invoice = invoices.find((item) => item.bookingId === booking.id) ?? null;
  const totalAmount = invoice?.amount ?? booking.price;
  const amountPaid = invoice ? getInvoiceCollected(invoice, payments) : 0;
  const outstanding = invoice ? getInvoiceOutstanding(invoice, payments) : 0;
  const depositAmount = getBookingDepositAmount(booking, packages, totalAmount);

  let status: PaymentStatus = 'Unpaid';
  if (amountPaid <= 0) {
    status = 'Unpaid';
  } else if (amountPaid >= totalAmount) {
    status = 'Paid';
  } else if (depositAmount && amountPaid >= depositAmount) {
    status = 'Deposit Paid';
  } else {
    status = 'Partially Paid';
  }

  const tone: StatusTone = status === 'Paid' ? 'green' : status === 'Deposit Paid' ? 'blue' : 'amber';

  return {
    invoice,
    status,
    tone,
    totalAmount,
    amountPaid,
    outstanding,
    depositAmount,
    isDepositPaid: Boolean(depositAmount && amountPaid >= depositAmount),
  };
}

/** Digits-only international number, as WhatsApp deep links require. */
export function toWhatsAppNumber(phone: string) {
  return phone.replace(/\D/g, '');
}
