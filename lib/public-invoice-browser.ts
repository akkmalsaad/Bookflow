/** Do not start telemetry on pages carrying an invoice bearer token. */
export function isPublicInvoiceBrowser() {
  const pathname =
    typeof window !== 'undefined' && typeof window.location?.pathname === 'string'
      ? window.location.pathname
      : '';

  return /^\/(i|invoice-public)\/?$/.test(pathname);
}
