const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

/**
 * App-side conversion of a submitted booking form into a customer, booking and invoice. It runs
 * inside the app's data provider, so — like the account-deletion checks — this reads the source and
 * pins the order of the steps that make it safe to retry.
 */
const source = fs.readFileSync(path.join(__dirname, '..', 'context', 'app-data-context.tsx'), 'utf8');
const start = source.indexOf('const refreshOffers = useCallback(');
const refresh = source.slice(start, source.indexOf('const createCustomerPageLink = useCallback(', start));

test('only a link the server still lists as submitted is turned into records', () => {
  assert.ok(start > 0 && refresh.length > 0);
  const branch = refresh.indexOf("if (kind === 'booking_form' && remoteStatus === 'submitted' && response) {");
  assert.ok(branch > 0, 'conversion is not limited to submitted links');
  const calls = [...refresh.matchAll(/createRecordsFromOffer\(/g)].map((match) => match.index);
  assert.equal(calls.length, 1);
  assert.ok(calls[0] > branch);
  // A converted link is never rebuilt, whatever is missing from the workspace.
  assert.equal(/remoteStatus === 'converted'\) && response\) \{\s*if \(!hasBooking\)/.test(refresh), false);
});

test('a link is marked converted only after the save holding its records succeeds', () => {
  const saved = refresh.indexOf('await confirmWorkspaceSave();');
  const converted = refresh.indexOf("status: 'converted', booking_id: item.bookingId");
  assert.ok(saved > 0, 'no confirmed save before acknowledging');
  assert.ok(converted > saved, 'the link is marked converted before the save is confirmed');
  // Nothing else in the refresh writes the converted status to the server.
  assert.equal(refresh.split("status: 'converted', booking_id").length - 1, 1);
});

test('retrying a conversion can never create a second set of records', () => {
  const create = source.slice(source.indexOf('const createRecordsFromOffer = useCallback('), source.indexOf('const publishOfferRow = useCallback('));
  assert.match(create, /const ids = offerRecordIds\(input\.offerId\);\s*if \(bookingsRef\.current\.some\(\(item\) => item\.id === ids\.bookingId\)\) return null;/);
  assert.match(create, /const existingInvoice = invoicesRef\.current\.find\(\(item\) => item\.id === ids\.invoiceId\);/);
  // A conversion made here whose save or acknowledgement has not landed is recognised, not rebuilt.
  assert.match(refresh, /const removedHere = local\?\.status === 'converted'/);
});
