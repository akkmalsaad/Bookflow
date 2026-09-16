/** Do not start telemetry on pages carrying an invoice bearer token. */
export function isPublicInvoiceBrowser() {
  return typeof window !== 'undefined' && /^\/(i|invoice-public)\/?$/.test(window.location.pathname);
}
