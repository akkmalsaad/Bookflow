import type {
  Booking,
  BusinessProfile,
  CurrencyCode,
  Customer,
  FinanceEntry,
  Invoice,
  InvoicePayment,
} from '@/context/app-data-context';
import {
  getFinancialMetrics,
  getInvoiceFinancialDate,
  getOutstandingInvoiceBalances,
} from '@/lib/financial-metrics';
import { getInvoicePayments, getInvoicePaymentSummary } from '@/lib/invoice-payments';
import { getInvoiceNumber } from '@/lib/invoice-numbering';

import { isWithinBounds } from './range';
import {
  REPORT_TYPES,
  type DateBounds,
  type ReportData,
  type ReportSection,
  type ReportSummaryItem,
  type ReportType,
} from './types';

export type BuildReportInput = {
  type: ReportType;
  bounds: DateBounds;
  businessProfile: BusinessProfile;
  /** Current entitlement gate, mirroring the invoice PDF: no Pro, no custom logo. */
  allowBusinessLogo?: boolean;
  currency: CurrencyCode;
  financeEntries: FinanceEntry[];
  bookings: Booking[];
  invoices: Invoice[];
  payments: InvoicePayment[];
  customers: Customer[];
  now?: Date;
};

/** Which sections each report is made of. The complete report is simply all of them. */
const SECTIONS_BY_TYPE: Record<ReportType, string[]> = {
  complete: ['bookings', 'invoices', 'customer-payments', 'income', 'expenses', 'profit-loss', 'transactions'],
  'income-expenses': ['income', 'expenses'],
  'profit-loss': ['profit-loss'],
  transactions: ['transactions'],
  'customer-payments': ['customer-payments'],
};

/**
 * Assembles every dataset a report can contain, from the same helpers the rest of the app reads.
 *
 * Nothing here recomputes money. Revenue, expenses, net profit and outstanding come from
 * `getFinancialMetrics`; per-invoice balances come from `getInvoicePaymentSummary`; the invoice set
 * comes from `getOutstandingInvoiceBalances`. A figure in an exported report is therefore the same
 * figure the Finance and Business Insights screens show for the same period, by construction rather
 * than by coincidence.
 *
 * Rows carry raw numbers and human names only — never a customer id, invoice id or any other
 * internal identifier.
 */
