const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const compile = (file) => ts.transpileModule(fs.readFileSync(path.join(root, 'supabase/functions/booking-public', file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function loadPayload() {
  const exports = {};
  vm.runInNewContext(compile('payload.ts'), { exports, Intl, Date, Math, Number, Array, Object, String });
  return exports;
}

/** The shared RevenueCat check, compiled as it is, with `fetch` pointed at a test double. */
function loadEntitlement(fetchImpl) {
  const exports = {};
  const source = fs.readFileSync(path.join(root, 'supabase/functions/_shared/pro-entitlement.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, fetch: fetchImpl, AbortController, setTimeout, clearTimeout, Date, Number, encodeURIComponent,
  });
  return exports;
}

/** RevenueCat v1 `GET /subscribers/:id` answering with the given entitlements. */
const revenueCat = (entitlements, status = 200) => async () => new Response(JSON.stringify({ subscriber: { entitlements } }), { status });
const PRO_ACTIVE = { bookflow_pro: { expires_date: '2999-01-01T00:00:00Z' } };

function setup(result, { fetchImpl = revenueCat(PRO_ACTIVE), env = {}, owner = { user_id: 'owner-a' } } = {}) {
  const payload = loadPayload();
  let handler;
  const calls = [];
  const lookups = [];
  const revenueCatCalls = [];
  const entitlement = loadEntitlement(async (url, init) => { revenueCatCalls.push({ url, init }); return fetchImpl(url, init); });
  const values = { REVENUECAT_SECRET_API_KEY: 'sk_test', REVENUECAT_PRO_ENTITLEMENT_ID: '', ...env };
  const admin = {
    rpc: async (rpcName, args) => { calls.push({ name: rpcName, args }); return result; },
    from: (table) => ({ select: () => ({ eq: (column, value) => ({ maybeSingle: async () => { lookups.push({ table, [column]: value }); return { data: owner, error: null }; } }) }) }),
  };
  vm.runInNewContext(compile('index.ts'), {
    exports: {}, Request, Response, URL, Date, JSON, Number, Object,
    Deno: { env: { get: (name) => (name in values ? values[name] : 'configured') }, serve: (fn) => { handler = fn; } },
    require: (name) => name === './payload.ts' ? payload : name === '../_shared/pro-entitlement.ts' ? entitlement : { createClient: () => admin },
  });
  return { request: (query = '', options = {}) => handler(new Request(`https://example.com/booking-public${query}`, options)), calls, lookups, revenueCatCalls };
}

const token = '6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b';
const query = `?format=json&token=${token}`;
const ws = (value) => String(value).replace(/\s/g, ' ');
const post = (body) => ({ method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

const baseState = (over = {}) => ({
  kind: 'booking_form', status: 'sent', version: 1, change_request_count: 0, invoice_token: null,
  offer: {
    currency: 'MYR', locale: 'en', timeZone: 'Asia/Kuala_Lumpur', business: { name: 'Studio', logoUrl: 'javascript:alert(1)' },
    title: 'Wedding', packageName: 'Wedding', packageDetails: 'Two photographers', includedServices: ['200 photos'],
    lines: [{ kind: 'package', description: 'Wedding', quantity: 1, unitPriceCents: 320000, amountCents: 320000 }, { kind: 'charge', description: 'Parking', quantity: 2, unitPriceCents: 2500, amountCents: 5000 }],
    deposit: { type: 'percent', value: 30, amountCents: 97500, dueDate: '2026-11-01' },
    date: '2026-11-20', startTime: '10:00', endTime: '14:00', terms: 'Terms', termsVersion: 't1-abc', requireEmail: true,
    customerName: 'Should not show on forms', acceptedConflictIds: ['bk-secret-id'],
  },
  ...over,
});

test('malformed requests are rejected before any RPC; browsers are redirected', async () => {
  const s = setup({});
  assert.equal((await s.request('?format=json&token=bad')).status, 400);
  assert.equal((await s.request(query, { method: 'PUT' })).status, 405);
  assert.equal((await s.request('', { method: 'OPTIONS' })).status, 204);
  assert.equal((await s.request(query, post('not json'))).status, 400);
  assert.equal((await s.request(query, post('[]'))).status, 400);
  assert.equal((await s.request(query, post({ action: 'pay' }))).status, 400);
  assert.equal((await s.request(query, post({ action: 'submit', payload: { notes: 'x'.repeat(20000) } }))).status, 413);
  const redirect = await s.request(`?token=${token}`);
  assert.equal(redirect.status, 302);
  assert.ok(redirect.headers.get('location').startsWith('https://bookflow.expo.app/booking-public?'));
  assert.equal(s.calls.length, 0);
});

test('business errors map to safe status codes and never echo database messages', async () => {
  const cases = [['slot_unavailable', 409], ['plan_limit', 409], ['invalid_phone', 422], ['rate_limited', 429], ['closed', 409], ['offer_changed', 409], ['mystery', 503]];
  for (const [error, status] of cases) {
    const response = await setup({ data: { ok: false, error }, error: null }).request(query, post({ action: 'submit', payload: {}, idempotencyKey: 'x'.repeat(20) }));
    assert.equal(response.status, status, error);
    const body = await response.json();
    assert.equal(body.error, status === 503 ? 'unavailable' : error);
  }
  assert.equal((await setup({ error: { code: 'P0002', message: 'Booking link not found' } }).request(query)).status, 503);
  assert.equal((await setup({ error: { code: 'P0002' } }).request(query, post({ action: 'submit' }))).status, 404);
  const failed = await setup({ error: { message: 'SQL secret stack' } }).request(query);
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes('SQL secret'));
  assert.equal((await setup({ data: null, error: null }).request(query)).status, 404);
});

test('GET and POST both return the filtered projection with no-store headers', async () => {
  const state = baseState({ booking: null });
  for (const [options, rpc] of [[{}, 'read_booking_offer_state'], [post({ action: 'submit', payload: { name: 'A' }, idempotencyKey: 'k'.repeat(20) }), 'respond_to_booking_offer']]) {
    const s = setup({ data: rpc === 'read_booking_offer_state' ? state : { ok: true, state }, error: null });
    const response = await s.request(query, options);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(s.calls[0].name, rpc);
    const text = await response.text();
    assert.ok(!text.includes('bk-secret-id'));
    assert.ok(!text.includes('Should not show on forms'));
    assert.ok(!text.includes('javascript:'));
  }
});

test('the projection never exposes internal notes, ids, other records or unknown fields', () => {
  const { publicBookingOfferResponse } = loadPayload();
  const hidden = 'PRIVATE-CANARY';
  const result = publicBookingOfferResponse(baseState({
    status: 'converted', invoice_token: '2339ffe7-5385-400d-8c9f-2dbf07e0cdc0',
    booking: { id: hidden, customerId: hidden, status: 'Confirmed', notes: hidden, price: 3250, basePrice: 3200, depositAmount: 975,
      charges: [{ description: 'Parking', quantity: 2, unitPrice: 25 }], packageName: 'Wedding', date: '2026-11-20', startTime: '10:00', endTime: '14:00', location: 'KL',
      fulfilment: { status: 'in_progress', internalNotes: hidden, promisedDate: '2026-12-20', deliveryLink: 'https://gallery.example/x' } },
    invoice: { id: 'inv-1', invoiceNumber: 'INV-0001', amount: 3250, status: 'Partially Paid', notes: hidden, customerSnapshot: { email: hidden } },
    payments: [{ invoiceId: 'inv-1', amount: 975, kind: 'deposit', date: '2026-10-20', method: hidden, notes: hidden }, { invoiceId: 'inv-other', amount: 50 }],
    offer: { ...baseState().offer, secret: hidden, business: { name: 'Studio', email: 'hi@studio.my', apiKey: hidden } },
  }));
  assert.ok(!JSON.stringify(result).includes(hidden));
  assert.equal(result.booking.status, 'confirmed');
  assert.equal(result.fulfilment.status, 'in_progress');
  assert.equal(result.fulfilment.deliveryLink, 'https://gallery.example/x');
  assert.equal(result.payments.length, 1);
  assert.equal(ws(result.totals.total), 'RM 3,250.00');
  assert.equal(ws(result.totals.paid), 'RM 975.00');
  assert.equal(ws(result.totals.balance), 'RM 2,275.00');
  assert.equal(result.invoice.number, 'INV-0001');
  assert.equal(result.canRespond, false);
});

test('before conversion the money comes from the owner snapshot, never from the customer', () => {
  const { publicBookingOfferResponse } = loadPayload();
  const result = publicBookingOfferResponse(baseState());
  assert.equal(ws(result.totals.subtotal), 'RM 3,200.00');
  assert.equal(ws(result.totals.charges), 'RM 50.00');
  assert.equal(ws(result.totals.total), 'RM 3,250.00');
  assert.equal(ws(result.totals.deposit), 'RM 975.00');
  assert.equal(result.lines.length, 2);
  assert.equal(result.canRespond, true);
  assert.equal(result.invoice, null);
  assert.equal(result.business.logoUrl, '');
  // A voided invoice is never offered to the customer.
  const voided = publicBookingOfferResponse(baseState({ status: 'converted', invoice_token: '2339ffe7-5385-400d-8c9f-2dbf07e0cdc0', booking: { status: 'Inquiry', price: 1 }, invoice: { id: 'i', status: 'Void', amount: 1 } }));
  assert.equal(voided.invoice, null);
});

test('only the allowed customer fields reach the database; anything else a client sends is dropped', async () => {
  const hostile = {
    name: 'Siti', email: 'siti@example.my', phone: '+60 12-345 6789', customerLocation: 'Klang', location: 'Shah Alam',
    acceptTerms: true, termsVersion: 't1-abc', version: 1,
    price: 1, totalCents: 1, date: '2030-01-01', startTime: '00:00', packageName: 'Free', notes: 'x', deposit: 0, status: 'converted', message: 'm',
  };
  const keys = async (action) => {
    const s = setup({ data: { ok: true, state: baseState() }, error: null });
    await s.request(query, post({ action, idempotencyKey: 'k'.repeat(20), payload: hostile }));
    return Object.keys(s.calls[0].args.p_payload).sort();
  };
  assert.deepEqual(await keys('submit'), ['acceptTerms', 'customerLocation', 'email', 'location', 'name', 'phone', 'termsVersion', 'version']);
  assert.deepEqual(await keys('accept'), ['acceptTerms', 'name', 'termsVersion', 'version']);
  assert.deepEqual(await keys('decline'), ['version']);
  assert.deepEqual(await keys('request_change'), ['message', 'version']);
});

test('an invoice is shown to the customer only once the owner has shared it', () => {
  const { publicBookingOfferResponse } = loadPayload();
  const unshared = publicBookingOfferResponse(baseState({ status: 'converted', invoice_token: null, booking: { status: 'Inquiry', price: 1 }, invoice: { id: 'inv-1', invoiceNumber: 'INV-0009', status: 'Draft', amount: 1 } }));
  assert.equal(unshared.invoice, null);
  assert.ok(!JSON.stringify(unshared).includes('INV-0009'));
});
