type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
const string = (value: unknown, max = 2000) => typeof value === 'string' ? value.slice(0, max) : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const cents = (value: unknown) => Math.round(number(value) * 100);
const int = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 ? value as number : 0;
const isDay = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isTime = (value: unknown) => typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
const httpLink = (value: unknown) => {
  const text = string(value, 500).trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(text) ? text : '';
};

const BOOKING_STATUS: Record<string, string> = {
  Inquiry: 'pending', Confirmed: 'confirmed', 'Deposit Paid': 'confirmed',
  'In Progress': 'in_progress', Completed: 'completed', Cancelled: 'cancelled',
};
const FULFILMENT = ['not_started', 'service_completed', 'in_progress', 'delivered'];

/**
 * The only projection of a booking offer allowed to leave the service-role boundary.
 *
 * Built field by field from an allow-list — stored objects are never spread — so internal notes,
 * customer ids, other customers' details, the owner's plan and anything added to the workspace in
 * future cannot leak by omission. Money is totalled here in cents from the live booking once it
 * exists, and from the owner's frozen snapshot before that, never from anything the customer sent.
 */
export function publicBookingOfferResponse(value: unknown, today = new Date().toISOString().slice(0, 10)) {
  const state = object(value);
  const snapshot = object(state.offer);
  const booking = state.booking ? object(state.booking) : null;
  const rawInvoice = state.invoice ? object(state.invoice) : null;
  const invoice = rawInvoice && !rawInvoice.deletedAt && rawInvoice.status !== 'Void' && rawInvoice.status !== 'Cancelled' ? rawInvoice : null;
  const kind = ['booking_form', 'quotation', 'booking_page'].includes(string(state.kind)) ? string(state.kind) : 'booking_page';
  const status = ['sent', 'submitted', 'accepted', 'declined', 'change_requested', 'converted'].includes(string(state.status)) ? string(state.status) : 'converted';
  const currency = ['MYR', 'IDR', 'USD'].includes(string(snapshot.currency)) ? string(snapshot.currency) : 'MYR';
  const formatter = new Intl.NumberFormat(currency === 'MYR' ? 'ms-MY' : currency === 'IDR' ? 'id-ID' : 'en-US', { style: 'currency', currency });
  const money = (amount: number) => formatter.format(amount / 100);

  type Line = { kind: 'package' | 'charge'; description: string; detail: string; quantity: number; unit: string; unitPriceCents: number; amountCents: number };
  let lines: Line[];
  if (booking) {
    const charges = (Array.isArray(booking.charges) ? booking.charges : []).slice(0, 30).map(object).flatMap((charge) => {
      const quantity = number(charge.quantity);
      const unitPriceCents = cents(charge.unitPrice);
      if (quantity <= 0 || unitPriceCents < 0) return [];
      return [{ kind: 'charge' as const, description: string(charge.description, 120), detail: '', quantity, unit: string(charge.unit, 24),
        unitPriceCents, amountCents: Math.round(Math.round(quantity * 100) * unitPriceCents / 100) }];
    });
    const chargesCents = charges.reduce((sum, line) => sum + line.amountCents, 0);
    const baseCents = typeof booking.basePrice === 'number' ? cents(booking.basePrice) : Math.max(0, cents(booking.price) - chargesCents);
    lines = [{ kind: 'package', description: string(booking.packageName, 160) || string(snapshot.packageName, 160), detail: string(snapshot.packageDetails, 500),
      quantity: 1, unit: '', unitPriceCents: baseCents, amountCents: baseCents }, ...charges];
  } else {
    lines = (Array.isArray(snapshot.lines) ? snapshot.lines : []).slice(0, 31).map(object).map((line) => ({
      kind: line.kind === 'charge' ? 'charge' as const : 'package' as const,
      description: string(line.description, 160), detail: string(line.detail, 500), quantity: number(line.quantity) || 1,
      unit: string(line.unit, 24), unitPriceCents: int(line.unitPriceCents), amountCents: int(line.amountCents),
    }));
  }
  const subtotalCents = lines.filter((line) => line.kind === 'package').reduce((sum, line) => sum + line.amountCents, 0);
  const chargesCents = lines.filter((line) => line.kind === 'charge').reduce((sum, line) => sum + line.amountCents, 0);
  const totalCents = invoice ? Math.max(0, cents(invoice.amount)) : subtotalCents + chargesCents;

  const payments = invoice
    ? (Array.isArray(state.payments) ? state.payments : []).map(object).filter((payment) => payment.invoiceId === invoice.id)
    : [];
  const recordedCents = payments.reduce((sum, payment) => sum + Math.max(0, cents(payment.amount)), 0);
  const paidCents = invoice && invoice.status === 'Paid' ? totalCents : Math.min(recordedCents, totalCents);

  const deposit = object(snapshot.deposit);
  const agreedDepositCents = booking
    ? Math.min(Math.max(0, cents(booking.depositAmount)), totalCents)
    : Math.min(int(deposit.amountCents), totalCents);
  const depositDueDate = booking ? (isDay(booking.depositDueDate) ? string(booking.depositDueDate) : '') : (isDay(deposit.dueDate) ? string(deposit.dueDate) : '');

  const fulfilment = booking ? object(booking.fulfilment) : {};
  const hasFulfilment = FULFILMENT.includes(string(fulfilment.status));
  const respondable = (kind === 'booking_form' || kind === 'quotation') && (status === 'sent' || status === 'change_requested');
  const validUntil = isDay(snapshot.validUntil) ? string(snapshot.validUntil) : '';
  const business = object(snapshot.business);
  const logoUrl = httpLink(business.logoUrl);
  const invoiceToken = invoice && typeof state.invoice_token === 'string' && /^[0-9a-f-]{36}$/i.test(state.invoice_token) ? state.invoice_token : '';

  return {
    kind,
    status,
    version: int(state.version) || 1,
    locale: ['en', 'ms-MY'].includes(string(snapshot.locale)) ? string(snapshot.locale) : 'en',
    currency,
    timeZone: string(snapshot.timeZone, 64),
    business: { name: string(business.name, 160), phone: string(business.phone, 40), email: string(business.email, 254), logoUrl },
    title: string(snapshot.title, 160),
    customerName: kind === 'quotation' ? string(snapshot.customerName, 120) : '',
    packageName: lines[0]?.description ?? '',
    packageDetails: string(snapshot.packageDetails, 1000),
    includedServices: (Array.isArray(snapshot.includedServices) ? snapshot.includedServices : []).slice(0, 30).map((item) => string(item, 160)).filter(Boolean),
    lines: lines.map((line) => ({
      kind: line.kind, description: line.description, detail: line.detail, quantity: line.quantity, unit: line.unit,
      unitPrice: money(line.unitPriceCents), amount: money(line.amountCents),
    })),
    totals: {
      subtotal: money(subtotalCents), charges: money(chargesCents), total: money(totalCents), hasCharges: chargesCents > 0,
      deposit: money(agreedDepositCents), hasDeposit: agreedDepositCents > 0, depositDueDate,
      depositOutstanding: money(Math.max(0, agreedDepositCents - paidCents)),
      paid: money(paidCents), balance: money(Math.max(0, totalCents - paidCents)),
    },
    date: isDay(booking?.date) ? string(booking?.date) : isDay(snapshot.date) ? string(snapshot.date) : '',
    startTime: isTime(booking?.startTime) ? string(booking?.startTime) : isTime(snapshot.startTime) ? string(snapshot.startTime) : '',
    endTime: isTime(booking?.endTime) ? string(booking?.endTime) : isTime(snapshot.endTime) ? string(snapshot.endTime) : '',
    location: string(booking?.location, 300) || string(snapshot.location, 300),
    terms: string(snapshot.terms, 8000),
    termsVersion: string(snapshot.termsVersion, 40),
    validUntil,
    isExpiredQuote: kind === 'quotation' && Boolean(validUntil) && validUntil < today,
    requireEmail: snapshot.requireEmail === true,
    canRespond: respondable,
    changeRequestsLeft: Math.max(0, 3 - int(state.change_request_count)),
    submittedAt: string(state.submitted_at, 40),
    booking: booking ? { status: BOOKING_STATUS[string(booking.status)] ?? 'pending' } : null,
    fulfilment: hasFulfilment
      ? { status: string(fulfilment.status), promisedDate: isDay(fulfilment.promisedDate) ? string(fulfilment.promisedDate) : '', deliveryLink: httpLink(fulfilment.deliveryLink) }
      : null,
    // The invoice appears only once the owner has shared it, so the page never presents one the
    // customer cannot open yet.
    invoice: invoice && invoiceToken ? { number: string(invoice.invoiceNumber, 60), token: invoiceToken } : null,
    payments: payments.slice(0, 50).map((payment) => ({
      date: isDay(payment.date) ? string(payment.date) : '',
      amount: money(Math.max(0, cents(payment.amount))),
      kind: payment.kind === 'deposit' ? 'deposit' : 'payment',
    })),
  };
}

/** Business errors the RPC returns, mapped to HTTP status codes. Nothing else is echoed. */
export const RESPONSE_ERRORS: Record<string, number> = {
  unsupported_action: 400,
  invalid_request: 400,
  invalid_name: 422,
  invalid_phone: 422,
  invalid_email: 422,
  invalid_location: 422,
  invalid_notes: 422,
  invalid_customer_location: 422,
  invalid_change: 422,
  terms_required: 422,
  offer_changed: 409,
  offer_expired: 409,
  offer_invalid: 409,
  slot_unavailable: 409,
  plan_limit: 409,
  // The owner's plan could not be verified just now; retrying later can succeed.
  entitlement_unavailable: 503,
  closed: 409,
  rate_limited: 429,
};