export function buildReportData({
  type,
  bounds,
  businessProfile,
  allowBusinessLogo = false,
  currency,
  financeEntries,
  bookings,
  invoices,
  payments,
  customers,
  now = new Date(),
}: BuildReportInput): ReportData {
  const metrics = getFinancialMetrics({ financeEntries, invoices, payments, bounds });
  const invoiceBalances = getOutstandingInvoiceBalances(invoices, payments, bounds);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const invoiceByBookingId = new Map(
    invoices.filter((invoice) => invoice.bookingId).map((invoice) => [invoice.bookingId, invoice]),
  );
  const clientName = (customerId?: string) =>
    (customerId ? customerById.get(customerId)?.name : undefined) ?? 'Not recorded';

  // Bookings are listed in full — a cancelled job still belongs in a business record — while the
  // headline count excludes cancellations so it matches the Business Insights booking figure.
  const periodBookings = bookings
    .filter((booking) => isWithinBounds(booking.date, bounds))
    .sort((a, b) => a.date.localeCompare(b.date));
  const activeBookings = periodBookings.filter((booking) => booking.status !== 'Cancelled');

  const periodPayments = payments
    .filter((payment) => isWithinBounds(payment.date, bounds))
    .sort((a, b) => a.date.localeCompare(b.date));
  const paymentsReceived = periodPayments.reduce((total, payment) => total + payment.amount, 0);

  const incomeEntries = metrics.transactions.filter((entry) => entry.type === 'income');
  const expenseEntries = metrics.transactions.filter((entry) => entry.type === 'expense');

  const involvedClientIds = new Set<string>();
  periodBookings.forEach((booking) => involvedClientIds.add(booking.customerId));
  invoiceBalances.forEach(({ invoice }) => involvedClientIds.add(invoice.customerId));
  periodPayments.forEach((payment) => {
    const invoice = invoiceById.get(payment.invoiceId);
    if (invoice) involvedClientIds.add(invoice.customerId);
  });

  const bookingsSection: ReportSection = {
    id: 'bookings',
    title: 'Bookings',
    columns: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'client', label: 'Client' },
      { key: 'service', label: 'Service' },
      { key: 'amount', label: 'Value', kind: 'currency' },
      { key: 'status', label: 'Status' },
      { key: 'payment', label: 'Payment' },
    ],
    rows: periodBookings.map((booking) => {
      const invoice = invoiceByBookingId.get(booking.id);
      return {
        date: booking.date,
        client: clientName(booking.customerId),
        service: booking.packageName || booking.title || 'Not recorded',
        amount: booking.price,
        status: booking.status,
        payment: invoice ? getInvoicePaymentSummary(invoice, payments).status : 'No invoice',
      };
    }),
    totals: [
      { label: 'Bookings listed', value: periodBookings.length, kind: 'number' },
      { label: 'Excluding cancelled', value: activeBookings.length, kind: 'number' },
      {
        label: 'Total booking value',
        value: periodBookings.reduce((total, booking) => total + booking.price, 0),
        kind: 'currency',
      },
    ],
    emptyMessage: 'No bookings in this period.',
  };

  const invoicesSection: ReportSection = {
    id: 'invoices',
    title: 'Invoices',
    columns: [
      { key: 'invoice', label: 'Invoice', nowrap: true },
      { key: 'client', label: 'Client' },
      { key: 'issued', label: 'Issued', kind: 'date' },
      { key: 'due', label: 'Due', kind: 'date' },
      { key: 'total', label: 'Total', kind: 'currency' },
      { key: 'deposit', label: 'Deposit', kind: 'currency' },
      { key: 'paid', label: 'Paid', kind: 'currency' },
      { key: 'balance', label: 'Balance', kind: 'currency' },
      { key: 'status', label: 'Status' },
    ],
    rows: invoiceBalances.map(({ invoice, amountPaid, balance }) => ({
      invoice: getInvoiceNumber(invoice),
      client: clientName(invoice.customerId),
      issued: getInvoiceFinancialDate(invoice),
      due: invoice.dueDate,
      total: invoice.amount,
      deposit: getInvoicePayments(invoice.id, payments)
        .filter((payment) => payment.kind === 'deposit')
        .reduce((total, payment) => total + payment.amount, 0),
      paid: amountPaid,
      balance,
      status: invoice.status,
    })),
    totals: [
      { label: 'Invoices', value: invoiceBalances.length, kind: 'number' },
      {
        label: 'Invoiced total',
        value: invoiceBalances.reduce((total, item) => total + item.invoice.amount, 0),
        kind: 'currency',
      },
      {
        label: 'Received',
        value: invoiceBalances.reduce((total, item) => total + item.amountPaid, 0),
        kind: 'currency',
      },
      { label: 'Outstanding', value: metrics.outstanding, kind: 'currency' },
    ],
    emptyMessage: 'No invoices issued in this period.',
  };

  const paymentsSection: ReportSection = {
    id: 'customer-payments',
    title: 'Customer payments',
    columns: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'client', label: 'Client' },
      { key: 'invoice', label: 'Invoice', nowrap: true },
      { key: 'type', label: 'Type' },
      { key: 'method', label: 'Method' },
      { key: 'amount', label: 'Amount', kind: 'currency' },
      { key: 'invoiceTotal', label: 'Invoice total', kind: 'currency' },
      { key: 'balance', label: 'Balance', kind: 'currency' },
    ],
    rows: periodPayments.map((payment) => {
      const invoice = invoiceById.get(payment.invoiceId);
      const summary = invoice ? getInvoicePaymentSummary(invoice, payments) : null;
      return {
        date: payment.date,
        client: invoice ? clientName(invoice.customerId) : 'Not recorded',
        invoice: invoice ? getInvoiceNumber(invoice) : 'Not recorded',
        type: payment.kind === 'deposit' ? 'Deposit' : 'Payment',
        method: payment.method,
        amount: payment.amount,
        invoiceTotal: summary ? summary.totalAmount : null,
        balance: summary ? summary.outstanding : null,
      };
    }),
    totals: [
      { label: 'Payments recorded', value: periodPayments.length, kind: 'number' },
      {
        label: 'Deposits',
        value: periodPayments
          .filter((payment) => payment.kind === 'deposit')
          .reduce((total, payment) => total + payment.amount, 0),
        kind: 'currency',
      },
      { label: 'Total received', value: paymentsReceived, kind: 'currency' },
    ],
    emptyMessage: 'No customer payments recorded in this period.',
  };

  const financeColumns = [
    { key: 'date', label: 'Date', kind: 'date' as const },
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Description' },
    { key: 'client', label: 'Client' },
    { key: 'amount', label: 'Amount', kind: 'currency' as const },
  ];
  const financeRow = (entry: FinanceEntry) => ({
    date: entry.date,
    category: entry.category,
    description: entry.description,
    client: entry.customerId ? clientName(entry.customerId) : '—',
    amount: entry.amount,
  });

  const incomeSection: ReportSection = {
    id: 'income',
    title: 'Income',
    columns: financeColumns,
    rows: incomeEntries.map(financeRow),
    totals: [
      { label: 'Income entries', value: incomeEntries.length, kind: 'number' },
      { label: 'Total income', value: metrics.revenue, kind: 'currency' },
    ],
    emptyMessage: 'No income recorded in this period.',
  };

  const expensesSection: ReportSection = {
    id: 'expenses',
    title: 'Expenses',
    columns: financeColumns,
    rows: expenseEntries.map(financeRow),
    totals: [
      { label: 'Expense entries', value: expenseEntries.length, kind: 'number' },
      { label: 'Total expenses', value: metrics.expenses, kind: 'currency' },
    ],
    emptyMessage: 'No expenses recorded in this period.',
  };

  const categoryTotals = new Map<string, { category: string; type: string; amount: number }>();
  metrics.transactions.forEach((entry) => {
    const key = `${entry.type}:${entry.category}`;
    const existing = categoryTotals.get(key);
    if (existing) {
      existing.amount += entry.amount;
      return;
    }
    categoryTotals.set(key, {
      category: entry.category,
      type: entry.type === 'income' ? 'Income' : 'Expense',
      amount: entry.amount,
    });
  });

  const profitLossSection: ReportSection = {
    id: 'profit-loss',
    title: 'Profit & loss',
    columns: [
      { key: 'category', label: 'Category' },
      { key: 'type', label: 'Type' },
      { key: 'amount', label: 'Total', kind: 'currency' },
    ],
    rows: [...categoryTotals.values()]
      .sort((a, b) => a.type.localeCompare(b.type) || b.amount - a.amount)
      .map((item) => ({ category: item.category, type: item.type, amount: item.amount })),
    totals: [
      { label: 'Revenue', value: metrics.revenue, kind: 'currency' },
      { label: 'Total expenses', value: metrics.expenses, kind: 'currency' },
      { label: 'Net profit', value: metrics.netProfit, kind: 'currency' },
    ],
    emptyMessage: 'No income or expenses recorded in this period.',
  };

  const transactionsSection: ReportSection = {
    id: 'transactions',
    title: 'Transactions',
    columns: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'type', label: 'Type' },
      { key: 'category', label: 'Category' },
      { key: 'description', label: 'Description' },
      { key: 'client', label: 'Client' },
      { key: 'amount', label: 'Amount', kind: 'currency' },
    ],
    rows: metrics.transactions
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => ({
        date: entry.date,
        type: entry.type === 'income' ? 'Income' : 'Expense',
        category: entry.category,
        description: entry.description,
        client: entry.customerId ? clientName(entry.customerId) : '—',
        amount: entry.amount,
      })),
    totals: [
      { label: 'Transactions', value: metrics.transactions.length, kind: 'number' },
      { label: 'Net', value: metrics.netProfit, kind: 'currency' },
    ],
    emptyMessage: 'No transactions recorded in this period.',
  };

  const allSections: Record<string, ReportSection> = {
    bookings: bookingsSection,
    invoices: invoicesSection,
    'customer-payments': paymentsSection,
    income: incomeSection,
    expenses: expensesSection,
    'profit-loss': profitLossSection,
    transactions: transactionsSection,
  };

  const sections = SECTIONS_BY_TYPE[type]
    .map((id) => allSections[id])
    .filter((section): section is ReportSection => Boolean(section));

  const summary = buildSummary({
    type,
    metrics,
    paymentsReceived,
    paymentCount: periodPayments.length,
    bookingCount: activeBookings.length,
    invoiceCount: invoiceBalances.length,
    clientCount: involvedClientIds.size,
    incomeCount: incomeEntries.length,
    expenseCount: expenseEntries.length,
    transactionCount: metrics.transactions.length,
  });

  return {
    type,
    title: REPORT_TYPES.find((item) => item.id === type)?.label ?? 'Business report',
    bounds,
    businessName: businessProfile.name?.trim() || 'BookFlow',
    logoUrl: allowBusinessLogo ? businessProfile.logoUrl : undefined,
    currency,
    generatedAt: now,
    summary,
    sections,
    recordCount: sections.reduce((total, section) => total + section.rows.length, 0),
  };
}

