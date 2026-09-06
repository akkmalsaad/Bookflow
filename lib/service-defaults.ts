import type { PackageOption } from '@/context/app-data-context';

/**
 * The default deposit a service suggests for a new booking.
 *
 * These are *prefill* values and nothing more. Once a booking exists it carries its own agreed
 * deposit, so editing the service later never rewrites a job that has already been created — the
 * same rule the invoice snapshot already follows for business details.
 */

export type ServiceDepositType = 'fixed' | 'percent';

export const SERVICE_DEPOSIT_TYPES: readonly ServiceDepositType[] = ['fixed', 'percent'];

/** A percentage above this is almost certainly a typo — a deposit is never more than the job. */
export const MAX_DEPOSIT_PERCENT = 100;

export function isServiceDepositType(value: unknown): value is ServiceDepositType {
  return value === 'fixed' || value === 'percent';
}

/**
 * Reads a service's configured deposit, or null when it has none.
 *
 * Services saved before deposits existed simply have neither field, which is why both are optional
 * and why every caller has to handle null — a service without a deposit is a normal service, not a
 * broken one.
 */
export function getServiceDepositDefault(
  service: Pick<PackageOption, 'defaultDepositType' | 'defaultDepositValue'> | null | undefined,
): { type: ServiceDepositType; value: number } | null {
  if (!service) return null;

  const { defaultDepositType: type, defaultDepositValue: value } = service;
  if (!isServiceDepositType(type)) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;

  return { type, value };
}

/**
 * The deposit amount to prefill for a booking, given the price actually on the form.
 *
 * A percentage deposit is resolved against the live price rather than the service's list price, so
 * discounting a job to RM1,200 offers a deposit for RM1,200 — not one still calculated from
 * RM1,500. Returns null when the service configures no deposit, which leaves the field empty.
 */
export function resolveServiceDepositAmount(
  service: Pick<PackageOption, 'defaultDepositType' | 'defaultDepositValue'> | null | undefined,
  price: number,
): number | null {
  const deposit = getServiceDepositDefault(service);
  if (!deposit) return null;

  if (deposit.type === 'fixed') {
    // Never suggest a deposit larger than the job itself.
    return Number.isFinite(price) && price > 0 ? Math.min(deposit.value, price) : deposit.value;
  }

  if (!Number.isFinite(price) || price <= 0) return null;

  // Rounded to the cent so the field never opens holding a fraction nobody can pay.
  return Math.round(price * (deposit.value / 100) * 100) / 100;
}

/** One-line summary for the services list, e.g. "Deposit: 30%" or "Deposit: RM100". */
export function formatServiceDeposit(
  service: Pick<PackageOption, 'defaultDepositType' | 'defaultDepositValue'>,
  currencyFormatter: Intl.NumberFormat,
): string | null {
  const deposit = getServiceDepositDefault(service);
  if (!deposit) return null;

  return deposit.type === 'percent'
    ? `Deposit: ${deposit.value}%`
    : `Deposit: ${currencyFormatter.format(deposit.value)}`;
}

/**
 * Normalises the pair before it is written to the workspace, so a half-filled form can never store
 * a type without a value (or the reverse) and leave the prefill in an unreadable state.
 */
export function normalizeServiceDeposit(
  type: unknown,
  value: unknown,
): { defaultDepositType?: ServiceDepositType; defaultDepositValue?: number } {
  if (!isServiceDepositType(type)) return {};

  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return {};
  if (type === 'percent' && numeric > MAX_DEPOSIT_PERCENT) return {};

  return { defaultDepositType: type, defaultDepositValue: Math.round(numeric * 100) / 100 };
}
