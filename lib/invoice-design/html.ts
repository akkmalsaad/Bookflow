import { getInvoiceTemplate } from './templates';
import type { InvoiceRenderData, InvoiceTemplateId } from './types';

/**
 * The one place an invoice becomes markup.
 *
 * The PDF (through `expo-print`) and the customer's public web page both call this function with
 * the same `InvoiceRenderData`, so the document a customer opens in their browser and the file the
 * business downloads are produced from identical HTML and CSS rather than from two implementations
 * that have to be kept in step by hand.
 */

function escapeHtml(value: unknown) {
  // Also the guard against `undefined`, `null` and `NaN` reaching the page: anything that is not a
  // usable string becomes empty, and the callers below drop empty rows entirely.
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && !Number.isFinite(value)) return '';

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/** Preserves the line breaks a user typed into terms or payment instructions. */
function escapeMultiline(value: string) {
  return escapeHtml(value).replaceAll('\n', '<br />');
}

function has(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Renders a label/value line, or nothing at all when the value is empty. */
function line(value: string | null | undefined, className = 'muted') {
  return has(value) ? `<div class="${className}">${escapeHtml(value.trim())}</div>` : '';
}

function row(label: string, value: string | null | undefined) {
  return has(value)
    ? `<div class="row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value.trim())}</span></div>`
    : '';
}

// ---------------------------------------------------------------------------------------------
// Shared blocks. Every template composes these; only the arrangement and styling differ.
// ---------------------------------------------------------------------------------------------

function logoTag(data: InvoiceRenderData, className: string) {
  // An unreachable logo removes itself rather than leaving a broken-image box on the invoice.
  return data.business.logoUrl
    ? `<img class="${className}" src="${escapeHtml(data.business.logoUrl)}" alt="" onerror="this.remove()" />`
    : '';
}

function businessBlock(data: InvoiceRenderData, label = 'From') {
  const { business, design } = data;

  return `<div class="party">
    ${label ? `<div class="label">${escapeHtml(label)}</div>` : ''}
    <div class="party-name">${escapeHtml(business.name) || 'Your business'}</div>
    ${has(business.registrationNumber) ? line(`SSM: ${business.registrationNumber}`) : ''}
    ${line(business.phone)}
    ${line(business.email)}
    ${line(business.website)}
    ${design.visibility.businessAddress ? line(business.address) : ''}
  </div>`;
}

function clientBlock(data: InvoiceRenderData) {
  const { client, design } = data;

  return `<div class="party">
    <div class="label">Bill to</div>
    <div class="party-name">${escapeHtml(client.name) || 'Client'}</div>
    ${line(client.email)}
    ${line(client.phone)}
    ${design.visibility.clientAddress ? line(client.address) : ''}
  </div>`;
}

function statusBadge(data: InvoiceRenderData) {
  if (!data.design.visibility.paymentStatus) return '';
  return `<span class="badge">${escapeHtml(data.invoice.paymentStatus)}</span>`;
}

function metaBlock(data: InvoiceRenderData) {
  const { invoice, design } = data;

  return `<div class="meta">
    ${row('Invoice number', invoice.number)}
    ${row('Issued', invoice.issuedOn)}
    ${design.visibility.dueDate ? row('Due', invoice.dueOn) : ''}
    ${row('Event date', invoice.eventDate)}
    ${row('Event time', invoice.eventTime)}
    ${row('Location', invoice.eventLocation)}
  </div>`;
}

function itemsTable(data: InvoiceRenderData) {
  const rows = data.items
    .map(
      (item) => `<tr>
        <td>
          <div class="item-name">${escapeHtml(item.description) || 'Professional services'}</div>
          ${has(item.detail) ? `<div class="item-detail">${escapeHtml(item.detail.trim())}</div>` : ''}
        </td>
        <td class="amount">${escapeHtml(item.amountLabel)}</td>
      </tr>`,
    )
    .join('');

  return `<table class="items">
    <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function totalsBlock(data: InvoiceRenderData) {
  const { totals } = data;

  return `<div class="totals">
    <div class="total-row"><span>Invoice total</span><strong>${escapeHtml(totals.total)}</strong></div>
    ${totals.hasDeposit ? `<div class="total-row"><span>Deposit paid</span><strong>${escapeHtml(totals.depositPaid)}</strong></div>` : ''}
    <div class="total-row"><span>Amount paid</span><strong>${escapeHtml(totals.amountPaid)}</strong></div>
    <div class="total-due"><span>Balance due</span><strong>${escapeHtml(totals.balance)}</strong></div>
  </div>`;
}

function paymentBlock(data: InvoiceRenderData) {
  if (!data.design.visibility.paymentInformation) return '';

  const { payment } = data;
  const rows = [
    row('Bank', payment.bankName),
    row('Account name', payment.accountHolder),
    row('Account number', payment.accountNumber),
    row('DuitNow', payment.duitNowId),
  ].join('');

  // A payment panel with nothing in it is not printed at all.
  if (!rows) return '';

  return `<section class="panel">
    <div class="label">Payment information</div>
    <div class="meta">${rows}</div>
  </section>`;
}

function instructionsBlock(data: InvoiceRenderData) {
  if (!data.design.visibility.paymentInstructions || !has(data.paymentInstructions)) return '';

  return `<section class="panel">
    <div class="label">Payment instructions</div>
    <div class="copy">${escapeMultiline(data.paymentInstructions.trim())}</div>
  </section>`;
}

function termsBlock(data: InvoiceRenderData) {
  if (!data.design.visibility.terms || !has(data.terms)) return '';

  return `<section class="panel">
    <div class="label">Terms &amp; conditions</div>
    <div class="copy">${escapeMultiline(data.terms.trim())}</div>
  </section>`;
}

function thankYouBlock(data: InvoiceRenderData) {
  if (!data.design.visibility.thankYou || !has(data.thankYouMessage)) return '';
  return `<div class="thank-you">${escapeHtml(data.thankYouMessage.trim())}</div>`;
}

function brandingBlock(data: InvoiceRenderData) {
  if (!data.design.visibility.bookflowBranding) return '';
  return '<div class="branding">Created with BookFlow</div>';
}

function footerBlock(data: InvoiceRenderData) {
  const thankYou = thankYouBlock(data);
  const branding = brandingBlock(data);
  if (!thankYou && !branding) return '';
  return `<footer class="footer">${thankYou}${branding}</footer>`;
}

// ---------------------------------------------------------------------------------------------
// Per-template headers
// ---------------------------------------------------------------------------------------------

function header(data: InvoiceRenderData, templateId: InvoiceTemplateId) {
  const number = escapeHtml(data.invoice.number);

  if (templateId === 'bold') {
    return `<header class="banner">
      <div class="banner-brand">
        ${logoTag(data, 'logo logo-invert')}
        <div class="banner-name">${escapeHtml(data.business.name) || 'Your business'}</div>
        ${has(data.business.email) ? `<div class="banner-line">${escapeHtml(data.business.email)}</div>` : ''}
        ${has(data.business.phone) ? `<div class="banner-line">${escapeHtml(data.business.phone)}</div>` : ''}
        ${data.design.visibility.businessAddress && has(data.business.address) ? `<div class="banner-line">${escapeHtml(data.business.address)}</div>` : ''}
      </div>
      <div class="banner-meta">
        <div class="banner-title">Invoice</div>
        <div class="banner-number">${number}</div>
        ${statusBadge(data)}
      </div>
    </header>`;
  }

  if (templateId === 'elegant') {
    return `<header class="masthead">
      ${logoTag(data, 'logo logo-centred')}
      <div class="masthead-name">${escapeHtml(data.business.name) || 'Your business'}</div>
      <div class="masthead-rule"></div>
      <div class="masthead-title">Invoice</div>
      <div class="masthead-number">${number}${data.design.visibility.paymentStatus ? ` · ${escapeHtml(data.invoice.paymentStatus)}` : ''}</div>
    </header>`;
  }

  if (templateId === 'minimal') {
    return `<header class="head head-minimal">
      <div>
        ${logoTag(data, 'logo logo-small')}
        <div class="head-name">${escapeHtml(data.business.name) || 'Your business'}</div>
      </div>
      <div class="head-meta">
        <div class="head-title">Invoice</div>
        <div class="head-number">${number}</div>
        ${statusBadge(data)}
      </div>
    </header>`;
  }

  // Standard, Modern and Compact share a split masthead; their CSS differs, not their structure.
  return `<header class="head">
    <div>
      ${logoTag(data, 'logo')}
      ${data.business.logoUrl ? '' : `<div class="head-brand">${escapeHtml(data.business.name) || 'Your business'}</div>`}
      <div class="head-title">Invoice</div>
    </div>
    <div class="head-meta">
      <div class="head-number">${number}</div>
      ${statusBadge(data)}
    </div>
  </header>`;
}

// ---------------------------------------------------------------------------------------------
// Styling
// ---------------------------------------------------------------------------------------------

function baseCss(data: InvoiceRenderData) {
  const { tokens } = data;

  return `
    *, *::before, *::after { box-sizing: border-box; }
    :root { color-scheme: light; }
    body {
      margin: 0;
      background: ${tokens.surface};
      color: ${tokens.text};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.55;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      background: ${tokens.background};
      margin: 0 auto;
      max-width: 780px;
      padding: 40px 44px 34px;
    }
    .logo { display: block; max-width: 150px; max-height: 58px; object-fit: contain; object-position: left center; margin-bottom: 12px; }
    .logo-small { max-width: 104px; max-height: 40px; }
    .logo-centred { margin: 0 auto 12px; object-position: center; }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
    .head-brand { font-size: 15px; font-weight: 800; letter-spacing: -0.2px; margin-bottom: 6px; }
    .head-title { font-size: 30px; font-weight: 800; letter-spacing: -0.9px; color: ${tokens.accent}; }
    .head-meta { text-align: right; }
    .head-number { font-size: 13px; font-weight: 800; letter-spacing: 0.2px; }
    .badge {
      display: inline-block; margin-top: 8px; padding: 4px 11px; border-radius: 999px;
      background: ${tokens.accentSoft}; color: ${tokens.accent};
      font-size: 10px; font-weight: 800; letter-spacing: 0.7px; text-transform: uppercase;
    }
    .parties { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 30px; }
    .party { flex: 1 1 220px; min-width: 200px; }
    .label { font-size: 9.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${tokens.muted}; margin-bottom: 6px; }
    .party-name { font-size: 14px; font-weight: 800; margin-bottom: 3px; overflow-wrap: anywhere; }
    .muted { color: ${tokens.muted}; overflow-wrap: anywhere; }
    .meta { margin-top: 2px; }
    .row { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; border-bottom: 1px solid ${tokens.border}; }
    .row:last-child { border-bottom: 0; }
    .row span:first-child { color: ${tokens.muted}; }
    .row span:last-child { font-weight: 700; text-align: right; overflow-wrap: anywhere; }
    .section { margin-top: 26px; }
    .items { width: 100%; border-collapse: collapse; margin-top: 26px; }
    .items th {
      background: ${tokens.accentSoft}; color: ${tokens.accent};
      font-size: 9.5px; font-weight: 800; letter-spacing: 0.9px; text-transform: uppercase;
      text-align: left; padding: 10px 12px;
    }
    .items td { padding: 12px; border-bottom: 1px solid ${tokens.border}; vertical-align: top; }
    .items tr:last-child td { border-bottom: 0; }
    .amount { text-align: right; white-space: nowrap; }
    .item-name { font-weight: 700; overflow-wrap: anywhere; }
    .item-detail { color: ${tokens.muted}; margin-top: 3px; overflow-wrap: anywhere; }
    .totals { margin-top: 20px; margin-left: auto; max-width: 320px; }
    .total-row { display: flex; justify-content: space-between; gap: 18px; padding: 6px 0; color: ${tokens.muted}; }
    .total-row strong { color: ${tokens.text}; overflow-wrap: anywhere; }
    .total-due {
      display: flex; justify-content: space-between; gap: 18px; align-items: baseline;
      margin-top: 10px; padding: 14px 16px; border-radius: 12px;
      background: ${tokens.accent}; color: ${tokens.accentText};
      font-size: 14px; font-weight: 800;
    }
    .total-due strong { color: ${tokens.accentText}; font-size: 17px; overflow-wrap: anywhere; }
    .panels { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 28px; }
    .panel { flex: 1 1 260px; min-width: 240px; padding: 16px 18px; border-radius: 12px; background: ${tokens.surface}; }
    .copy { color: ${tokens.muted}; white-space: pre-wrap; overflow-wrap: anywhere; }
    .footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid ${tokens.border}; text-align: center; }
    .thank-you { font-size: 12.5px; font-weight: 700; color: ${tokens.text}; }
    .branding { margin-top: 6px; font-size: 9.5px; color: ${tokens.muted}; letter-spacing: 0.3px; }
    @media print { body { background: ${tokens.background}; } .sheet { max-width: none; padding: 0; } }
    @media (max-width: 560px) {
      .sheet { padding: 24px 18px 28px; }
      .head, .banner { flex-direction: column; align-items: flex-start; gap: 14px; }
      .head-meta, .banner-meta { text-align: left; }
      .head-title { font-size: 25px; }
      .totals { max-width: none; }
      .items th, .items td { padding: 9px 8px; }
    }
  `;
}

const TEMPLATE_CSS: Record<InvoiceTemplateId, (data: InvoiceRenderData) => string> = {
  standard: () => '',
  modern: (data) => `
    .sheet { border-top: 6px solid ${data.tokens.accent}; }
    .head-title { font-size: 34px; }
    .items th { border-radius: 0; }
    .total-due { border-radius: 16px; padding: 16px 18px; }
    .panel { border-radius: 14px; }
  `,
  minimal: (data) => `
    .sheet { padding-top: 46px; }
    .head-title { font-size: 22px; font-weight: 700; letter-spacing: 2.4px; text-transform: uppercase; color: ${data.tokens.muted}; }
    .head-name { font-size: 17px; font-weight: 800; letter-spacing: -0.3px; }
    .head-number { font-size: 14px; font-weight: 800; }
    .badge { background: transparent; padding: 4px 0; color: ${data.tokens.muted}; }
    .items { margin-top: 34px; }
    .items th { background: transparent; color: ${data.tokens.muted}; border-bottom: 1px solid ${data.tokens.text}; padding-left: 0; padding-right: 0; }
    .items td { padding-left: 0; padding-right: 0; }
    .total-due { background: transparent; color: ${data.tokens.text}; padding: 14px 0 0; border-top: 2px solid ${data.tokens.text}; border-radius: 0; font-size: 15px; }
    .total-due strong { color: ${data.tokens.text}; font-size: 22px; }
    .panel { background: transparent; padding: 0; border-top: 1px solid ${data.tokens.border}; padding-top: 14px; border-radius: 0; }
    .parties { margin-top: 36px; }
  `,
  bold: (data) => `
    .sheet { padding-top: 0; }
    .banner {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 24px;
      margin: 0 -44px 30px; padding: 34px 44px 30px;
      background: ${data.tokens.accent}; color: ${data.tokens.accentText};
    }
    .banner-name { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; overflow-wrap: anywhere; }
    .banner-line { font-size: 11px; opacity: 0.88; overflow-wrap: anywhere; }
    .banner-meta { text-align: right; }
    .banner-title { font-size: 13px; font-weight: 800; letter-spacing: 3px; text-transform: uppercase; opacity: 0.85; }
    .banner-number { font-size: 20px; font-weight: 800; margin-top: 4px; }
    .banner .badge { background: ${data.tokens.accentText}; color: ${data.tokens.accent}; }
    .logo-invert { background: ${data.tokens.accentText}; border-radius: 8px; padding: 6px 8px; }
    .items th { background: ${data.tokens.text}; color: #FFFFFF; }
    @media (max-width: 560px) { .banner { margin: 0 -18px 24px; padding: 26px 18px; } }
  `,
  elegant: (data) => `
    .masthead { text-align: center; padding-bottom: 26px; }
    .masthead-name { font-size: 19px; font-weight: 700; letter-spacing: 2.6px; text-transform: uppercase; overflow-wrap: anywhere; }
    .masthead-rule { width: 54px; height: 1px; margin: 14px auto; background: ${data.tokens.accent}; }
    .masthead-title { font-size: 12px; font-weight: 700; letter-spacing: 4.5px; text-transform: uppercase; color: ${data.tokens.accent}; }
    .masthead-number { margin-top: 6px; font-size: 12px; color: ${data.tokens.muted}; letter-spacing: 0.6px; }
    .parties { margin-top: 26px; padding-top: 24px; border-top: 1px solid ${data.tokens.border}; }
    .label { letter-spacing: 1.6px; }
    .items th { background: transparent; color: ${data.tokens.muted}; border-top: 1px solid ${data.tokens.border}; border-bottom: 1px solid ${data.tokens.border}; letter-spacing: 1.4px; }
    .total-due { background: transparent; color: ${data.tokens.text}; border: 1px solid ${data.tokens.accent}; border-radius: 2px; }
    .total-due strong { color: ${data.tokens.accent}; }
    .panel { background: transparent; border: 1px solid ${data.tokens.border}; border-radius: 2px; }
    .footer { border-top: 1px solid ${data.tokens.accent}; }
  `,
  compact: (data) => `
    body { font-size: 11px; line-height: 1.45; }
    .sheet { padding: 28px 32px 24px; }
    .head-title { font-size: 22px; }
    .parties { margin-top: 20px; gap: 16px; }
    .items { margin-top: 18px; }
    .items th { padding: 7px 9px; }
    .items td { padding: 8px 9px; }
    .section, .panels { margin-top: 18px; }
    .panel { padding: 12px 14px; flex-basis: 200px; min-width: 190px; }
    .totals { margin-top: 14px; }
    .total-due { padding: 11px 14px; font-size: 13px; }
    .total-due strong { font-size: 15px; }
    .footer { margin-top: 20px; padding-top: 12px; }
    .row { padding: 4px 0; }
    .head-title { color: ${data.tokens.accent}; }
  `,
};

/** The invoice body, without the surrounding document. Reused by the web page and the PDF alike. */
export function renderInvoiceBody(data: InvoiceRenderData) {
  const templateId = getInvoiceTemplate(data.design.templateId).id;
  const compactMeta = templateId === 'compact';

  return `<div class="sheet">
    ${header(data, templateId)}
    <section class="parties">
      ${templateId === 'bold' ? '' : businessBlock(data)}
      ${clientBlock(data)}
      ${compactMeta || templateId === 'bold' ? `<div class="party">${metaBlock(data)}</div>` : ''}
    </section>
    ${compactMeta || templateId === 'bold' ? '' : `<section class="section">${metaBlock(data)}</section>`}
    ${itemsTable(data)}
    ${totalsBlock(data)}
    <div class="panels">
      ${paymentBlock(data)}
      ${instructionsBlock(data)}
      ${termsBlock(data)}
    </div>
    ${footerBlock(data)}
  </div>`;
}

/** A complete standalone document, for `expo-print` and for anything that needs a full page. */
export function renderInvoiceHtml(data: InvoiceRenderData) {
  const templateId = getInvoiceTemplate(data.design.templateId).id;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Invoice ${escapeHtml(data.invoice.number)}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      ${baseCss(data)}
      ${TEMPLATE_CSS[templateId](data)}
    </style>
  </head>
  <body>${renderInvoiceBody(data)}</body>
</html>`;
}
