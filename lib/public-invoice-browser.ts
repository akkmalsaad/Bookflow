/** Do not start telemetry on pages carrying an invoice or booking bearer token. */
export function isPublicInvoiceBrowser() {
  const pathname =
    typeof window !== 'undefined' && typeof window.location?.pathname === 'string'
      ? window.location.pathname
      : '';

  return /^\/(i|invoice-public|b|booking-public)\/?$/.test(pathname);
}
