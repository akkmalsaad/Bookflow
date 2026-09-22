import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import {
  BusinessProfile,
  CurrencyCode,
  Invoice,
  InvoicePayment,
} from '@/context/app-data-context';
import type { InvoiceCustomerDetails } from '@/lib/invoice-customer';
import {
  buildInvoiceRenderData,
  normalizeBankDetails,
  renderInvoiceHtml,
  resolveInvoicePresentation,
  type InvoiceDesign,
} from '@/lib/invoice-design';
import { getInvoiceNumber } from '@/lib/invoice-numbering';
import type { InvoiceDocumentLabels } from '@/lib/i18n';

function safeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export type InvoicePdfData = {
  invoice: Invoice;
  /**
   * The client as `resolveInvoiceCustomer` resolved them — the live record, or the invoice's frozen
   * snapshot once that record has been deleted. A PDF is never blocked on a missing client.
   */
  client: InvoiceCustomerDetails;
  businessProfile: BusinessProfile;
  currency: CurrencyCode;
  /** Every payment record for the invoice; totals are derived from these, never re-added here. */
  payments: InvoicePayment[];
  /** The workspace's live appearance settings, used only while the invoice is still a draft. */
  design: InvoiceDesign;
  paymentInstructions: string;
  /** Workspace default terms, printed when the invoice carries none of its own. */
  termsAndConditions?: string;
  /** Current RevenueCat entitlement gate; callers must opt in to custom branding. */
  allowBusinessLogo?: boolean;
  serviceName?: string;
  /** The document's wording, resolved by the caller from the app language. English if omitted. */
  labels?: InvoiceDocumentLabels;
  packageDetails?: string;
  eventLocation?: string;
  eventDate?: string;
  eventStartTime?: string;
  eventEndTime?: string;
};

/**
 * The invoice PDF.
 *
 * There is no template here any more: the markup comes from `lib/invoice-design`, the same renderer
 * that produces the customer's public page, so a downloaded invoice and the link the customer opens
 * are generated from identical HTML and CSS. An issued invoice renders from the design frozen into
 * its snapshot; a draft renders from the workspace's current settings.
 */
export function createInvoicePdfHtml(data: InvoicePdfData) {
  const presentation = resolveInvoicePresentation(data.invoice, {
    design: data.design,
    business: data.businessProfile,
    paymentDetails: normalizeBankDetails(data.businessProfile.paymentDetails),
    paymentInstructions: data.paymentInstructions,
    termsAndConditions: data.termsAndConditions ?? '',
    allowBusinessLogo: data.allowBusinessLogo ?? false,
  });

  return renderInvoiceHtml(
    buildInvoiceRenderData({
      labels: data.labels,
      invoice: data.invoice,
      client: data.client,
      payments: data.payments,
      currency: data.currency,
      design: presentation.design,
      business: presentation.business,
      paymentDetails: presentation.paymentDetails,
      paymentInstructions: presentation.paymentInstructions,
      termsAndConditions: presentation.termsAndConditions,
      serviceName: data.serviceName,
      packageDetails: data.packageDetails,
      eventLocation: data.eventLocation,
      eventDate: data.eventDate,
      eventStartTime: data.eventStartTime,
      eventEndTime: data.eventEndTime,
    }),
  );
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
    throw new Error('PDFs can’t be created on this device right now. Please try again later.');
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
      `BookFlow-Invoice-${safeFileSegment(getInvoiceNumber(data.invoice))}.pdf`,
    );

    if (destinationFile.exists) {
      destinationFile.delete();
    }
    sourceFile.move(destinationFile);

    await Sharing.shareAsync(destinationFile.uri, {
      dialogTitle: `Save invoice ${getInvoiceNumber(data.invoice)} as PDF`,
      mimeType: 'application/pdf',
      UTI: '.pdf',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('native module')) {
      throw new Error('PDFs can’t be created on this device right now. Please try again later.');
    }
    throw error;
  }
}
