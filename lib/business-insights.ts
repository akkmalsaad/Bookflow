import type {
  Booking,
  Customer,
  FinanceEntry,
  Invoice,
  InvoicePayment,
} from '@/context/app-data-context';
import {
  getFinanceEntriesForBounds,
  getFinancialMetrics,
  getFinancialPeriodBounds,
  getInvoiceFinancialDate,
  getOutstandingInvoiceBalances,
  isActiveInvoice,
  isWithinFinancialBounds,
} from '@/lib/financial-metrics';

export type InsightsPeriod = 'this-month' | 'last-month' | 'last-3-months' | 'last-6-months' | 'this-year';

export const INSIGHTS_PERIODS: { id: InsightsPeriod; label: string }[] = [
  { id: 'this-month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'last-3-months', label: 'Last 3 Months' },
  { id: 'last-6-months', label: 'Last 6 Months' },
  { id: 'this-year', label: 'This Year' },
];

export type InsightsBounds = {
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
};

export type BusinessInsight = {
  id: string;
  tone: 'positive' | 'attention' | 'service' | 'client' | 'expense';
  message: string;
};

export type ExpenseCategoryMetric = {
  category: string;
  amount: number;
  share: number;
  change: number | null;
};

export type BusinessInsightsMetrics = {
  bounds: InsightsBounds;
  hasData: boolean;
  revenue: number;
  expenses: number;
  profit: number;
  outstanding: number;
  overdue: number;
  outstandingInvoiceCount: number;
  overdueInvoiceCount: number;
  revenueChange: number | null;
  expenseChange: number | null;
  profitChange: number | null;
  bookings: number;
  bookingChange: number | null;
  completedBookings: number;
  completionRate: number | null;
  newClients: number;
  newClientChange: number | null;
  repeatClients: number;
  repeatClientRate: number | null;
  averageBookingValue: number | null;
  topService: { name: string; amount: number; share: number } | null;
  topClient: { name: string; amount: number } | null;
  expenseCategories: ExpenseCategoryMetric[];
  insights: BusinessInsight[];
  /** The strongest three practical next steps for this period, most impactful first. */
  opportunities: BusinessInsight[];
  trends: {
    income: number[];
    profit: number[];
    outstanding: number[];
    overdue: number[];
  };
};

type MetricsInput = {
  period: InsightsPeriod;
  financeEntries: FinanceEntry[];
  bookings: Booking[];
  customers: Customer[];
  invoices: Invoice[];
  payments: InvoicePayment[];
  formatCurrency: (amount: number) => string;
  now?: Date;
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localDate(key: string) {
  const [year, month, day] = key.slice(0, 10).split('-').map(Number);
  return new Date(year, Math.max(0, (month || 1) - 1), day || 1, 12);
}

function shiftDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function differenceInDays(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / 86_400_000);
}

export function getInsightsBounds(period: InsightsPeriod, now = new Date()): InsightsBounds {
  const current = getFinancialPeriodBounds(period === 'this-year' ? 'year-to-date' : period, now);
  const start = localDate(current.start);
  const end = localDate(current.end);

  const duration = differenceInDays(start, end) + 1;
  const previousEnd = shiftDays(start, -1);
  const previousStart = shiftDays(previousEnd, -(duration - 1));

  return {
    start: current.start,
    end: current.end,
    previousStart: dateKey(previousStart),
    previousEnd: dateKey(previousEnd),
  };
}

function isWithin(value: string | undefined, start: string, end: string) {
  return isWithinFinancialBounds(value, { start, end });
}

function getCreatedDate(record: { id: string; createdAt?: string }) {
  if (record.createdAt) return record.createdAt;

  const timestamp = Number(record.id.match(/(?:^|-)(\d{13})(?:-|$)/)?.[1]);
  if (!Number.isFinite(timestamp)) return undefined;

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : dateKey(date);
}

function isOnOrBefore(value: string | undefined, end: string) {
  return Boolean(value && value.slice(0, 10) <= end);
}

function percentageChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/**
 * One opportunity before it is ranked. `weight` is business impact: money already at risk outranks
 * growth ideas, which outrank scheduling observations.
 */
type OpportunityCandidate = BusinessInsight & { weight: number };

function percentage(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function groupAmounts<T>(items: T[], getKey: (item: T) => string | undefined, getAmount: (item: T) => number) {
  const totals = new Map<string, number>();
  items.forEach((item) => {
    const key = getKey(item)?.trim();
    const amount = getAmount(item);
    if (!key || !Number.isFinite(amount) || amount <= 0) return;
    totals.set(key, (totals.get(key) ?? 0) + amount);
  });
  return totals;
}

function buildTrend(
  start: string,
  end: string,
  items: { date: string; amount: number }[],
  buckets = 8,
) {
  const startDate = localDate(start);
  const endDate = localDate(end);
  const span = Math.max(1, differenceInDays(startDate, endDate) + 1);
  const values = Array.from({ length: buckets }, () => 0);

  items.forEach((item) => {
    if (!isWithin(item.date, start, end)) return;
    const offset = Math.max(0, differenceInDays(startDate, localDate(item.date)));
    const index = Math.min(buckets - 1, Math.floor((offset / span) * buckets));
    values[index] += Number.isFinite(item.amount) ? item.amount : 0;
  });

  return values;
}

export function calculateBusinessInsights({
  period,
  financeEntries,
  bookings,
  customers,
  invoices,
  payments,
  formatCurrency,
  now = new Date(),
}: MetricsInput): BusinessInsightsMetrics {
  const bounds = getInsightsBounds(period, now);
  const currentBounds = { start: bounds.start, end: bounds.end };
  const previousBounds = { start: bounds.previousStart, end: bounds.previousEnd };
  const currentEntries = getFinanceEntriesForBounds(financeEntries, currentBounds);
  const previousEntries = getFinanceEntriesForBounds(financeEntries, previousBounds);
  const incomeEntries = currentEntries.filter((entry) => entry.type === 'income');
  const expenseEntries = currentEntries.filter((entry) => entry.type === 'expense');
  const previousExpenseEntries = previousEntries.filter((entry) => entry.type === 'expense');

  const currentFinancials = getFinancialMetrics({
    financeEntries,
    invoices,
    payments,
    bounds: currentBounds,
  });
  const previousFinancials = getFinancialMetrics({
    financeEntries,
    invoices,
    payments,
    bounds: previousBounds,
  });
  const revenue = currentFinancials.revenue;
  const expenses = currentFinancials.expenses;
  const previousRevenue = previousFinancials.revenue;
  const previousExpenses = previousFinancials.expenses;
  const profit = currentFinancials.netProfit;
  const previousProfit = previousFinancials.netProfit;

  const invoicesWithBalances = getOutstandingInvoiceBalances(invoices, payments, currentBounds);
  const periodInvoices = invoicesWithBalances.map(({ invoice }) => invoice);
  const outstandingInvoices = invoicesWithBalances.filter(({ balance }) => balance > 0);
  const overdueInvoices = outstandingInvoices.filter(({ invoice }) => isOnOrBefore(invoice.dueDate, bounds.end));
  const outstanding = currentFinancials.outstanding;
  const overdue = overdueInvoices.reduce((total, item) => total + item.balance, 0);

  // Booking performance is acquisition activity, so it follows the date the booking was made—not
  // the event date, which may be months in the future. Timestamp-based legacy ids are a safe
  // fallback for workspaces created before `createdAt` was stored explicitly.
  const validBookings = bookings.filter((booking) => booking.status !== 'Cancelled');
  const periodBookings = validBookings.filter((booking) =>
    isWithin(getCreatedDate(booking), bounds.start, bounds.end),
  );
  const previousBookings = validBookings.filter((booking) =>
    isWithin(getCreatedDate(booking), bounds.previousStart, bounds.previousEnd),
  );
  const completedBookings = periodBookings.filter((booking) => booking.status === 'Completed').length;
  const bookingsPerClient = groupAmounts(periodBookings, (booking) => booking.customerId, () => 1);
  const allBookingsPerClient = groupAmounts(validBookings, (booking) => booking.customerId, () => 1);
  const repeatClients = Array.from(bookingsPerClient.keys()).filter(
    (customerId) => (allBookingsPerClient.get(customerId) ?? 0) > 1,
  ).length;
  const periodClients = customers.filter((customer) =>
    isWithin(getCreatedDate(customer), bounds.start, bounds.end),
  );
  const previousClients = customers.filter((customer) =>
    isWithin(getCreatedDate(customer), bounds.previousStart, bounds.previousEnd),
  );

  // Booking-linked revenue must come from explicit payment records. Manual ledger income cannot be
  // attributed to a booking without guessing, so it remains part of revenue but not service/client metrics.
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const bookingById = new Map(bookings.map((booking) => [booking.id, booking]));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const periodPayments = payments.filter((payment) => isWithin(payment.date, bounds.start, bounds.end));
  const attributablePayments = periodPayments.flatMap((payment) => {
    const invoice = invoiceById.get(payment.invoiceId);
    if (!invoice || !isActiveInvoice(invoice)) return [];
    const booking = bookingById.get(invoice.bookingId);
    const service = invoice.serviceName || booking?.packageName;
    return [{ payment, invoice, booking, service }];
  });
  const attributableRevenue = attributablePayments.reduce((total, item) => total + item.payment.amount, 0);
  const applicableBookingIds = new Set(
    attributablePayments.map((item) => item.booking?.id).filter((id): id is string => Boolean(id)),
  );

  const serviceTotals = groupAmounts(
    attributablePayments,
    (item) => item.service,
    (item) => item.payment.amount,
  );
  const topServiceEntry = Array.from(serviceTotals.entries()).sort((a, b) => b[1] - a[1])[0];
  const topService = topServiceEntry
    ? { name: topServiceEntry[0], amount: topServiceEntry[1], share: percentage(topServiceEntry[1], attributableRevenue) }
    : null;

  const clientTotals = groupAmounts(
    attributablePayments,
    (item) => customerById.get(item.invoice.customerId)?.name,
    (item) => item.payment.amount,
  );
  const topClientEntry = Array.from(clientTotals.entries()).sort((a, b) => b[1] - a[1])[0];
  const topClient = topClientEntry ? { name: topClientEntry[0], amount: topClientEntry[1] } : null;

  const currentExpenseTotals = groupAmounts(expenseEntries, (entry) => entry.category, (entry) => entry.amount);
  const previousExpenseTotals = groupAmounts(previousExpenseEntries, (entry) => entry.category, (entry) => entry.amount);
  const expenseCategories = Array.from(currentExpenseTotals.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      share: percentage(amount, expenses),
      change: percentageChange(amount, previousExpenseTotals.get(category) ?? 0),
    }))
    .sort((a, b) => b.amount - a.amount);

  const revenueChange = percentageChange(revenue, previousRevenue);
  const expenseChange = percentageChange(expenses, previousExpenses);
  const profitChange = percentageChange(profit, previousProfit);
  const bookingChange = percentageChange(periodBookings.length, previousBookings.length);
  const newClientChange = percentageChange(periodClients.length, previousClients.length);
  const insights: BusinessInsight[] = [];

  if (overdue > 0) {
    insights.push({
      id: 'overdue',
      tone: 'attention',
      message: `You have ${formatCurrency(overdue)} overdue from ${overdueInvoices.length} ${overdueInvoices.length === 1 ? 'invoice' : 'invoices'}.`,
    });
  }
  if (revenueChange != null && revenueChange < -10) {
    insights.push({
      id: 'revenue-down',
      tone: 'attention',
      message: `Your revenue decreased ${Math.abs(Math.round(revenueChange))}% compared with the previous period.`,
    });
  } else if (revenueChange != null && revenueChange > 0) {
    insights.push({
      id: 'revenue-up',
      tone: 'positive',
      message: `Your revenue increased ${Math.round(revenueChange)}% compared with the previous period.`,
    });
  }
  if (profitChange != null && profitChange < -10) {
    insights.push({
      id: 'profit-down',
      tone: 'attention',
      message: `Your profit decreased ${Math.abs(Math.round(profitChange))}% compared with the previous period.`,
    });
  }
  if (topService && topService.share >= 25) {
    insights.push({
      id: 'top-service',
      tone: 'service',
      message: `${topService.name} generated ${Math.round(topService.share)}% of your booking-linked revenue.`,
    });
  }
  if (repeatClients > 0) {
    insights.push({
      id: 'repeat-clients',
      tone: 'client',
      message: `${repeatClients} of your clients booked you more than once in this period.`,
    });
  }
  const risingExpense = expenseCategories.find((category) => category.change != null && category.change >= 20);
  if (risingExpense) {
    insights.push({
      id: 'expense-rise',
      tone: 'expense',
      message: `Your ${risingExpense.category.toLowerCase()} expenses increased ${Math.round(risingExpense.change ?? 0)}% this period.`,
    });
  }

  /**
   * Business Opportunities.
   *
   * Every candidate is built from the records already gathered above for the selected period, so
   * these can never disagree with the numbers on the rest of the screen. Revenue attributed to a
   * service or a client is the same "booking-linked revenue" the insights use — payments received
   * in the period against an active invoice — and never a second definition.
   *
   * Each rule carries a minimum sample so a single booking cannot produce a confident-sounding
   * percentage, and the three strongest survive.
   */
  const candidates: OpportunityCandidate[] = [];
  const todayKey = dateKey(now);

  // D. Money already earned but not yet collected.
  if (outstanding > 0 && outstandingInvoices.length > 0) {
    const invoiceWord = outstandingInvoices.length === 1 ? 'invoice' : 'invoices';
    candidates.push({
      id: 'opportunity-outstanding',
      tone: 'client',
      weight: 100,
      message: `${formatCurrency(outstanding)} is still outstanding across ${outstandingInvoices.length} ${invoiceWord}. Following up could improve cash flow.`,
    });
  }

  // E. Upcoming work with no deposit taken. Read from the deposit payment records themselves.
  const depositedInvoiceIds = new Set(
    payments.filter((payment) => payment.kind === 'deposit' && payment.amount > 0).map((payment) => payment.invoiceId),
  );
  const invoicesByBooking = new Map<string, Invoice[]>();
  for (const invoice of invoices) {
    if (!invoice.bookingId || !isActiveInvoice(invoice)) continue;
    invoicesByBooking.set(invoice.bookingId, [...(invoicesByBooking.get(invoice.bookingId) ?? []), invoice]);
  }
  const upcomingBookings = validBookings.filter((booking) => booking.date > todayKey);
  const upcomingWithoutDeposit = upcomingBookings.filter((booking) =>
    !(invoicesByBooking.get(booking.id) ?? []).some((invoice) => depositedInvoiceIds.has(invoice.id)),
  ).length;
  if (upcomingWithoutDeposit > 0) {
    const bookingWord = upcomingWithoutDeposit === 1 ? 'booking has' : 'bookings have';
    candidates.push({
      id: 'opportunity-deposits',
      tone: 'attention',
      weight: 90,
      message: `${upcomingWithoutDeposit} upcoming ${bookingWord} no deposit recorded.`,
    });
  }

  // A. A service carrying a large share of the period's booking-linked revenue. Needs more than one
  // service to compare against, and more than a couple of payments behind the share.
  if (topService && serviceTotals.size >= 2 && attributablePayments.length >= 3 && topService.share >= 40) {
    candidates.push({
      id: 'opportunity-top-service',
      tone: 'service',
      weight: 80,
      message: `Promote ${topService.name} — it generated ${Math.round(topService.share)}% of your booking-linked revenue.`,
    });
  }

  // I. The service earning most per booking, which is not always the one earning most in total.
  const serviceBookingCounts = new Map<string, Set<string>>();
  for (const item of attributablePayments) {
    if (!item.service || !item.booking) continue;
    serviceBookingCounts.set(item.service, (serviceBookingCounts.get(item.service) ?? new Set()).add(item.booking.id));
  }
  const serviceAverages = Array.from(serviceTotals.entries())
    .map(([name, amount]) => ({ name, amount, bookings: serviceBookingCounts.get(name)?.size ?? 0 }))
    .filter((item) => item.bookings >= 2)
    .map((item) => ({ ...item, average: item.amount / item.bookings }))
    .sort((first, second) => second.average - first.average);
  const [bestAverage, runnerUpAverage] = serviceAverages;
  if (
    bestAverage &&
    runnerUpAverage &&
    bestAverage.average >= runnerUpAverage.average * 1.25 &&
    // Nothing to add when it is already named as the top earner above.
    bestAverage.name !== topService?.name
  ) {
    candidates.push({
      id: 'opportunity-service-value',
      tone: 'service',
      weight: 70,
      message: `${bestAverage.name} has your highest average booking value at ${formatCurrency(Math.round(bestAverage.average))}.`,
    });
  }

  // H. Revenue concentrated in a few clients.
  const rankedClients = Array.from(clientTotals.values()).sort((first, second) => second - first);
  if (rankedClients.length >= 4 && attributableRevenue > 0) {
    const topCount = 3;
    const topShare = percentage(rankedClients.slice(0, topCount).reduce((total, amount) => total + amount, 0), attributableRevenue);
    if (topShare >= 50) {
      candidates.push({
        id: 'opportunity-top-clients',
        tone: 'client',
        weight: 65,
        message: `Your top ${topCount} clients generated ${Math.round(topShare)}% of revenue. Consider prioritising retention.`,
      });
    }
  }

  // C. Clients seen in this period with nothing on the books ahead of them.
  const bookedAheadCustomerIds = new Set(upcomingBookings.map((booking) => booking.customerId));
  const periodBookingCustomerIds = new Set(periodBookings.map((booking) => booking.customerId));
  const lapsedClients = Array.from(periodBookingCustomerIds).filter((customerId) => !bookedAheadCustomerIds.has(customerId)).length;
  if (lapsedClients >= 2) {
    candidates.push({
      id: 'opportunity-reengage',
      tone: 'client',
      weight: 60,
      message: `${lapsedClients} past clients have no upcoming booking. Consider following up with them.`,
    });
  }

  // B. Clients who already come back, which is a package worth naming.
  if (repeatClients >= 2) {
    candidates.push({
      id: 'opportunity-repeat-clients',
      tone: 'client',
      weight: 50,
      message: `${repeatClients} clients have booked you more than once. Consider offering a repeat-client package.`,
    });
  }

  // F and G. When the work actually happens, so these read the event date rather than the date the
  // booking was taken. Both need a real sample before a weekday pattern means anything.
  const eventBookings = validBookings.filter((booking) => isWithin(booking.date, bounds.start, bounds.end));
  const weekdayCounts = new Array(7).fill(0) as number[];
  for (const booking of eventBookings) {
    weekdayCounts[localDate(booking.date).getDay()] += 1;
  }
  const busiestIndex = weekdayCounts.indexOf(Math.max(...weekdayCounts));
  const busiestShare = eventBookings.length ? percentage(weekdayCounts[busiestIndex], eventBookings.length) : 0;
  if (eventBookings.length >= 6 && busiestShare >= 35) {
    candidates.push({
      id: 'opportunity-busy-day',
      tone: 'positive',
      weight: 40,
      message: `Most bookings happen on ${WEEKDAY_NAMES[busiestIndex]}. Consider protecting or expanding availability during this period.`,
    });
  }
  if (eventBookings.length >= 10 && weekdayCounts[busiestIndex] >= 3) {
    const quietIndex = weekdayCounts.indexOf(Math.min(...weekdayCounts));
    if (weekdayCounts[quietIndex] === 0) {
      candidates.push({
        id: 'opportunity-quiet-day',
        tone: 'positive',
        weight: 30,
        message: `Bookings are quieter on ${WEEKDAY_NAMES[quietIndex]}. Consider testing a promotion for those slots.`,
      });
    }
  }

  const opportunities: BusinessInsight[] = candidates
    .sort((first, second) => second.weight - first.weight)
    .slice(0, 3)
    .map(({ weight: _weight, ...insight }) => insight);

  const incomeTrend = buildTrend(bounds.start, bounds.end, incomeEntries);
  const expenseTrend = buildTrend(bounds.start, bounds.end, expenseEntries);
  const invoiceBalanceTrendItems = invoicesWithBalances.map(({ invoice, balance }) => ({
    date: getInvoiceFinancialDate(invoice),
    amount: balance,
  }));
  const overdueTrendItems = overdueInvoices.map(({ invoice, balance }) => ({ date: invoice.dueDate, amount: balance }));

  return {
    bounds,
    hasData:
      currentEntries.length > 0 ||
      periodBookings.length > 0 ||
      periodClients.length > 0 ||
      periodInvoices.length > 0,
    revenue,
    expenses,
    profit,
    outstanding,
    overdue,
    outstandingInvoiceCount: outstandingInvoices.length,
    overdueInvoiceCount: overdueInvoices.length,
    revenueChange,
    expenseChange,
    profitChange,
    bookings: periodBookings.length,
    bookingChange,
    completedBookings,
    completionRate: periodBookings.length ? percentage(completedBookings, periodBookings.length) : null,
    newClients: periodClients.length,
    newClientChange,
    repeatClients,
    repeatClientRate: bookingsPerClient.size ? percentage(repeatClients, bookingsPerClient.size) : null,
    averageBookingValue: applicableBookingIds.size ? attributableRevenue / applicableBookingIds.size : null,
    topService,
    topClient,
    expenseCategories,
    insights,
    opportunities,
    trends: {
      income: incomeTrend,
      profit: incomeTrend.map((amount, index) => amount - expenseTrend[index]),
      outstanding: buildTrend(bounds.start, bounds.end, invoiceBalanceTrendItems),
      overdue: buildTrend(bounds.start, bounds.end, overdueTrendItems),
    },
  };
}
