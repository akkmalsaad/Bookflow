import { formatRangeLabel, formatGeneratedAt } from './range';
import type { ReportCell, ReportColumn, ReportData, ReportSection } from './types';

/**
 * RFC 4180 escaping: a field is quoted when it contains a comma, quote, CR or LF, and any quote
 * inside it is doubled. That is what makes a description with a line break or a business name with a
 * comma survive the round trip into Excel, Numbers and Sheets.
 */
export function escapeCsv(value: ReportCell) {
  const text = value === null || value === undefined ? '' : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvCell(value: ReportCell, column?: ReportColumn) {
  if (value === null || value === undefined) return '';
  // Currency and count columns export as bare numbers so a spreadsheet can sum them; only the PDF
  // gets the formatted "RM1,250.50" string.
  if (column?.kind === 'currency' || column?.kind === 'number') {
    return typeof value === 'number' ? String(value) : escapeCsv(value);
  }
  return escapeCsv(value);
}

export function toCsvLines(rows: ReportCell[][]) {
  return rows.map((row) => row.map((cell) => escapeCsv(cell)).join(',')).join('\r\n');
}

/** One section as a standalone CSV: heading row, data rows, then its totals. */
export function sectionToCsv(section: ReportSection) {
  const lines: string[] = [section.columns.map((column) => escapeCsv(column.label)).join(',')];

  section.rows.forEach((row) => {
    lines.push(section.columns.map((column) => csvCell(row[column.key], column)).join(','));
  });

  if (section.totals?.length) {
    lines.push('');
    section.totals.forEach((total) => {
      lines.push([escapeCsv(total.label), csvCell(total.value, { key: '', label: '', kind: total.kind })].join(','));
    });
  }

  return lines.join('\r\n');
}

export function summaryToCsv(data: ReportData) {
  const lines = [
    ['Business', data.businessName].map(escapeCsv).join(','),
    ['Report', data.title].map(escapeCsv).join(','),
    ['Period', formatRangeLabel(data.bounds)].map(escapeCsv).join(','),
    ['Generated', formatGeneratedAt(data.generatedAt)].map(escapeCsv).join(','),
    '',
    ['Metric', 'Value'].map(escapeCsv).join(','),
  ];

  data.summary.forEach((item) => {
    lines.push([escapeCsv(item.label), csvCell(item.value, { key: '', label: '', kind: item.kind })].join(','));
  });

  return lines.join('\r\n');
}

/**
 * A report as one CSV: the header block, then every section under its own title and heading row.
 *
 * Income & expenses is two sections and both must be in the file, so sections are written in
 * sequence rather than only the first. Separate heading rows per block is the normal shape for a
 * report CSV and every spreadsheet imports it; what is never done is interleaving sections with
 * different columns into a single malformed table — the complete report goes out as a ZIP of one
 * CSV per section instead.
 */
export function reportToCsv(data: ReportData) {
  const blocks = [summaryToCsv(data)];

  data.sections.forEach((section) => {
    blocks.push('', escapeCsv(section.title), sectionToCsv(section));
  });

  return blocks.join('\r\n');
}
