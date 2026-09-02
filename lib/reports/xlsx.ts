import { getCurrencyFormatter } from '@/context/app-data-context';

import { formatGeneratedAt, formatRangeLabel } from './range';
import { createZip, zipTextEntry } from './zip';
import type { ReportCell, ReportColumn, ReportData, ReportSection } from './types';

/**
 * A minimal .xlsx writer.
 *
 * An .xlsx is a ZIP of XML parts, and the ZIP half already exists in `./zip` for the CSV bundle, so
 * the workbook is written directly rather than by adding a spreadsheet library — no native module,
 * no bundler configuration, nothing that could break an Expo build. Strings are written inline, so
 * there is no shared-string table to keep in sync.
 */

const SHEET_NAMES: Record<string, string> = {
  bookings: 'Bookings',
  invoices: 'Invoices',
  'customer-payments': 'Payments',
  income: 'Income',
  expenses: 'Expenses',
  'profit-loss': 'Profit & Loss',
  transactions: 'Transactions',
};

const STYLE_DEFAULT = 0;
const STYLE_HEADER = 1;
const STYLE_CURRENCY = 2;
const STYLE_BOLD = 3;

function escapeXml(value: string) {
  return (
    value
      // Excel rejects most control characters outright; drop them before they reach the part.
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  );
}

/** 1 → A, 27 → AA. */
function columnLetter(index: number) {
  let remaining = index;
  let letters = '';

  while (remaining > 0) {
    const modulo = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + modulo) + letters;
    remaining = Math.floor((remaining - modulo) / 26);
  }

  return letters;
}

/** Excel's own rules: 31 characters, none of `[]:*?/\`, and unique within the workbook. */
function sheetName(name: string, taken: Set<string>) {
  const base = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = base;
  let suffix = 2;

  while (taken.has(candidate.toLowerCase())) {
    const trimmed = base.slice(0, 31 - String(suffix).length - 1);
    candidate = `${trimmed} ${suffix}`;
    suffix += 1;
  }

  taken.add(candidate.toLowerCase());
  return candidate;
}

type SheetCell = { value: ReportCell; style: number; numeric: boolean };

function cellFor(value: ReportCell, kind?: ReportColumn['kind'], header = false): SheetCell {
  if (header) return { value, style: STYLE_HEADER, numeric: false };
  if (value === null || value === undefined) return { value: '', style: STYLE_DEFAULT, numeric: false };

  if (kind === 'currency' && typeof value === 'number') {
    return { value, style: STYLE_CURRENCY, numeric: true };
  }
  if (kind === 'number' && typeof value === 'number') {
    return { value, style: STYLE_DEFAULT, numeric: true };
  }

  return { value, style: STYLE_DEFAULT, numeric: false };
}

function sheetXml(rows: SheetCell[][], widths: number[]) {
  const cols = widths.length
    ? `<cols>${widths
        .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';

  const body = rows
    .map((cells, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const rendered = cells
        .map((cell, columnIndex) => {
          const reference = `${columnLetter(columnIndex + 1)}${rowNumber}`;
          const style = cell.style === STYLE_DEFAULT ? '' : ` s="${cell.style}"`;

          if (cell.numeric) {
            return `<c r="${reference}"${style}><v>${Number(cell.value)}</v></c>`;
          }

          const text = cell.value === null || cell.value === undefined ? '' : String(cell.value);
          if (!text) return `<c r="${reference}"${style}/>`;
          return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
        })
        .join('');

      return `<row r="${rowNumber}">${rendered}</row>`;
    })
    .join('');

  // Declaring the used range lets a streaming reader size the sheet without scanning every row.
  const lastColumn = rows.reduce((widest, cells) => Math.max(widest, cells.length), 1);
  const dimension = `<dimension ref="A1:${columnLetter(lastColumn)}${Math.max(1, rows.length)}"/>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${dimension}${cols}<sheetData>${body}</sheetData></worksheet>`;
}

function widthsFor(rows: SheetCell[][]) {
  const widths: number[] = [];

  rows.forEach((cells) => {
    cells.forEach((cell, index) => {
      const length = String(cell.value ?? '').length + 2;
      widths[index] = Math.min(46, Math.max(widths[index] ?? 10, length));
    });
  });

  return widths;
}

function summarySheet(data: ReportData): SheetCell[][] {
  const rows: SheetCell[][] = [
    [cellFor(data.businessName, 'text', true), cellFor('')],
    [cellFor('Report', 'text'), cellFor(data.title, 'text')],
    [cellFor('Period', 'text'), cellFor(formatRangeLabel(data.bounds), 'text')],
    [cellFor('Generated', 'text'), cellFor(formatGeneratedAt(data.generatedAt), 'text')],
    [cellFor(''), cellFor('')],
    [cellFor('Metric', 'text', true), cellFor('Value', 'text', true)],
  ];

  data.summary.forEach((item) => {
    rows.push([
      { value: item.label, style: item.emphasis ? STYLE_BOLD : STYLE_DEFAULT, numeric: false },
      cellFor(item.value, item.kind),
    ]);
  });

  return rows;
}

function sectionSheet(section: ReportSection): SheetCell[][] {
  const rows: SheetCell[][] = [section.columns.map((column) => cellFor(column.label, 'text', true))];

  section.rows.forEach((row) => {
    rows.push(section.columns.map((column) => cellFor(row[column.key], column.kind)));
  });

  if (section.totals?.length) {
    rows.push(section.columns.map(() => cellFor('')));
    section.totals.forEach((total) => {
      rows.push([{ value: total.label, style: STYLE_BOLD, numeric: false }, cellFor(total.value, total.kind)]);
    });
  }

  return rows;
}

/** Reads the currency symbol out of the app's own formatter, so the sheet shows RM, $ or € to match. */
function currencyFormatCode(data: ReportData) {
  const symbol = getCurrencyFormatter(data.currency)
    .format(0)
    .replace(/[\d.,\s\u00A0\u202F]/g, '');
  const prefix = symbol ? `&quot;${escapeXml(symbol)}&quot;` : '';
  return `${prefix}#,##0.00`;
}

function stylesXml(data: ReportData) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="${currencyFormatCode(data)}"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

export function createReportXlsx(data: ReportData): Uint8Array {
  const taken = new Set<string>();
  const sheets = [
    { name: sheetName('Summary', taken), rows: summarySheet(data) },
    ...data.sections.map((section) => ({
      name: sheetName(SHEET_NAMES[section.id] ?? section.title, taken),
      rows: sectionSheet(section),
    })),
  ];

  const sheetEntries = sheets.map((sheet, index) =>
    zipTextEntry(`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet.rows, widthsFor(sheet.rows))),
  );

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
    .map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join('')}</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  return createZip(
    [
      zipTextEntry('[Content_Types].xml', contentTypes),
      zipTextEntry('_rels/.rels', rootRels),
      zipTextEntry('xl/workbook.xml', workbook),
      zipTextEntry('xl/_rels/workbook.xml.rels', workbookRels),
      zipTextEntry('xl/styles.xml', stylesXml(data)),
      ...sheetEntries,
    ],
    data.generatedAt,
  );
}
