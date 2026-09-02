import { getCurrencyFormatter } from '@/context/app-data-context';

import { formatDisplayDate, formatGeneratedAt, formatRangeLabel } from './range';
import type { ReportCell, ReportColumn, ReportData, ReportSection, ReportSummaryItem } from './types';

function escapeHtml(value: ReportCell) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/** The PDF is the one output that shows formatted money; CSV and Excel keep the raw number. */
function formatCell(value: ReportCell, kind: ReportColumn['kind'], currencyFormatter: Intl.NumberFormat) {
  if (value === null || value === undefined || value === '') return '—';
  if (kind === 'currency' && typeof value === 'number') return currencyFormatter.format(value);
  if (kind === 'number' && typeof value === 'number') return String(value);
  if (kind === 'date') return formatDisplayDate(String(value));
  return String(value);
}

function cellClass(column: ReportColumn) {
  const classes: string[] = [];
  if (column.kind === 'currency' || column.kind === 'number') classes.push('right');
  // A wrapped date or invoice number costs a line in every row of a long table.
  if (column.kind === 'date' || column.nowrap) classes.push('nowrap');
  return classes.join(' ');
}

function renderSummary(summary: ReportSummaryItem[], currencyFormatter: Intl.NumberFormat) {
  const headline = summary.filter((item) => item.emphasis);
  const rest = summary.filter((item) => !item.emphasis);

  const cards = headline
    .map(
      (item) => `<div class="stat">
        <div class="stat-label">${escapeHtml(item.label)}</div>
        <div class="stat-value">${escapeHtml(formatCell(item.value, item.kind, currencyFormatter))}</div>
      </div>`,
    )
    .join('');

  const rows = rest
    .map(
      (item) => `<div class="fact">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(formatCell(item.value, item.kind, currencyFormatter))}</strong>
      </div>`,
    )
    .join('');

  return `${cards ? `<div class="stats">${cards}</div>` : ''}${rows ? `<div class="facts">${rows}</div>` : ''}`;
}

