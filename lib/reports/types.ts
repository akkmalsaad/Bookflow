import type { CurrencyCode } from '@/context/app-data-context';

export type ReportRange = 'this-month' | 'last-month' | 'this-year' | 'custom';

export type ReportType =
  | 'complete'
  | 'income-expenses'
  | 'profit-loss'
  | 'transactions'
  | 'customer-payments';

export type ReportFormat = 'pdf' | 'csv' | 'xlsx';

export type DateBounds = { start: string; end: string };

export const REPORT_RANGES: { id: ReportRange; label: string }[] = [
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'this-year', label: 'This year' },
  { id: 'custom', label: 'Custom' },
];

export const REPORT_TYPES: {
  id: ReportType;
  label: string;
  description: string;
  /** Shown as the "Recommended" pill; only the complete report carries it. */
  recommended?: boolean;
}[] = [
  {
    id: 'complete',
    label: 'Complete business report',
    description: 'All bookings, invoices, payments and finances',
    recommended: true,
  },
  { id: 'income-expenses', label: 'Income & expenses', description: 'Every finance entry, grouped by type' },
  { id: 'profit-loss', label: 'Profit & loss', description: 'Totals per category with the net result' },
  { id: 'transactions', label: 'Transactions', description: 'One line per recorded transaction' },
  { id: 'customer-payments', label: 'Customer payments', description: 'Invoice payments and deposits received' },
];

export const REPORT_FORMATS: { id: ReportFormat; label: string; hint: string }[] = [
  { id: 'pdf', label: 'PDF', hint: 'Formatted document' },
  { id: 'csv', label: 'CSV', hint: 'Spreadsheet rows' },
  { id: 'xlsx', label: 'Excel', hint: 'One sheet per section' },
];

/**
 * How a value is rendered and exported.
 *
 * Rows always carry the raw value — a currency cell holds `1250.5`, never `"RM1,250.50"` — so the
 * PDF can format it for reading while CSV and Excel export a number a spreadsheet can sum.
 */
export type ReportColumnKind = 'text' | 'date' | 'number' | 'currency';

export type ReportColumn = {
  key: string;
  label: string;
  kind?: ReportColumnKind;
  /** Keeps a short identifier like an invoice number on one line in the PDF. */
  nowrap?: boolean;
};

export type ReportCell = string | number | null | undefined;
export type ReportRow = Record<string, ReportCell>;

export type ReportTotal = { label: string; value: ReportCell; kind?: ReportColumnKind };

export type ReportSection = {
  /** Stable slug: the CSV filename inside the ZIP, and the Excel worksheet name. */
  id: string;
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: ReportTotal[];
  /** Printed in place of the table when there is nothing to list. */
  emptyMessage?: string;
};

export type ReportSummaryItem = {
  label: string;
  value: ReportCell;
  kind?: ReportColumnKind;
  /** Revenue, expenses, net profit and outstanding — the four the first page leads with. */
  emphasis?: boolean;
};

export type ReportData = {
  type: ReportType;
  title: string;
  bounds: DateBounds;
  businessName: string;
  /** Only set when the workspace has a logo and the entitlement allows custom branding. */
  logoUrl?: string;
  currency: CurrencyCode;
  generatedAt: Date;
  summary: ReportSummaryItem[];
  sections: ReportSection[];
  /** Detail rows across every section. Drives the "no records in this period" gate. */
  recordCount: number;
};
