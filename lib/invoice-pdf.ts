import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import {
  BusinessProfile,
  CurrencyCode,
  Customer,
  getCurrencyFormatter,
  Invoice,
} from '@/context/app-data-context';

export type InvoicePdfData = {
  invoice: Invoice;
  customer: Customer;
  businessProfile: BusinessProfile;
  currency: CurrencyCode;
  serviceName?: string;
  packageDetails?: string;
  eventLocation?: string;
  eventDate?: string;
  eventStartTime?: string;
  eventEndTime?: string;
};

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function displayValue(value?: string, fallback = 'Not provided') {
  return escapeHtml(value?.trim() || fallback);
}

function formatDate(value?: string) {
  if (!value) return 'Not specified';

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return value;

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsedDate);
}

function safeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function createInvoicePdfHtml({
  invoice,
  customer,
  businessProfile,
  currency,
  serviceName,
  packageDetails,
  eventLocation,
  eventDate,
  eventStartTime,
  eventEndTime,
}: InvoicePdfData) {
  const currencyFormatter = getCurrencyFormatter(currency);
  const depositPaid = invoice.depositPaid ?? 0;
  const remainingBalance = invoice.status === 'Paid' ? 0 : Math.max(0, invoice.amount - depositPaid);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Invoice ${escapeHtml(invoice.id)}</title>
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #172033;
        background: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        font-size: 12px;
        line-height: 1.5;
      }
      .page { min-height: 100vh; padding: 42px 46px 38px; }
      .top-rule { height: 6px; margin: -42px -46px 34px; background: #4f46e5; }
      .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 28px; }
      .brand { color: #4f46e5; font-size: 12px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; }
      h1 { margin: 8px 0 0; color: #101828; font-size: 32px; line-height: 1; letter-spacing: -1px; }
      .invoice-meta { min-width: 210px; text-align: right; }
      .invoice-id { color: #101828; font-size: 17px; font-weight: 800; }
      .status { display: inline-block; margin-top: 8px; padding: 5px 10px; border-radius: 999px; background: #eef2ff; color: #4338ca; font-size: 10px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 34px; }
      .panel { padding: 18px; border: 1px solid #e4e7ec; border-radius: 14px; }
      .label { margin-bottom: 8px; color: #667085; font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
      .name { margin-bottom: 4px; color: #101828; font-size: 17px; font-weight: 800; }
      .muted { color: #667085; }
      .summary { margin-top: 24px; overflow: hidden; border: 1px solid #e4e7ec; border-radius: 14px; }
      .summary-header { display: grid; grid-template-columns: 1fr 140px; padding: 11px 16px; background: #f8fafc; color: #667085; font-size: 9px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; }
      .summary-row { display: grid; grid-template-columns: 1fr 140px; padding: 18px 16px; border-top: 1px solid #e4e7ec; }
      .summary-row:first-of-type { border-top: 0; }
      .summary-description { color: #101828; font-size: 14px; font-weight: 750; }
      .summary-detail { margin-top: 4px; color: #667085; white-space: pre-wrap; }
      .summary-amount { color: #101828; font-size: 15px; font-weight: 800; text-align: right; }
      .totals { width: 290px; margin: 20px 0 0 auto; }
      .total-row { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; color: #667085; }
      .total-row strong { color: #101828; }
      .total-row.balance { margin-top: 6px; padding-top: 12px; border-top: 2px solid #101828; color: #101828; font-size: 15px; font-weight: 800; }
      .details { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 26px; }
      .detail-row { display: flex; justify-content: space-between; gap: 18px; padding: 7px 0; border-bottom: 1px solid #eef1f5; }
      .detail-row:last-child { border-bottom: 0; }
      .detail-row span:last-child { color: #101828; font-weight: 700; text-align: right; }
      .terms { margin-top: 24px; padding: 16px 18px; border-radius: 12px; background: #f8fafc; }
      .terms-copy { color: #475467; white-space: pre-wrap; }
      .footer { margin-top: 30px; padding-top: 14px; border-top: 1px solid #e4e7ec; color: #98a2b3; font-size: 9px; text-align: center; }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="top-rule"></div>
      <header class="header">
        <div>
          <div class="brand">Bookflow</div>
          <h1>Invoice</h1>
        </div>
        <div class="invoice-meta">
          <div class="invoice-id">${escapeHtml(invoice.id)}</div>
          <div class="status">${escapeHtml(invoice.status)}</div>
        </div>
      </header>

      <section class="grid">
        <div class="panel">
          <div class="label">From</div>
          <div class="name">${displayValue(businessProfile.name)}</div>
          ${businessProfile.ssmRegistrationNo.trim() ? `<div class="muted">SSM: ${displayValue(businessProfile.ssmRegistrationNo)}</div>` : ''}
          <div class="muted">${displayValue(businessProfile.phone)}</div>
          <div class="muted">${displayValue(businessProfile.email)}</div>
          <div class="muted">${displayValue(businessProfile.address)}</div>
        </div>
        <div class="panel">
          <div class="label">Bill to</div>
          <div class="name">${displayValue(customer.name)}</div>
          <div class="muted">${displayValue(customer.email)}</div>
          ${customer.phone.trim() ? `<div class="muted">${displayValue(customer.phone)}</div>` : ''}
        </div>
      </section>

      <section class="summary">
        <div class="summary-header"><span>Description</span><span style="text-align:right">Amount</span></div>
        <div class="summary-row">
          <div>
            <div class="summary-description">${displayValue(serviceName, 'Custom service')}</div>
            <div class="summary-detail">${displayValue(packageDetails, 'Professional services')}</div>
          </div>
          <div class="summary-amount">${escapeHtml(currencyFormatter.format(invoice.amount))}</div>
        </div>
      </section>

      <section class="totals">
        <div class="total-row"><span>Invoice total</span><strong>${escapeHtml(currencyFormatter.format(invoice.amount))}</strong></div>
        <div class="total-row"><span>Amount paid</span><strong>${escapeHtml(currencyFormatter.format(depositPaid))}</strong></div>
        <div class="total-row balance"><span>Balance due</span><span>${escapeHtml(currencyFormatter.format(remainingBalance))}</span></div>
      </section>

      <section class="details">
        <div class="panel">
          <div class="label">Invoice dates</div>
          <div class="detail-row"><span class="muted">Issued</span><span>${escapeHtml(formatDate(invoice.sentAt))}</span></div>
          <div class="detail-row"><span class="muted">Due date</span><span>${escapeHtml(formatDate(invoice.dueDate))}</span></div>
        </div>
        <div class="panel">
          <div class="label">Event details</div>
          <div class="detail-row"><span class="muted">Location</span><span>${displayValue(eventLocation, 'Not specified')}</span></div>
          <div class="detail-row"><span class="muted">Date</span><span>${escapeHtml(formatDate(eventDate))}</span></div>
          <div class="detail-row"><span class="muted">Time</span><span>${displayValue(eventStartTime, 'Not specified')} – ${displayValue(eventEndTime, 'Not specified')}</span></div>
        </div>
      </section>

      ${invoice.terms?.trim() ? `<section class="terms"><div class="label">Information &amp; terms</div><div class="terms-copy">${escapeHtml(invoice.terms.trim())}</div></section>` : ''}

      <footer class="footer">Generated from Bookflow · Keep this invoice for your records</footer>
    </main>
  </body>
</html>`;
}

export async function saveInvoiceAsPdf(data: InvoicePdfData) {
  const html = createInvoicePdfHtml(data);

  if (Platform.OS === 'web') {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('Allow pop-ups in your browser, then try again.');
    }

    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onafterprint = () => printWindow.close();
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 100);
    return;
  }

  const hasPdfNativeModules = ['ExpoPrint', 'ExpoSharing', 'FileSystem'].every((moduleName) =>
    requireOptionalNativeModule(moduleName),
  );
  if (!hasPdfNativeModules) {
    throw new Error('PDF support requires one native app rebuild. Rebuild and reinstall Bookflow, then try again.');
  }

  try {
    const [{ File, Paths }, Print, Sharing] = await Promise.all([
      import('expo-file-system'),
      import('expo-print'),
      import('expo-sharing'),
    ]);
    const result = await Print.printToFileAsync({ html });
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      throw new Error('Saving files is not available on this device.');
    }

    const sourceFile = new File(result.uri);
    const destinationFile = new File(
      Paths.cache,
      `Bookflow-Invoice-${safeFileSegment(data.invoice.id)}.pdf`,
    );

    if (destinationFile.exists) {
      destinationFile.delete();
    }
    sourceFile.move(destinationFile);

    await Sharing.shareAsync(destinationFile.uri, {
      dialogTitle: `Save invoice ${data.invoice.id} as PDF`,
      mimeType: 'application/pdf',
      UTI: '.pdf',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('native module')) {
      throw new Error('PDF support requires one native app rebuild. Rebuild and reinstall Bookflow, then try again.');
    }
    throw error;
  }
}
