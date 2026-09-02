import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import { reportToCsv, sectionToCsv, summaryToCsv } from './csv';
import { createReportHtml } from './html';
import { buildReportFileName, safeFileSegment } from './range';
import { createZip, encodeUtf8, zipTextEntry } from './zip';
import { createReportXlsx } from './xlsx';
import type { ReportData, ReportFormat, ReportType } from './types';

/** Filed-away names, title-cased, independent of how the option reads on screen. */
const FILE_TITLES: Record<ReportType, string> = {
  complete: 'Complete-Business-Report',
  'income-expenses': 'Income-Expenses',
  'profit-loss': 'Profit-Loss',
  transactions: 'Transactions',
  'customer-payments': 'Customer-Payments',
};

const MIME: Record<string, { mimeType: string; UTI: string }> = {
  pdf: { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' },
  csv: { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' },
  zip: { mimeType: 'application/zip', UTI: 'public.zip-archive' },
  xlsx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  },
};

/**
 * Excel on Windows reads a CSV as the system codepage unless it opens with a byte order mark. The
 * BOM costs three bytes and is ignored by Numbers, Sheets and every importer that matters.
 */
const BOM = '\uFEFF';

export type ExportResult = { fileName: string; extension: string };

/** What a given report and format actually produce, before any file is written. */
export function resolveExtension(type: ReportType, format: ReportFormat) {
  // A complete report spans bookings, invoices, payments and finance rows, which share no columns.
  // Flattening them into one CSV would produce a file no spreadsheet can read sensibly, so the CSV
  // option ships one properly-formed file per section inside a ZIP instead.
  if (format === 'csv' && type === 'complete') return 'zip';
  return format;
}

export function getExportFileName(data: ReportData, format: ReportFormat) {
  return buildReportFileName(FILE_TITLES[data.type], data.bounds, resolveExtension(data.type, format));
}

/** The CSV files that make up a complete-report ZIP. Sections name their own file. */
export function buildCsvBundle(data: ReportData) {
  return [
    { name: 'business-summary.csv', text: summaryToCsv(data) },
    ...data.sections.map((section) => ({
      name: `${safeFileSegment(section.id).toLowerCase()}.csv`,
      text: sectionToCsv(section),
    })),
  ];
}

function buildZip(data: ReportData) {
  return createZip(
    buildCsvBundle(data).map((file) => zipTextEntry(file.name, `${BOM}${file.text}`)),
    data.generatedAt,
  );
}

type ExportOptions = {
  data: ReportData;
  format: ReportFormat;
};

async function exportOnWeb({ data, format }: ExportOptions): Promise<ExportResult> {
  const extension = resolveExtension(data.type, format);
  const fileName = getExportFileName(data, format);

  if (extension === 'pdf') {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('Allow pop-ups in your browser, then try again.');
    }

    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(createReportHtml(data));
    printWindow.document.close();
    printWindow.onafterprint = () => printWindow.close();
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 100);
    return { fileName, extension };
  }

  const bytes =
    extension === 'zip' ? buildZip(data) : extension === 'xlsx' ? createReportXlsx(data) : encodeUtf8(`${BOM}${reportToCsv(data)}`);
  const blob = new Blob([bytes as BlobPart], { type: MIME[extension].mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { fileName, extension };
}

/**
 * Generates the report, writes it into the app's cache directory, and hands the real file to the
 * system share sheet — the same route `saveInvoiceAsPdf` already takes, so both features depend on
 * one set of native modules.
 *
 * Nothing is uploaded. The file exists only in this app's sandboxed cache until the user chooses
 * where it goes, which is what keeps customer names and amounts off any server.
 */
export async function exportReport({ data, format }: ExportOptions): Promise<ExportResult> {
  if (Platform.OS === 'web') {
    return exportOnWeb({ data, format });
  }

  const extension = resolveExtension(data.type, format);
  const fileName = getExportFileName(data, format);
  const required = extension === 'pdf' ? ['ExpoPrint', 'ExpoSharing', 'FileSystem'] : ['ExpoSharing', 'FileSystem'];

  if (!required.every((moduleName) => requireOptionalNativeModule(moduleName))) {
    throw new Error('Exporting requires one native app rebuild. Rebuild and reinstall BookFlow, then try again.');
  }

  const [{ File, Paths }, Sharing] = await Promise.all([import('expo-file-system'), import('expo-sharing')]);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Saving files is not available on this device.');
  }

  const destination = new File(Paths.cache, fileName);
  if (destination.exists) {
    destination.delete();
  }

  if (extension === 'pdf') {
    const Print = await import('expo-print');
    const printed = await Print.printToFileAsync({ html: createReportHtml(data) });
    new File(printed.uri).move(destination);
  } else {
    destination.create();
    if (extension === 'csv') {
      destination.write(`${BOM}${reportToCsv(data)}`);
    } else {
      destination.write(extension === 'zip' ? buildZip(data) : createReportXlsx(data));
    }
  }

  await Sharing.shareAsync(destination.uri, {
    dialogTitle: `Save ${data.title}`,
    ...MIME[extension],
  });

  return { fileName, extension };
}
