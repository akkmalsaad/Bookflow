import type { Booking, Customer, Invoice } from '@/context/app-data-context';

/**
 * What the Free plan allows. The one place these numbers exist: every screen and every mutation
 * asks this module rather than carrying its own copy of the rules.
 */
export const FREE_LIMITS = {
  customers: 5,
  bookingsPerMonth: 3,
  invoicesPerMonth: 3,
} as const;

export type LimitKind = 'customers' | 'bookings' | 'invoices';

/** `null` means unlimited, which is what an active Pro entitlement gets for every kind. */
export type PlanLimits = {
  customers: number | null;
  bookingsPerMonth: number | null;
  invoicesPerMonth: number | null;
};

export type PlanUsage = {
  customers: number;
  bookingsThisMonth: number;
  invoicesThisMonth: number;
};

export type LimitCheck =
  | { allowed: true }
  | { allowed: false; kind: LimitKind; used: number; limit: number };

export function getPlanLimits(isPro: boolean): PlanLimits {
  return isPro
    ? { customers: null, bookingsPerMonth: null, invoicesPerMonth: null }
    : { ...FREE_LIMITS };
}

/**
 * The calendar month a date belongs to, read in the device's own timezone.
 *
 * Deliberately not UTC: a booking made at 00:30 on the 1st in Malaysia (UTC+8) is still the
 * previous month in UTC, which would let a new month start with its allowance already spent.
 */
export function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** The month a stored `YYYY-MM-DD` day key belongs to. */
function monthKeyFromDayKey(value: string | undefined) {
  const match = value?.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : null;
}

/**
 * When a record was created, from the field that holds it or — for records saved before that field
 * existed — the millisecond timestamp inside its generated id.
 */
export function getRecordMonthKey(record: { id: string; createdAt?: string; sentAt?: string }) {
  const stored = monthKeyFromDayKey(record.createdAt ?? record.sentAt);
  if (stored) return stored;

  const timestamp = Number(record.id.match(/(?:^|-)(\d{13})(?:-|$)/)?.[1]);
  if (!Number.isFinite(timestamp)) return null;

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : getMonthKey(date);
}

/** Every customer on the workspace. Deleting one frees the allowance; nothing is ever hidden. */
export function getCustomerUsage(customers: Customer[]) {
  return customers.length;
}

/**
 * Bookings created this calendar month.
 *
 * Cancelled bookings still count: the allowance is spent when the booking is made, so cancelling
 * and re-booking cannot be used to get a fourth one.
 */
export function getMonthlyBookingUsage(bookings: Booking[], now = new Date()) {
  const month = getMonthKey(now);
  return bookings.filter((booking) => getRecordMonthKey(booking) === month).length;
}

/**
 * Invoices created this calendar month, counted from the complete record — Dustbin included — so
 * creating an invoice, trashing it and creating another cannot get past the limit. A restore does
 * not count the same invoice twice: it is the same record, with the same id.
 */
export function getMonthlyInvoiceUsage(invoices: Invoice[], now = new Date()) {
  const month = getMonthKey(now);
  return invoices.filter((invoice) => getRecordMonthKey(invoice) === month).length;
}

export function getPlanUsage(
  { customers, bookings, invoices }: { customers: Customer[]; bookings: Booking[]; invoices: Invoice[] },
  now = new Date(),
): PlanUsage {
  return {
    customers: getCustomerUsage(customers),
    bookingsThisMonth: getMonthlyBookingUsage(bookings, now),
    invoicesThisMonth: getMonthlyInvoiceUsage(invoices, now),
  };
}

function check(kind: LimitKind, used: number, limit: number | null): LimitCheck {
  if (limit === null || used < limit) return { allowed: true };
  return { allowed: false, kind, used, limit };
}

export function canCreateCustomer(isPro: boolean, customers: Customer[]): LimitCheck {
  return check('customers', getCustomerUsage(customers), getPlanLimits(isPro).customers);
}

export function canCreateBooking(isPro: boolean, bookings: Booking[], now = new Date()): LimitCheck {
  return check('bookings', getMonthlyBookingUsage(bookings, now), getPlanLimits(isPro).bookingsPerMonth);
}

export function canCreateInvoice(isPro: boolean, invoices: Invoice[], now = new Date()): LimitCheck {
  return check('invoices', getMonthlyInvoiceUsage(invoices, now), getPlanLimits(isPro).invoicesPerMonth);
}

/** The upgrade copy for each limit, so every entry point into the paywall says the same thing. */
export const LIMIT_COPY: Record<LimitKind, { title: string; body: string }> = {
  customers: {
    title: 'Ready for more clients?',
    body: `You've reached the Free plan limit of ${FREE_LIMITS.customers} clients. Upgrade to Pro to manage unlimited clients.`,
  },
  bookings: {
    title: 'Your business is growing',
    body: `You've used your ${FREE_LIMITS.bookingsPerMonth} Free bookings this month. Upgrade to BookFlow Pro for unlimited bookings.`,
  },
  invoices: {
    title: 'Keep your business moving',
    body: `You've used your ${FREE_LIMITS.invoicesPerMonth} Free invoices this month. Upgrade to Pro for unlimited invoicing.`,
  },
};

export function isLimitKind(value: string | undefined): value is LimitKind {
  return value === 'customers' || value === 'bookings' || value === 'invoices';
}
