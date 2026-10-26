/**
 * Additional charges, booking totals and deposits.
 *
 * Every figure is worked in sen (integer cents) and only converted back to a display amount at the
 * edge, the same convention `lib/invoice-payments` already uses for payments — so RM 33.33 × 3 is
 * RM 99.99, not RM 99.99000000000001, and a total can never drift from the sum of its lines.
 *
 * BookFlow has no discount or tax rules today, so none are introduced here: a booking's total is its
 * agreed package price plus any additional charges, exactly.
 *
 * Pure on purpose — no React, no context — so the booking form, the invoice renderer, the public
 * booking page and the tests all read the same rules.
 */

/** One additional line on a booking, e.g. "Transport · 2 × RM 50". */
export type BookingCharge = {
  id: string;
  description: string;
  /** Up to two decimal places, so "1.5 extra hours" is expressible. */
  quantity: number;
  /** Price of one unit, in the workspace currency's major unit. */
  unitPrice: number;
  /** quantity × unitPrice, worked in cents and frozen when the booking is saved. */
  amount: number;
  /** Free-text unit shown after the quantity ("hour", "km"). Optional. */
  unit?: string;
  /** The saved add-on this line was filled from, when it was. Informational only. */
  addOnId?: string;
};

/** A reusable add-on saved on a service: a default description, price and unit. */
export type SavedAddOn = {
  id: string;
  name: string;
  unitPrice: number;
  unit?: string;
};

export type DepositType = 'fixed' | 'percent';

/** The deposit agreed for one booking: how it was expressed, and optionally when it is due. */
export type DepositTerms = {
  type: DepositType;
  /** A fixed amount in the major unit, or a percentage between 0 and 100. */
  value: number;
  dueDate?: string;
};

/** A priced line as frozen onto an invoice or a public booking snapshot. */
export type PricedLine = {
  kind: 'package' | 'charge';
  description: string;
  detail?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  amount: number;
};

export const MAX_CHARGE_ROWS = 30;
export const MAX_CHARGE_QUANTITY = 9999;
/** Generous ceiling that still keeps cents well inside Number.MAX_SAFE_INTEGER. */
export const MAX_MONEY_AMOUNT = 100_000_000;
export const MAX_CHARGE_DESCRIPTION_LENGTH = 120;

export function toCents(amount: number) {
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100);
}

export function fromCents(cents: number) {
  return cents / 100;
}

/** Reads "1,250.50" or "1250.5" as a money amount rounded to the cent. Null when unusable. */
export function parseMoneyInput(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? fromCents(toCents(value)) : null;
  const normalized = (value ?? '').replace(/,/g, '').trim();
  if (!normalized || !/^\d*\.?\d*$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return fromCents(toCents(parsed));
}

/** Reads a quantity with at most two decimals ("1.5"). Null when it is not a usable positive number. */
export function parseQuantityInput(value: string | number | null | undefined): number | null {
  const text = typeof value === 'number' ? String(value) : (value ?? '').replace(/,/g, '').trim();
  if (!text || !/^\d*\.?\d{0,2}$/.test(text)) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_CHARGE_QUANTITY) return null;
  return Math.round(parsed * 100) / 100;
}

/** quantity × unit price, in cents, without floating-point drift. */
export function chargeAmountCents(quantity: number, unitPrice: number) {
  const quantityHundredths = Math.round((Number.isFinite(quantity) ? quantity : 0) * 100);
  return Math.round((quantityHundredths * toCents(unitPrice)) / 100);
}

export type ChargeDraft = {
  id?: string;
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  unit?: string;
  addOnId?: string;
};

export type ChargeValidationError = 'description' | 'quantity' | 'price' | 'amount';

