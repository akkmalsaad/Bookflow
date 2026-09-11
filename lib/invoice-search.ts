import type { Booking, Invoice } from '@/context/app-data-context';

const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// Malay month names, so a search typed in the app's second language still finds its dates.
const MONTHS_MS = ['januari', 'februari', 'mac', 'april', 'mei', 'jun', 'julai', 'ogos', 'september', 'oktober', 'november', 'disember'];

/** Lower-cased, accent-free, single-spaced. Commas go too, so "Sep 9, 2026" reads like "Sep 9 2026". */
function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Every way someone is likely to type one stored "YYYY-MM-DD" date: the card's own "09 Sep 2026",
 * "9 September", "Sep 9", "09/09/2026", the raw ISO value, and the Malay month names.
 */
function getDatePhrases(value: string | undefined): string[] {
  if (!value) return [];
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const monthIndex = match ? Number(match[2]) - 1 : -1;
  if (!match || monthIndex < 0 || monthIndex > 11) return [value];

  const [, year, month, paddedDay] = match;
  const day = String(Number(paddedDay));
  const phrases = [`${year}-${month}-${paddedDay}`, `${paddedDay}/${month}/${year}`];
  for (const monthName of [MONTHS_SHORT[monthIndex], MONTHS_EN[monthIndex], MONTHS_MS[monthIndex]]) {
    phrases.push(`${paddedDay} ${monthName} ${year}`, `${day} ${monthName} ${year}`, `${monthName} ${day} ${year}`);
  }
  return phrases;
}

export type InvoiceSearchIndex = {
  /** Customer, invoice number and event wording. */
  text: string[];
  /** One entry per date, holding every written form of that date. */
  dates: string[][];
};

/**
 * What an invoice can be found by: the customer's name, its dates (due, sent, event), and the event
 * itself (service, booking title, location), plus the invoice number.
 */
export function buildInvoiceSearchIndex(invoice: Invoice, customerName: string, booking?: Booking): InvoiceSearchIndex {
  const invoiceNumber = invoice.invoiceNumber?.trim() ?? '';
  // "INV-2026-0039" is also found by "39".
  const sequence = /(\d+)$/.exec(invoiceNumber)?.[1]?.replace(/^0+(?=\d)/, '');

  const text = [
    customerName,
    invoiceNumber,
    sequence,
    invoice.serviceName,
    booking?.title,
    booking?.packageName,
    invoice.eventLocation ?? booking?.location,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalize);

  const dates = [invoice.dueDate, invoice.sentAt, invoice.eventDate ?? booking?.date]
    .map((value) => getDatePhrases(value).map(normalize))
    .filter((phrases) => phrases.length > 0);

  return { text, dates };
}

/** True when `query` starts at the beginning of a word in `phrase`, so "9 sep" never finds "19 Sep". */
function matchesAtWordStart(phrase: string, query: string) {
  let index = phrase.indexOf(query);
  while (index !== -1) {
    if (index === 0 || !/[a-z0-9]/.test(phrase[index - 1])) return true;
    index = phrase.indexOf(query, index + 1);
  }
  return false;
}

/**
 * The query may mix fields — "aina wedding", "rahman 9 sep" — so it is split into runs of words that
 * each match something on the invoice. At most one run may be a date: otherwise "9 sep" would be
 * satisfied by a "9" from one date and a "Sep" from another.
 */
export function matchesInvoiceSearch(index: InvoiceSearchIndex, searchTerm: string) {
  const query = normalize(searchTerm);
  if (!query) return true;

  const tokens = query.split(' ');
  // fewestDates[i]: the fewest date runs needed to account for the first i words.
  const fewestDates: number[] = [0, ...tokens.map(() => Infinity)];

  for (let start = 0; start < tokens.length; start += 1) {
    if (fewestDates[start] > 1) continue;

    for (let end = start + 1; end <= tokens.length; end += 1) {
      const run = tokens.slice(start, end).join(' ');
      if (index.text.some((phrase) => matchesAtWordStart(phrase, run))) {
        fewestDates[end] = Math.min(fewestDates[end], fewestDates[start]);
      } else if (index.dates.some((phrases) => phrases.some((phrase) => matchesAtWordStart(phrase, run)))) {
        fewestDates[end] = Math.min(fewestDates[end], fewestDates[start] + 1);
      }
    }
  }

  return fewestDates[tokens.length] <= 1;
}
