const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
function load(base) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/public-invoice-url.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code, {exports, URL, process:{env:{EXPO_PUBLIC_INVOICE_WEB_URL:base}}});
  return exports;
}
test('short tokens preserve the full UUID and match standard base64url', () => {
  const {encodeInvoiceToken, decodeInvoiceToken} = load();
  for(let i=0;i<1000;i++) {
    const uuid = randomUUID();
    const encoded = encodeInvoiceToken(uuid);
    assert.equal(encoded, Buffer.from(uuid.replaceAll('-',''),'hex').toString('base64url'));
    assert.equal(encoded.length,22);
    assert.equal(decodeInvoiceToken(encoded), uuid);
    assert.equal(decodeInvoiceToken(uuid),uuid);
  }
});
test('rejects malformed, non-canonical and truncated tokens', () => {
  const {decodeInvoiceToken,encodeInvoiceToken} = load();
  for(const token of [undefined,'','abc','!'.repeat(22),'A'.repeat(22),'a'.repeat(36)]) assert.equal(decodeInvoiceToken(token),null);
  const valid=encodeInvoiceToken('2339ffe7-5385-400d-8c9f-2dbf07e0cdc0');
  assert.equal(decodeInvoiceToken(valid.slice(0,-1)+'B'),null);
});
test('uses the production Expo host by default and supports custom hosts', () => {
  const token=randomUUID();
  const defaultUrl = new URL(load().createPublicInvoiceUrl(token));
  assert.equal(defaultUrl.origin, 'https://bookflow.expo.app');
  assert.equal(defaultUrl.pathname, '/i');
  assert.equal(load().decodeInvoiceToken(defaultUrl.searchParams.get('t')), token);
  const api=load('https://invoice.example.com/');
  const url=new URL(api.createPublicInvoiceUrl(token));
  assert.equal(url.origin,'https://invoice.example.com');
  assert.equal(url.pathname,'/i');
  assert.equal(api.decodeInvoiceToken(url.searchParams.get('t')),token);
  for(const base of ['http://example.com','https://user:pass@example.com','https://example.com?x=y','https://example.com#x']) assert.throws(()=>load(base).createPublicInvoiceUrl(token));
});
