import type { DateBounds, ReportRange } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Resolves a range preset into inclusive yyyy-mm-dd bounds. Custom passes its own through.
 *
 * Unchanged from the original export screen: the same bounds go on to `getFinancialMetrics`, which
 * is what keeps a report's revenue identical to the same period on Finance and Business Insights.
 */
export function getRangeBounds(range: ReportRange, custom?: Partial<DateBounds>): DateBounds {
  const now = new Date();

  if (range === 'custom') {
    return {
      start: custom?.start || dateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
      end: custom?.end || dateKey(now),
    };
  }

  if (range === 'this-year') {
    return { start: dateKey(new Date(now.getFullYear(), 0, 1)), end: dateKey(new Date(now.getFullYear(), 11, 31)) };
  }

  const monthOffset = range === 'last-month' ? -1 : 0;
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
  return { start: dateKey(start), end: dateKey(end) };
}

export function isValidDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

export function isWithinBounds(date: string | undefined, bounds: DateBounds) {
  if (!date) return false;
  const key = date.slice(0, 10);
  return key >= bounds.start && key <= bounds.end;
}

/** `2026-09-04` → `04 Sep 2026`. Returns the input unchanged if it is not a date key. */
export function formatDisplayDate(value: string | undefined) {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day} ${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

export function formatRangeLabel(bounds: DateBounds) {
  return `${formatDisplayDate(bounds.start)} – ${formatDisplayDate(bounds.end)}`;
}

export function formatGeneratedAt(date: Date) {
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${formatDisplayDate(dateKey(date))} at ${time}`;
}

function isLastDayOfMonth(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month, 0).getDate() === day;
}

/**
 * Names the period the way a person would file it: `Sep-2026` for a whole month, `2026` for a whole
 * year, and the explicit span for anything else.
 */
export function describeRangeForFileName(bounds: DateBounds) {
  const [startYear, startMonth, startDay] = bounds.start.split('-');
  const [endYear, endMonth] = bounds.end.split('-');

  if (startDay === '01' && startYear === endYear && startMonth === endMonth && isLastDayOfMonth(bounds.end)) {
    return `${MONTHS[Number(startMonth) - 1]}-${startYear}`;
  }

  if (bounds.start === `${startYear}-01-01` && bounds.end === `${startYear}-12-31`) {
    return startYear;
  }

  return `${bounds.start}-to-${bounds.end}`;
}

/** Collapses anything a filesystem or share sheet would object to. */
export function safeFileSegment(value: string) {
  return value
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildReportFileName(title: string, bounds: DateBounds, extension: string) {
  return `BookFlow-${safeFileSegment(title)}-${describeRangeForFileName(bounds)}.${extension}`;
}
