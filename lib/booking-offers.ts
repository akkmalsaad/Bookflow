import type { Booking, Customer, Invoice, PackageOption } from '@/context/app-data-context';
import {
  buildPricedLines,
  calculateBookingTotals,
  chargeAmountCents,
  fromCents,
  normalizeCharges,
  resolveDepositCents,
  toCents,
  type BookingCharge,
  type DepositTerms,
  type PricedLine,
} from '@/lib/booking-pricing';
import { normalizeBufferMinutes } from '@/lib/booking-conflicts';

/**
 * Booking forms, quotations and customer booking pages.
 *
 * All three are an *offer* the owner prepares from the booking modal and shares as a private link:
 *
 *  - booking_form: agreed package, price, date and terms; the customer fills in their own details.
 *  - quotation:    a versioned price for a known customer, with a validity date, accepted by link.
 *  - booking_page: a read-only page for an existing booking (agreed details, invoice, payments,
 *                  delivery status).
 *
 * The owner's workspace keeps the record (`BookingOffer`). The shared link lives in the
 * `public_booking_offers` table and carries a frozen public snapshot (`OfferSnapshot`). The server
 * resolves every price from that owner-written snapshot, never from what the customer posts.
 *
 * Three statuses stay separate throughout: the offer's own status (sent, submitted, accepted…), the
 * booking's job status, and payment status. Submitting a form or accepting a quotation never marks
 * anything paid and never confirms the booking by itself.
 */

export type OfferKind = 'booking_form' | 'quotation' | 'booking_page';

export type OfferStatus =
  | 'draft'
  | 'sent'
  | 'submitted'
  | 'accepted'
  | 'declined'
  | 'change_requested'
  | 'converted'
  | 'revoked';

/** The agreed details. Editable only until the customer submits or accepts. */
export type OfferDetails = {
  title: string;
  packageId?: string;
  packageName: string;
  packageDetails?: string;
  includedServices?: string[];
  basePrice: number;
  charges: BookingCharge[];
  deposit?: DepositTerms | null;
  date: string;
  startTime: string;
  endTime: string;
  bufferMinutes?: number;
  location?: string;
  /** Owner-only notes, copied onto the booking. Never part of the public snapshot. */
  notes?: string;
  terms: string;
  /** Ids of bookings the owner saw conflicting and deliberately accepted when preparing this. */
  acceptedConflictIds?: string[];
};

export type OfferVersion = { version: number; details: OfferDetails; createdAt: string };

/** What the customer submitted. Validated again on the server before it is ever stored. */
export type OfferResponse = {
  name?: string;
  phone?: string;
  email?: string;
  /** The event location the customer confirmed or entered. */
  location?: string;
  /** The customer's own location, kept on their customer record. */
  customerLocation?: string;
  /** No longer collected; kept so any earlier response still reads. */
  notes?: string;
};

export type BookingOffer = {
  id: string;
  kind: Exclude<OfferKind, 'booking_page'>;
  /** Local calendar date the offer was created. */
  createdAt: string;
  /** Human-facing reference for quotations, e.g. "Q-0003". */
  number?: string;
  /** A customer the owner chose while preparing. Required for quotations, optional for forms. */
  customerId?: string;
  status: OfferStatus;
  version: number;
  details: OfferDetails;
  /** Earlier versions, oldest first. Never rewritten. */
  history?: OfferVersion[];
  /** Quotation validity, `YYYY-MM-DD`. */
  validUntil?: string;
  requireEmail?: boolean;
  sharedAt?: string;
  /** The version the customer's link currently shows. Lower than `version` after an unshared revision. */
  sharedVersion?: number;
  linkExpiresAt?: string;
  /** Pulled from the server once the customer responds. */
  response?: OfferResponse;
  respondedVersion?: number;
  termsVersion?: string;
  termsAcceptedAt?: string;
  submittedAt?: string;
  changeRequest?: string;
  bookingId?: string;
  invoiceId?: string;
};

/** One priced line as the customer sees it — in cents, so the server can total it exactly. */
export type SnapshotLine = {
  kind: PricedLine['kind'];
  description: string;
  detail?: string;
  quantity: number;
  unit?: string;
  unitPriceCents: number;
  amountCents: number;
};

/**
 * The frozen, public half of an offer. Written by the authenticated owner; read by the server to
 * price and validate a submission; projected again by the Edge Function before the customer sees it.
 */
