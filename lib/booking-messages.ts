import type { Locale } from '@/lib/i18n';

/**
 * Prepared customer messages: payment reminders, appointment reminders and delivery updates.
 *
 * BookFlow has no messaging provider or scheduler, so nothing here sends anything. The owner reviews
 * the text and shares it themselves (WhatsApp or the system share sheet), exactly like invoices are
 * shared today. Automated sending is deliberately not offered — see docs/booking-workflows-handoff.md.
 *
 * The text follows the app language the owner has chosen, matching how invoices are worded.
 */

export type ReminderMessageKind = 'payment' | 'appointment' | 'delivery';

export type ReminderMessageInput = {
  locale: Locale;
  kind: ReminderMessageKind;
  businessName: string;
  customerName: string;
  bookingTitle: string;
  /** Already formatted for display, e.g. "Sat, 12 Oct 2026". */
  eventDate: string;
  /** Already formatted, e.g. "10:00 AM – 6:00 PM". Optional. */
  eventTime?: string;
  location?: string;
  /** Already formatted money. */
  balanceDue?: string;
  depositDue?: string;
  depositDueDate?: string;
  invoiceNumber?: string;
  /** Customer-facing link (booking page or invoice), when one has been created. */
  link?: string;
  deliveryStatusLabel?: string;
  promisedDate?: string;
  deliveryLink?: string;
};

type Lines = (string | false | undefined | null)[];

function join(lines: Lines) {
  return lines.filter((line): line is string => typeof line === 'string').join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function greeting(locale: Locale, name: string) {
  const trimmed = name.trim();
  if (locale === 'ms-MY') return trimmed ? `Hai ${trimmed},` : 'Hai,';
  return trimmed ? `Hi ${trimmed},` : 'Hi,';
}

function signOff(locale: Locale, business: string) {
  const name = business.trim();
  if (!name) return locale === 'ms-MY' ? 'Terima kasih.' : 'Thank you.';
  return locale === 'ms-MY' ? `Terima kasih,\n${name}` : `Thank you,\n${name}`;
}

export function buildReminderMessage(input: ReminderMessageInput): string {
  const ms = input.locale === 'ms-MY';
  const when = [input.eventDate, input.eventTime].filter(Boolean).join(' · ');

  if (input.kind === 'payment') {
    return join([
      greeting(input.locale, input.customerName),
      '',
      ms
        ? `Ini peringatan mesra tentang bayaran untuk ${input.bookingTitle}${when ? ` (${when})` : ''}.`
        : `This is a friendly reminder about payment for ${input.bookingTitle}${when ? ` (${when})` : ''}.`,
      input.invoiceNumber && (ms ? `Invois: ${input.invoiceNumber}` : `Invoice: ${input.invoiceNumber}`),
      input.depositDue && (ms
        ? `Deposit perlu dibayar: ${input.depositDue}${input.depositDueDate ? ` sebelum ${input.depositDueDate}` : ''}`
        : `Deposit due: ${input.depositDue}${input.depositDueDate ? ` by ${input.depositDueDate}` : ''}`),
      input.balanceDue && (ms ? `Baki tertunggak: ${input.balanceDue}` : `Balance outstanding: ${input.balanceDue}`),
      input.link && '',
      input.link && (ms ? `Lihat butiran: ${input.link}` : `View details: ${input.link}`),
      '',
      ms ? 'Abaikan mesej ini jika anda sudah membuat bayaran.' : 'Please ignore this message if you have already paid.',
      '',
      signOff(input.locale, input.businessName),
    ]);
  }

  if (input.kind === 'appointment') {
    return join([
      greeting(input.locale, input.customerName),
      '',
      ms
        ? `Peringatan untuk tempahan anda: ${input.bookingTitle}.`
        : `A reminder about your booking: ${input.bookingTitle}.`,
      when && (ms ? `Tarikh & masa: ${when}` : `Date & time: ${when}`),
      input.location && (ms ? `Lokasi: ${input.location}` : `Location: ${input.location}`),
      input.link && '',
      input.link && (ms ? `Butiran tempahan: ${input.link}` : `Booking details: ${input.link}`),
      '',
      ms ? 'Sila maklumkan kami jika ada sebarang perubahan.' : 'Please let us know if anything has changed.',
      '',
      signOff(input.locale, input.businessName),
    ]);
  }

  return join([
    greeting(input.locale, input.customerName),
    '',
    ms
      ? `Kemas kini penghantaran untuk ${input.bookingTitle}${input.deliveryStatusLabel ? `: ${input.deliveryStatusLabel}` : ''}.`
      : `A delivery update for ${input.bookingTitle}${input.deliveryStatusLabel ? `: ${input.deliveryStatusLabel}` : ''}.`,
    input.promisedDate && (ms ? `Dijangka siap: ${input.promisedDate}` : `Expected by: ${input.promisedDate}`),
    input.deliveryLink && (ms ? `Pautan penghantaran: ${input.deliveryLink}` : `Delivery link: ${input.deliveryLink}`),
    input.link && !input.deliveryLink && '',
    input.link && !input.deliveryLink && (ms ? `Butiran tempahan: ${input.link}` : `Booking details: ${input.link}`),
    '',
    signOff(input.locale, input.businessName),
  ]);
}

/** WhatsApp wants an international number with digits only; a local 0-prefixed number is unusable. */
export function toWhatsAppNumber(phone: string | undefined) {
  const digits = (phone ?? '').trim().replace(/\D/g, '');
  if (!digits || digits.startsWith('0') || digits.length < 8) return null;
  return digits;
}
