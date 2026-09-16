const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Lossless URL-safe encoding: retain every bit of the existing secret token.
export function encodeInvoiceToken(token: string): string {
  if (!uuidPattern.test(token)) throw new Error('Invalid invoice token');
  const hex = token.replace(/-/g, '');
  let bits = 0, value = 0, result = '';
  for (let i = 0; i < hex.length; i += 2) {
    value = (value << 8) | parseInt(hex.slice(i, i + 2), 16);
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      result += alphabet[(value >>> bits) & 63];
    }
  }
  if (bits) result += alphabet[(value << (6 - bits)) & 63];
  return result;
}

export function decodeInvoiceToken(token: string | undefined): string | null {
  if (!token) return null;
  if (uuidPattern.test(token)) return token.toLowerCase();
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return null;
  let bits = 0, value = 0, hex = '';
  for (const character of token) {
    value = (value << 6) | alphabet.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      hex += ((value >>> bits) & 255).toString(16).padStart(2, '0');
    }
  }
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return uuidPattern.test(uuid) && encodeInvoiceToken(uuid) === token ? uuid : null;
}

export function createPublicInvoiceUrl(token: string): string {
  const base = process.env.EXPO_PUBLIC_INVOICE_WEB_URL?.trim() || 'https://bookflow.expo.app';
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Invoice website must be an HTTPS URL without credentials, query or fragment.');
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/i`;
  url.searchParams.set('t', encodeInvoiceToken(token));
  return url.toString();
}