export type OfferSnapshot = {
  v: 1;
  kind: OfferKind;
  version: number;
  currency: string;
  locale: string;
  /** IANA zone the owner's dates and times are in, so the server reads "this month" the same way. */
  timeZone: string;
  business: { name: string; phone: string; email: string; logoUrl: string | null };
  title: string;
  packageName: string;
  packageDetails: string;
  includedServices: string[];
  lines: SnapshotLine[];
  subtotalCents: number;
  chargesCents: number;
  totalCents: number;
  deposit: { type: DepositTerms['type']; value: number; amountCents: number; dueDate: string | null } | null;
  date: string;
  startTime: string;
  endTime: string;
  bufferMinutes: number;
  location: string;
  terms: string;
  termsVersion: string;
  validUntil: string | null;
  requireEmail: boolean;
  /** Greeting only, for a quotation addressed to a known customer. Never their contact details. */
  customerName: string;
  allowConflicts: boolean;
  acceptedConflictIds: string[];
};

/** FNV-1a, enough to tell two versions of the terms apart. Not a security measure. */
function fnv1a(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Identifies the exact terms a customer accepted: the offer version plus a hash of the text. */
export function computeTermsVersion(version: number, terms: string) {
  return `t${version}-${fnv1a(terms.trim())}`;
}

export function getOfferTotals(details: OfferDetails) {
  return calculateBookingTotals({ basePrice: details.basePrice, charges: details.charges, deposit: details.deposit ?? null });
}

export function buildOfferSnapshot(input: {
  kind: OfferKind;
  version: number;
  details: OfferDetails;
  currency: string;
  locale: string;
  timeZone: string;
  business: OfferSnapshot['business'];
  validUntil?: string;
  requireEmail?: boolean;
  customerName?: string;
}): OfferSnapshot {
  const { details } = input;
  const charges = normalizeCharges(details.charges);
  const lines = buildPricedLines({
    packageName: details.packageName,
    packageDetails: details.packageDetails,
    basePrice: details.basePrice,
    charges,
  }).map<SnapshotLine>((line) => ({
    kind: line.kind,
    description: line.description,
    ...(line.detail ? { detail: line.detail } : {}),
    quantity: line.quantity,
    ...(line.unit ? { unit: line.unit } : {}),
    unitPriceCents: toCents(line.unitPrice),
    amountCents: chargeAmountCents(line.quantity, line.unitPrice),
  }));
  const totals = calculateBookingTotals({ basePrice: details.basePrice, charges, deposit: details.deposit ?? null });
  const terms = details.terms.trim();
  const acceptedConflictIds = (details.acceptedConflictIds ?? []).filter((id) => typeof id === 'string').slice(0, 50);

  return {
    v: 1,
    kind: input.kind,
    version: input.version,
    currency: input.currency,
    locale: input.locale,
    timeZone: input.timeZone || 'UTC',
    business: input.business,
    title: details.title.trim(),
    packageName: details.packageName.trim(),
    packageDetails: details.packageDetails?.trim() ?? '',
    includedServices: (details.includedServices ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 30),
    lines,
    subtotalCents: totals.baseCents,
    chargesCents: totals.chargesCents,
    totalCents: totals.totalCents,
    deposit: details.deposit
      ? {
          type: details.deposit.type,
          value: details.deposit.value,
          amountCents: totals.depositDueCents,
          dueDate: details.deposit.dueDate ?? null,
        }
      : null,
    date: details.date,
    startTime: details.startTime,
    endTime: details.endTime,
    bufferMinutes: normalizeBufferMinutes(details.bufferMinutes),
    location: details.location?.trim() ?? '',
    terms,
    termsVersion: computeTermsVersion(input.version, terms),
    validUntil: input.validUntil ?? null,
    requireEmail: Boolean(input.requireEmail),
    customerName: input.customerName?.trim() ?? '',
    allowConflicts: acceptedConflictIds.length > 0,
    acceptedConflictIds,
  };
}

/** A version is frozen once the customer has acted on it. */
export function isOfferLocked(offer: Pick<BookingOffer, 'status'>) {
  return offer.status === 'submitted' || offer.status === 'accepted' || offer.status === 'converted';
}

export function canReviseOffer(offer: Pick<BookingOffer, 'status'>) {
  return !isOfferLocked(offer) && offer.status !== 'revoked';
}

/**
 * Starts a new version without touching the old one, which moves into `history` unchanged.
 * A draft that has never been shared is edited in place — there is nothing to preserve yet.
 */
export function reviseOffer(offer: BookingOffer, details: OfferDetails, nowIso: string): BookingOffer {
  if (!canReviseOffer(offer)) return offer;
  if (offer.status === 'draft' && !offer.sharedAt) return { ...offer, details };
  return {
    ...offer,
    version: offer.version + 1,
    details,
    history: [...(offer.history ?? []), { version: offer.version, details: offer.details, createdAt: nowIso }],
    status: offer.status === 'draft' ? 'draft' : offer.status,
  };
}

/** The details of the exact version the customer responded to. */
export function getRespondedDetails(offer: BookingOffer): OfferDetails | null {
  const version = offer.respondedVersion ?? offer.version;
  if (version === offer.version) return offer.details;
  return offer.history?.find((entry) => entry.version === version)?.details ?? null;
}

function normalizeEmail(value: string | undefined) {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Who a submission belongs to.
 *
 * A customer the owner chose while preparing the form always wins. Otherwise an existing customer
 * is reused only on an exact (case-insensitive) email match — never on a matching name, which two
 * different people can share, and never on a phone number alone. Anything else is a new customer.
 * Nothing about the matched record is shown back to the person submitting.
 */
export function matchSubmissionCustomer(
  customers: Customer[],
  response: OfferResponse,
  preselectedCustomerId?: string | null,
): Customer | null {
  if (preselectedCustomerId) {
    const chosen = customers.find((customer) => customer.id === preselectedCustomerId);
    if (chosen) return chosen;
  }
  const email = normalizeEmail(response.email);
  if (!email) return null;
  return customers.find((customer) => normalizeEmail(customer.email) === email) ?? null;
}

/** Deterministic ids, so materialising the same submission twice can only ever produce one record. */
export function offerRecordIds(offerId: string) {
  const safe = offerId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  return {
    customerId: `cust-ofr-${safe}`,
    bookingId: `bk-ofr-${safe}`,
    invoiceId: `inv-ofr-${safe}`,
    reminderId: `rem-ofr-${safe}`,
    notificationId: `offer-${safe}`,
  };
}

/** Rebuilds agreed details from a stored public snapshot, for when the local record is missing. */
export function detailsFromSnapshot(snapshot: OfferSnapshot): OfferDetails {
  const charges: BookingCharge[] = snapshot.lines
    .filter((line) => line.kind === 'charge')
    .map((line, index) => ({
      id: `chg-snap-${index}`,
      description: line.description,
      quantity: line.quantity,
      unitPrice: fromCents(line.unitPriceCents),
      amount: fromCents(line.amountCents),
      ...(line.unit ? { unit: line.unit } : {}),
    }));
  return {
    title: snapshot.title,
    packageName: snapshot.packageName,
    packageDetails: snapshot.packageDetails || undefined,
    includedServices: snapshot.includedServices,
    basePrice: fromCents(snapshot.subtotalCents),
    charges,
    deposit: snapshot.deposit
      ? { type: snapshot.deposit.type, value: snapshot.deposit.value, ...(snapshot.deposit.dueDate ? { dueDate: snapshot.deposit.dueDate } : {}) }
      : null,
    date: snapshot.date,
    startTime: snapshot.startTime,
    endTime: snapshot.endTime,
    bufferMinutes: snapshot.bufferMinutes,
    location: snapshot.location,
    terms: snapshot.terms,
  };
}

/**
 * The booking an accepted quotation or submitted form becomes. Status is Inquiry — pending the
 * owner's confirmation — because a submission is neither a confirmation nor a payment.
 */
export function buildBookingFromOffer(input: {
  offerId: string;
  details: OfferDetails;
  customerId: string;
  response?: OfferResponse;
  createdAt: string;
  noteLabel: string;
}): Booking {
  const { details, response } = input;
  const ids = offerRecordIds(input.offerId);
  const charges = normalizeCharges(details.charges);
  const totals = calculateBookingTotals({ basePrice: details.basePrice, charges, deposit: details.deposit ?? null });
  const location = (response?.location?.trim() || details.location?.trim() || '').slice(0, 300);
  const notes = [input.noteLabel, details.notes?.trim(), response?.notes?.trim()].filter(Boolean).join('\n\n');

  return {
    id: ids.bookingId,
    createdAt: input.createdAt,
    customerId: input.customerId,
    title: details.title || details.packageName,
    date: details.date,
    time: details.startTime,
    startTime: details.startTime,
    endTime: details.endTime,
    location: location || 'Client location',
    packageName: details.packageName,
    ...(details.packageId ? { packageId: details.packageId } : {}),
    price: fromCents(totals.totalCents),
    basePrice: fromCents(totals.baseCents),
    ...(charges.length ? { charges } : {}),
    ...(totals.depositDueCents > 0 ? { depositAmount: fromCents(totals.depositDueCents) } : {}),
    ...(details.deposit ? { depositType: details.deposit.type, depositValue: details.deposit.value } : {}),
    ...(details.deposit?.dueDate ? { depositDueDate: details.deposit.dueDate } : {}),
    ...(normalizeBufferMinutes(details.bufferMinutes) ? { bufferMinutes: normalizeBufferMinutes(details.bufferMinutes) } : {}),
    ...(details.includedServices?.length ? { includedServices: details.includedServices } : {}),
    ...(details.terms ? { terms: details.terms } : {}),
    sourceOfferId: input.offerId,
    status: 'Inquiry',
    notes,
  };
}

/** The invoice fields an offer contributes. Numbering and the settings snapshot are stamped later. */
export function buildInvoiceFieldsFromBooking(
  booking: Booking,
  details: OfferDetails,
  dueDate: string,
  sentAt: string,
): Omit<Invoice, 'id' | 'customerId' | 'bookingId'> {
  const charges = normalizeCharges(booking.charges);
  const totals = calculateBookingTotals({ basePrice: booking.basePrice ?? booking.price, charges, deposit: details.deposit ?? null });
  return {
    amount: fromCents(totals.totalCents),
    dueDate,
    status: 'Draft',
    sentAt,
    serviceName: booking.packageName,
    packageDetails: details.packageDetails,
    eventLocation: booking.location,
    eventDate: booking.date,
    eventTime: booking.startTime,
    eventStartTime: booking.startTime,
    eventEndTime: booking.endTime,
    terms: details.terms || undefined,
    lineItems: buildPricedLines({ packageName: booking.packageName, packageDetails: details.packageDetails, basePrice: booking.basePrice ?? booking.price, charges }),
    ...(totals.depositDueCents > 0 ? { depositDue: fromCents(totals.depositDueCents) } : {}),
    ...(details.deposit?.dueDate ? { depositDueDate: details.deposit.dueDate } : {}),
    sourceOfferId: booking.sourceOfferId,
  };
}

/**
 * Booking forms to show on the Bookings calendar on their event date before they have become a
 * booking — display only: nothing is reserved or counted for them here.
 *
 * A form drops out as soon as its real booking exists (`bookingIds` holds every booking id still in
 * the workspace, including one held by a deleted invoice), found through the form's own booking id,
 * so the same form is never shown twice. A form awaiting the customer is shown while its link is
 * open; turned off, declined or expired, it is not. One the customer has submitted is shown until
 * the app has turned it into its booking.
 */
export function getCalendarPendingForms(offers: BookingOffer[], bookingIds: ReadonlySet<string>, nowMs: number) {
  return offers.filter((offer) => {
    if (offer.kind !== 'booking_form') return false;
    if (bookingIds.has(offer.bookingId ?? offerRecordIds(offer.id).bookingId)) return false;
    if (offer.status === 'submitted') return true;
    if (offer.status !== 'sent' && offer.status !== 'change_requested') return false;
    const expires = offer.linkExpiresAt ? Date.parse(offer.linkExpiresAt) : Number.NaN;
    return !(Number.isFinite(expires) && expires <= nowMs);
  });
}

/** Seeds offer details from a service, the same way the booking form prefills from one. */
export function detailsFromPackage(pkg: PackageOption, base: Omit<OfferDetails, 'packageName' | 'basePrice' | 'title'>): OfferDetails {
  return {
    ...base,
    title: pkg.name,
    packageId: pkg.id,
    packageName: pkg.name,
    packageDetails: pkg.details,
    includedServices: pkg.includedServices,
    basePrice: pkg.price,
  };
}

/** Next quotation reference, never reusing one already issued. */
export function nextQuotationNumber(offers: Pick<BookingOffer, 'number'>[]) {
  const highest = offers.reduce((max, offer) => {
    const match = /^Q-(\d+)$/.exec(offer.number ?? '');
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `Q-${String(highest + 1).padStart(4, '0')}`;
}

/** A quotation whose validity date has passed reads as expired, without rewriting the record. */
export function isQuotationExpired(offer: Pick<BookingOffer, 'kind' | 'validUntil' | 'status'>, todayKey: string) {
  return offer.kind === 'quotation' && Boolean(offer.validUntil) && (offer.validUntil as string) < todayKey
    && (offer.status === 'draft' || offer.status === 'sent' || offer.status === 'change_requested');
}

export function normalizeOffers(value: unknown): BookingOffer[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is BookingOffer => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const offer = item as Partial<BookingOffer>;
    return typeof offer.id === 'string'
      && (offer.kind === 'booking_form' || offer.kind === 'quotation')
      && typeof offer.version === 'number'
      && Boolean(offer.details && typeof offer.details === 'object');
  });
}

export { resolveDepositCents };
