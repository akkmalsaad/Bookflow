import * as Linking from 'expo-linking';
import { Alert, Platform } from 'react-native';

import type { Customer, Invoice } from '@/context/app-data-context';

type ShareInvoiceOptions = {
  invoice: Invoice;
  customer?: Customer;
  currencyFormatter: Intl.NumberFormat;
  createShareLink: (invoiceId: string) => Promise<string>;
};

/**
 * Sends an invoice to the customer over WhatsApp using its secure public link.
 * Shared by the invoices tab and the customer profile so both send the same message.
 */
export async function shareInvoiceOnWhatsApp({
  invoice,
  customer,
  currencyFormatter,
  createShareLink,
}: ShareInvoiceOptions) {
  const rawPhone = customer?.phone.trim() ?? '';
  const phoneNumber = rawPhone.replace(/\D/g, '');

  if (!customer || !phoneNumber || phoneNumber.startsWith('0')) {
    Alert.alert(
      'WhatsApp number required',
      'Add the customer phone number with its country code, for example +60 12-345 6789.',
    );
    return false;
  }

  try {
    const invoiceUrl = await createShareLink(invoice.id);
    const message = [
      `Hi ${customer.name},`,
      '',
      `Here is invoice ${invoice.id} for ${currencyFormatter.format(invoice.amount)}.`,
      `Due date: ${invoice.dueDate}`,
      '',
      `Review and respond to your invoice: ${invoiceUrl}`,
      'The secure link is valid for 30 days.',
    ].join('\n');
    const encodedMessage = encodeURIComponent(message);
    const whatsappAppUrl = `whatsapp://send?phone=${phoneNumber}&text=${encodedMessage}`;
    const whatsappWebUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;

    try {
      await Linking.openURL(Platform.OS === 'web' ? whatsappWebUrl : whatsappAppUrl);
    } catch {
      await Linking.openURL(whatsappWebUrl);
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The public invoice link could not be created.';
    Alert.alert('Unable to send invoice', message);
    return false;
  }
}