function renderSection(section: ReportSection, currencyFormatter: Intl.NumberFormat) {
  const head = section.columns
    .map((column) => `<th class="${cellClass(column)}">${escapeHtml(column.label)}</th>`)
    .join('');

  const body = section.rows
    .map(
      (row) =>
        `<tr>${section.columns
          .map(
            (column) =>
              `<td class="${cellClass(column)}">${escapeHtml(
                formatCell(row[column.key], column.kind, currencyFormatter),
              )}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');

  const totals = section.totals?.length
    ? `<div class="totals">${section.totals
        .map(
          (total) =>
            `<div class="total"><span>${escapeHtml(total.label)}</span><strong>${escapeHtml(
              formatCell(total.value, total.kind, currencyFormatter),
            )}</strong></div>`,
        )
        .join('')}</div>`
    : '';

  // Invoices and payments carry eight or nine columns; tightening type and padding on those keeps
  // the client name on one line instead of stacking it three deep in a squeezed column.
  const density = section.columns.length >= 7 ? ' wide' : '';

  return `<section class="block">
    <h2>${escapeHtml(section.title)}</h2>
    ${
      section.rows.length
        ? `<table class="${density.trim()}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
        : `<div class="empty">${escapeHtml(section.emptyMessage ?? 'No records in this period.')}</div>`
    }
    ${totals}
  </section>`;
}

/**
 * The printable report.
 *
 * `expo-print` renders this HTML through the platform's own print engine (WKWebView on iOS), which
 * is what produces a real PDF rather than an HTML file with a renamed extension. Page breaks,
 * repeating table headers and the page counter are all CSS paged-media features the print engine
 * understands, so a long Bookings table carries its heading onto every page it spans.
 */
export function createReportHtml(data: ReportData) {
  const currencyFormatter = getCurrencyFormatter(data.currency);
  // `alt` is deliberately empty and the element removes itself on error: an unreachable logo URL
  // must leave the masthead clean rather than printing a broken-image box over the business name.
  const logo = data.logoUrl
    ? `<img class="logo" src="${escapeHtml(data.logoUrl)}" alt="" onerror="this.remove()" />`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(data.title)}</title>
    <style>
      @page {
        size: A4;
        margin: 16mm 14mm 18mm;
        @bottom-center { content: counter(page) " / " counter(pages); font-size: 8pt; color: #9CA3AF; }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #172033;
        background: #FFFFFF;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        font-size: 9.5pt;
        line-height: 1.45;
        -webkit-print-color-adjust: exact;
      }
      .masthead { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; border-bottom: 2px solid #4F46E5; padding-bottom: 14px; }
      .logo { display: block; max-width: 130px; max-height: 46px; object-fit: contain; object-position: left center; margin-bottom: 8px; }
      .business { font-size: 13pt; font-weight: 700; letter-spacing: -0.2pt; }
      .brand { font-size: 7.5pt; font-weight: 700; letter-spacing: 1.4pt; text-transform: uppercase; color: #4F46E5; margin-top: 3px; }
      .meta { text-align: right; font-size: 8pt; color: #6B7280; }
      h1 { font-size: 17pt; font-weight: 700; letter-spacing: -0.4pt; margin: 20px 0 3px; }
      .period { font-size: 9.5pt; color: #6B7280; margin-bottom: 18px; }
      .stats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
      .stat { flex: 1 1 21%; min-width: 108px; border: 1px solid #E5E9F2; border-radius: 7px; padding: 9px 11px; background: #FAFBFE; }
      .stat-label { font-size: 7pt; font-weight: 700; letter-spacing: 0.7pt; text-transform: uppercase; color: #6B7280; }
      .stat-value { font-size: 12.5pt; font-weight: 700; margin-top: 3px; letter-spacing: -0.3pt; }
      .facts { border: 1px solid #E5E9F2; border-radius: 7px; padding: 4px 12px; margin-bottom: 6px; }
      .fact { display: flex; justify-content: space-between; padding: 4.5px 0; font-size: 9pt; border-bottom: 1px solid #F1F4F9; }
      .fact:last-child { border-bottom: none; }
      .block { margin-top: 22px; page-break-inside: auto; }
      h2 { font-size: 10.5pt; font-weight: 700; margin: 0 0 8px; padding-bottom: 5px; border-bottom: 1px solid #E5E9F2; letter-spacing: 0.2pt; page-break-after: avoid; }
      table { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      th { background: #F1F4F9; text-align: left; padding: 6px 7px; font-size: 7pt; font-weight: 700; letter-spacing: 0.6pt; text-transform: uppercase; color: #4B5563; }
      td { padding: 6px 7px; border-bottom: 1px solid #F1F4F9; vertical-align: top; }
      tbody tr:nth-child(even) td { background: #FAFBFE; }
      .right { text-align: right; white-space: nowrap; }
      .nowrap { white-space: nowrap; }
      table.wide { font-size: 7.6pt; }
      table.wide th, table.wide td { padding: 5px 5px; }
      .summary-block { margin-top: 0; page-break-inside: avoid; }
      .empty { padding: 16px 8px; color: #6B7280; font-size: 9pt; font-style: italic; }
      .totals { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px 20px; justify-content: flex-end; }
      .total { font-size: 8.5pt; color: #4B5563; }
      .total strong { color: #172033; margin-left: 7px; }
      .footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #E5E9F2; font-size: 7.5pt; color: #9CA3AF; display: flex; justify-content: space-between; }
    </style>
  </head>
  <body>
    <header class="masthead">
      <div>
        ${logo}
        <div class="business">${escapeHtml(data.businessName)}</div>
        <div class="brand">BookFlow</div>
      </div>
      <div class="meta">
        Generated<br />${escapeHtml(formatGeneratedAt(data.generatedAt))}
      </div>
    </header>

    <h1>${escapeHtml(data.title)}</h1>
    <div class="period">${escapeHtml(formatRangeLabel(data.bounds))}</div>

    <section class="block summary-block">
      <h2>Business summary</h2>
      ${renderSummary(data.summary, currencyFormatter)}
    </section>
    ${data.sections.map((section) => renderSection(section, currencyFormatter)).join('')}

    <footer class="footer">
      <span>${escapeHtml(data.businessName)} · ${escapeHtml(data.title)}</span>
      <span>${escapeHtml(formatRangeLabel(data.bounds))}</span>
    </footer>
  </body>
</html>`;
}