export function validateChargeDraft(
  draft: ChargeDraft,
  createId: () => string = () => `chg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
): { ok: true; charge: BookingCharge } | { ok: false; error: ChargeValidationError } {
  const description = draft.description.trim();
  if (!description || description.length > MAX_CHARGE_DESCRIPTION_LENGTH) return { ok: false, error: 'description' };

  const quantity = parseQuantityInput(draft.quantity);
  if (quantity === null) return { ok: false, error: 'quantity' };

  const unitPrice = parseMoneyInput(draft.unitPrice);
  if (unitPrice === null || unitPrice <= 0 || unitPrice > MAX_MONEY_AMOUNT) return { ok: false, error: 'price' };

  const amountCents = chargeAmountCents(quantity, unitPrice);
  if (amountCents <= 0 || amountCents > toCents(MAX_MONEY_AMOUNT)) return { ok: false, error: 'amount' };

  const unit = draft.unit?.trim();
  return {
    ok: true,
    charge: {
      id: draft.id?.trim() || createId(),
      description,
      quantity,
      unitPrice,
      amount: fromCents(amountCents),
      ...(unit ? { unit: unit.slice(0, 24) } : {}),
      ...(draft.addOnId ? { addOnId: draft.addOnId } : {}),
    },
  };
}

/**
 * Charges as stored, made safe to sum. Anything malformed is dropped rather than guessed at, and the
 * amount is re-derived from quantity × unit price so a hand-edited record cannot disagree with itself.
 */
export function normalizeCharges(value: unknown): BookingCharge[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const source = item as Record<string, unknown>;
    const result = validateChargeDraft(
      {
        id: typeof source.id === 'string' ? source.id : undefined,
        description: typeof source.description === 'string' ? source.description : '',
        quantity: typeof source.quantity === 'number' ? source.quantity : NaN,
        unitPrice: typeof source.unitPrice === 'number' ? source.unitPrice : NaN,
        unit: typeof source.unit === 'string' ? source.unit : undefined,
        addOnId: typeof source.addOnId === 'string' ? source.addOnId : undefined,
      },
      () => `chg-${Math.random().toString(36).slice(2, 10)}`,
    );
    return result.ok ? [result.charge] : [];
  });
}

export function sumChargesCents(charges: BookingCharge[]) {
  return charges.reduce((total, charge) => total + chargeAmountCents(charge.quantity, charge.unitPrice), 0);
}

/**
 * The agreed package price of a booking. Bookings saved before additional charges existed carry
 * only `price`, which then *is* the package price — so they read back exactly as before.
 */
export function getBookingBasePrice(booking: { price: number; basePrice?: number; charges?: unknown }) {
  if (typeof booking.basePrice === 'number' && Number.isFinite(booking.basePrice)) return booking.basePrice;
  const chargesCents = sumChargesCents(normalizeCharges(booking.charges));
  return fromCents(Math.max(0, toCents(booking.price) - chargesCents));
}

export function resolveDepositCents(terms: DepositTerms | null | undefined, totalCents: number) {
  if (!terms || !Number.isFinite(terms.value) || terms.value <= 0 || totalCents <= 0) return 0;
  if (terms.type === 'percent') {
    const percent = Math.min(terms.value, 100);
    return Math.round((totalCents * Math.round(percent * 100)) / 10000);
  }
  return Math.min(toCents(terms.value), totalCents);
}

export type DepositValidationError = 'deposit_invalid' | 'deposit_percent' | 'deposit_too_high' | 'deposit_due_date';

/** Checks a deposit against the booking's *final* total, charges included. */
export function validateDepositTerms(
  terms: DepositTerms | null | undefined,
  totalCents: number,
): DepositValidationError | null {
  if (!terms) return null;
  if (terms.type !== 'fixed' && terms.type !== 'percent') return 'deposit_invalid';
  if (!Number.isFinite(terms.value) || terms.value <= 0) return 'deposit_invalid';
  if (terms.type === 'percent' && terms.value > 100) return 'deposit_percent';
  if (terms.type === 'fixed' && toCents(terms.value) > totalCents) return 'deposit_too_high';
  if (terms.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(terms.dueDate)) return 'deposit_due_date';
  return null;
}

/**
 * The deposit terms stored on a booking. A booking from before deposit types existed only has a
 * resolved `depositAmount`, which reads as a fixed deposit of that amount.
 */
export function getBookingDepositTerms(booking: {
  depositAmount?: number;
  depositType?: DepositType;
  depositValue?: number;
  depositDueDate?: string;
}): DepositTerms | null {
  const dueDate = typeof booking.depositDueDate === 'string' && booking.depositDueDate ? booking.depositDueDate : undefined;
  if ((booking.depositType === 'percent' || booking.depositType === 'fixed') && typeof booking.depositValue === 'number' && booking.depositValue > 0) {
    return { type: booking.depositType, value: booking.depositValue, ...(dueDate ? { dueDate } : {}) };
  }
  if (typeof booking.depositAmount === 'number' && Number.isFinite(booking.depositAmount) && booking.depositAmount > 0) {
    return { type: 'fixed', value: booking.depositAmount, ...(dueDate ? { dueDate } : {}) };
  }
  return null;
}

export type BookingTotals = {
  baseCents: number;
  chargesCents: number;
  totalCents: number;
  depositDueCents: number;
  paidCents: number;
  balanceCents: number;
  /** What is still owed towards the deposit, after payments already received. */
  depositOutstandingCents: number;
};

/**
 * The one breakdown every screen shows: package subtotal, additional charges, total, deposit due,
 * payments received and the remaining balance. Payments never exceed the total in the balance.
 */
export function calculateBookingTotals(input: {
  basePrice: number;
  charges?: BookingCharge[];
  deposit?: DepositTerms | null;
  paidCents?: number;
}): BookingTotals {
  const baseCents = Math.max(0, toCents(input.basePrice));
  const chargesCents = sumChargesCents(input.charges ?? []);
  const totalCents = baseCents + chargesCents;
  const depositDueCents = resolveDepositCents(input.deposit ?? null, totalCents);
  const paidCents = Math.max(0, Math.round(input.paidCents ?? 0));
  return {
    baseCents,
    chargesCents,
    totalCents,
    depositDueCents,
    paidCents,
    balanceCents: Math.max(0, totalCents - paidCents),
    depositOutstandingCents: Math.max(0, depositDueCents - paidCents),
  };
}

/** The package line plus one line per charge, as frozen onto an invoice or a public snapshot. */
export function buildPricedLines(input: {
  packageName: string;
  packageDetails?: string;
  basePrice: number;
  charges?: BookingCharge[];
}): PricedLine[] {
  const base: PricedLine = {
    kind: 'package',
    description: input.packageName.trim() || 'Professional services',
    ...(input.packageDetails?.trim() ? { detail: input.packageDetails.trim() } : {}),
    quantity: 1,
    unitPrice: fromCents(toCents(input.basePrice)),
    amount: fromCents(toCents(input.basePrice)),
  };
  const charges = (input.charges ?? []).map<PricedLine>((charge) => ({
    kind: 'charge',
    description: charge.description,
    quantity: charge.quantity,
    ...(charge.unit ? { unit: charge.unit } : {}),
    unitPrice: charge.unitPrice,
    amount: fromCents(chargeAmountCents(charge.quantity, charge.unitPrice)),
  }));
  return [base, ...charges];
}

/** Lines as stored on an invoice, made safe to render. Null when the invoice has none. */
export function normalizePricedLines(value: unknown): PricedLine[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const lines = value.flatMap<PricedLine>((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const source = item as Record<string, unknown>;
    const quantity = typeof source.quantity === 'number' && source.quantity > 0 ? source.quantity : 1;
    const unitPrice = typeof source.unitPrice === 'number' && Number.isFinite(source.unitPrice) ? source.unitPrice : NaN;
    if (!Number.isFinite(unitPrice) || typeof source.description !== 'string') return [];
    return [{
      kind: source.kind === 'charge' ? 'charge' : 'package',
      description: source.description,
      ...(typeof source.detail === 'string' && source.detail ? { detail: source.detail } : {}),
      quantity,
      ...(typeof source.unit === 'string' && source.unit ? { unit: source.unit } : {}),
      unitPrice,
      amount: fromCents(chargeAmountCents(quantity, unitPrice)),
    }];
  });
  return lines.length ? lines : null;
}

/** "2 × RM 50.00" or "1.5 hour × RM 80.00", for a charge line's secondary text. */
export function describeQuantity(line: { quantity: number; unit?: string; unitPrice: number }, formatter: Intl.NumberFormat) {
  const quantity = Number.isInteger(line.quantity) ? String(line.quantity) : line.quantity.toFixed(2).replace(/0$/, '');
  return `${quantity}${line.unit ? ` ${line.unit}` : ''} × ${formatter.format(line.unitPrice)}`;
}

export type BookingMoneyInput = {
  price: number;
  basePrice?: number;
  charges?: unknown;
  depositAmount?: number;
  depositType?: DepositType;
  depositValue?: number;
  depositDueDate?: string;
};

export type BookingMoneyFields = {
  price: number;
  basePrice?: number;
  charges?: BookingCharge[];
  depositAmount?: number;
  depositType?: DepositType;
  depositValue?: number;
  depositDueDate?: string;
};

/**
 * The money fields a booking is saved with, validated once for every path that writes one — the
 * booking form, an edit, a duplicate, a converted quotation or a submitted booking form.
 *
 * A booking with no charges and no deposit type is written exactly as before (price only, with the
 * legacy clamp on a fixed deposit), so older app versions read it identically. A booking with
 * charges stores its package price as `basePrice` and its full total as `price`.
 */
export function resolveBookingMoney(input: BookingMoneyInput):
  | { ok: true; fields: BookingMoneyFields }
  | { ok: false; error: 'price' | 'charges' | DepositValidationError } {
  const charges = normalizeCharges(input.charges);
  if (Array.isArray(input.charges) && charges.length !== input.charges.length) return { ok: false, error: 'charges' };
  if (charges.length > MAX_CHARGE_ROWS) return { ok: false, error: 'charges' };

  const hasCharges = charges.length > 0;
  const base = hasCharges || typeof input.basePrice === 'number' ? input.basePrice ?? input.price : input.price;
  if (!Number.isFinite(base) || base <= 0 || base > MAX_MONEY_AMOUNT) return { ok: false, error: 'price' };

  const baseCents = toCents(base);
  const totalCents = baseCents + sumChargesCents(charges);
  const dueDate = input.depositDueDate?.trim() || undefined;
  const hasTypedDeposit = input.depositType === 'fixed' || input.depositType === 'percent';

  let deposit: Pick<BookingMoneyFields, 'depositAmount' | 'depositType' | 'depositValue' | 'depositDueDate'> = {};
  if (hasTypedDeposit) {
    const terms: DepositTerms = { type: input.depositType as DepositType, value: Number(input.depositValue), ...(dueDate ? { dueDate } : {}) };
    const error = validateDepositTerms(terms, totalCents);
    if (error) return { ok: false, error };
    deposit = {
      depositAmount: fromCents(resolveDepositCents(terms, totalCents)),
      depositType: terms.type,
      depositValue: terms.type === 'percent' ? Math.round(terms.value * 100) / 100 : fromCents(toCents(terms.value)),
      ...(dueDate ? { depositDueDate: dueDate } : {}),
    };
  } else if (typeof input.depositAmount === 'number' && Number.isFinite(input.depositAmount) && input.depositAmount > 0) {
    // The pre-existing behaviour: a plain deposit amount is clamped to the job rather than refused.
    deposit = {
      depositAmount: Math.min(fromCents(toCents(input.depositAmount)), fromCents(totalCents)),
      ...(dueDate ? { depositDueDate: dueDate } : {}),
    };
  }
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { ok: false, error: 'deposit_due_date' };

  return {
    ok: true,
    fields: {
      price: fromCents(totalCents),
      ...(hasCharges || typeof input.basePrice === 'number' ? { basePrice: fromCents(baseCents) } : {}),
      ...(hasCharges ? { charges } : {}),
      ...deposit,
    },
  };
}

/** Saved add-ons as stored on a service, made safe to offer. Anything unusable is dropped. */
export function normalizeSavedAddOns(value: unknown): SavedAddOn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const source = item as Record<string, unknown>;
    const name = typeof source.name === 'string' ? source.name.trim().slice(0, MAX_CHARGE_DESCRIPTION_LENGTH) : '';
    const unitPrice = parseMoneyInput(typeof source.unitPrice === 'number' ? source.unitPrice : String(source.unitPrice ?? ''));
    if (!name || unitPrice === null || unitPrice <= 0 || unitPrice > MAX_MONEY_AMOUNT) return [];
    const unit = typeof source.unit === 'string' ? source.unit.trim().slice(0, 24) : '';
    return [{
      id: typeof source.id === 'string' && source.id ? source.id : `addon-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name,
      unitPrice,
      ...(unit ? { unit } : {}),
    }];
  }).slice(0, MAX_CHARGE_ROWS);
}

/** One included deliverable per line, trimmed and de-duplicated. */
export function normalizeIncludedServices(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split('\n') : [];
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const text = typeof item === 'string' ? item.trim().slice(0, 160) : '';
    if (!text || seen.has(text.toLowerCase())) return [];
    seen.add(text.toLowerCase());
    return [text];
  }).slice(0, 30);
}
