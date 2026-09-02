import type { Customer, Invoice, InvoicePayment } from '@/context/app-data-context';

/**
 * Placeholder records for the customisation preview.
 *
 * Kept out of the screen so the preview runs through exactly the same `buildInvoiceRenderData` path
 * a real invoice does — the totals below are calculated, not written down.
 */
export const SAMPLE_INVOICE: Invoice = {
  id: 'sample-invoice',
  bookingId: 'sample-booking',
  customerId: 'sample-customer',
  amount: 4850,
  dueDate: '2026-09-30',
  status: 'Partially Paid',
  sentAt: '2026-09-05',
  invoiceNumber: 'INV-2026-0042',
  serviceName: 'Wedding Photography — Full Day Coverage',
  packageDetails: 'Two photographers, 8 hours of coverage, 400+ edited images delivered in an online gallery.',
  eventLocation: 'Majestic Hotel, Kuala Lumpur',
  eventDate: '2026-10-18',
  eventStartTime: '10:00',
  eventEndTime: '22:00',
};

export const SAMPLE_CUSTOMER: Customer = {
  id: 'sample-customer',
  name: 'Nur Aina binti Rahman',
  email: 'aina.rahman@example.com',
  phone: '+60 12-345 6789',
  location: '18 Jalan Bukit Bintang, 55100 Kuala Lumpur',
  notes: '',
};

export const SAMPLE_PAYMENTS: InvoicePayment[] = [
  { id: 'sample-deposit', invoiceId: 'sample-invoice', amount: 1500, method: 'Bank transfer', date: '2026-09-05', kind: 'deposit', recordedAt: '' },
  { id: 'sample-payment', invoiceId: 'sample-invoice', amount: 850, method: 'E-wallet', date: '2026-09-20', kind: 'payment', recordedAt: '' },
];