type SummaryInput = {
  type: ReportType;
  metrics: ReturnType<typeof getFinancialMetrics>;
  paymentsReceived: number;
  paymentCount: number;
  bookingCount: number;
  invoiceCount: number;
  clientCount: number;
  incomeCount: number;
  expenseCount: number;
  transactionCount: number;
};

function buildSummary({
  type,
  metrics,
  paymentsReceived,
  paymentCount,
  bookingCount,
  invoiceCount,
  clientCount,
  incomeCount,
  expenseCount,
  transactionCount,
}: SummaryInput): ReportSummaryItem[] {
  const money = (label: string, value: number, emphasis = false): ReportSummaryItem => ({
    label,
    value,
    kind: 'currency',
    emphasis,
  });
  const count = (label: string, value: number): ReportSummaryItem => ({ label, value, kind: 'number' });

  if (type === 'customer-payments') {
    return [
      money('Total received', paymentsReceived, true),
      money('Outstanding', metrics.outstanding, true),
      count('Payments recorded', paymentCount),
      count('Invoices outstanding', metrics.outstandingInvoiceCount),
    ];
  }

  if (type === 'profit-loss') {
    return [
      money('Revenue', metrics.revenue, true),
      money('Expenses', metrics.expenses, true),
      money('Net profit', metrics.netProfit, true),
      count('Transactions', transactionCount),
    ];
  }

  if (type === 'transactions') {
    return [
      money('Revenue', metrics.revenue, true),
      money('Expenses', metrics.expenses, true),
      money('Net', metrics.netProfit, true),
      count('Transactions', transactionCount),
    ];
  }

  if (type === 'income-expenses') {
    return [
      money('Total income', metrics.revenue, true),
      money('Total expenses', metrics.expenses, true),
      money('Net result', metrics.netProfit, true),
      count('Income entries', incomeCount),
      count('Expense entries', expenseCount),
    ];
  }

  return [
    money('Total revenue', metrics.revenue, true),
    money('Total expenses', metrics.expenses, true),
    money('Net profit', metrics.netProfit, true),
    money('Outstanding', metrics.outstanding, true),
    money('Invoice payments received', paymentsReceived),
    count('Bookings', bookingCount),
    count('Invoices', invoiceCount),
    count('Paid invoices', metrics.paidInvoiceCount),
    count('Outstanding invoices', metrics.outstandingInvoiceCount),
    count('Clients', clientCount),
  ];
}
