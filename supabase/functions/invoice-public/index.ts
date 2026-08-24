import { createClient } from 'npm:@supabase/supabase-js@2';

type InvoiceStatus = 'Sent' | 'Accepted' | 'Declined' | 'Paid' | 'Cancelled';

type InvoicePayload = {
  invoice: {
    id: string;
    amount: number;
    depositPaid?: number;
    dueDate: string;
    sentAt: string;
    status: InvoiceStatus;
    terms?: string;
  };
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  businessProfile: {
    name: string;
    phone: string;
    email: string;
    address: string;
  };
  currency: 'MYR' | 'IDR' | 'USD';
  serviceName?: string;
  packageDetails?: string;
  eventLocation?: string;
  eventDate?: string;
  eventStartTime?: string;
  eventEndTime?: string;
};

const responseHeaders = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function display(value: string | undefined, fallback = 'Not specified') {
  return escapeHtml(value?.trim() || fallback);
}

function formatDate(value?: string) {
  if (!value) return 'Not specified';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(parsed);
}

function renderPage(
  payload: InvoicePayload,
  token: string,
  status: InvoiceStatus,
  notice?: string,
) {
  const formatter = new Intl.NumberFormat(
    payload.currency === 'MYR' ? 'ms-MY' : payload.currency === 'IDR' ? 'id-ID' : 'en-US',
    { style: 'currency', currency: payload.currency },
  );
  const deposit = payload.invoice.depositPaid ?? 0;
  const balance = status === 'Paid' ? 0 : Math.max(0, payload.invoice.amount - deposit);
  const canRespond = status !== 'Accepted' && status !== 'Declined' && status !== 'Paid' && status !== 'Cancelled';
  const safeToken = encodeURIComponent(token);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invoice ${escapeHtml(payload.invoice.id)}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f4f6fb;color:#172033;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5}.page{width:min(760px,calc(100% - 28px));margin:28px auto}.brand{margin-bottom:18px;color:#4f46e5;font-size:13px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase}.card{overflow:hidden;background:#fff;border:1px solid #e4e7ec;border-radius:24px;box-shadow:0 18px 48px rgba(16,24,40,.09)}.rule{height:7px;background:#4f46e5}.content{padding:30px}.header,.row,.actions{display:flex;align-items:center;justify-content:space-between;gap:18px}.eyebrow,.label{color:#667085;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase}h1{margin:5px 0 0;font-size:30px;letter-spacing:-.8px}.status{padding:7px 12px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:800;text-transform:uppercase}.notice{margin:20px 0 0;padding:13px 15px;border-radius:12px;background:#ecfdf3;color:#067647;font-weight:700}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:26px}.panel{padding:17px;border:1px solid #e4e7ec;border-radius:15px}.name{margin:7px 0 3px;font-size:17px;font-weight:800}.muted{color:#667085;font-size:13px}.summary{margin-top:18px;padding:18px;border-radius:15px;background:#f8fafc}.service{font-size:16px;font-weight:800}.description{margin-top:4px;color:#667085;white-space:pre-wrap}.amount{margin-top:12px;font-size:28px;font-weight:850}.rows{margin-top:12px}.row{padding:8px 0;border-bottom:1px solid #eaecf0;font-size:13px}.row:last-child{border:0}.row strong{text-align:right}.terms{margin-top:18px;padding:16px;border-radius:14px;background:#f8fafc;white-space:pre-wrap}.actions{margin-top:24px}.actions form{flex:1}.button{width:100%;border:0;border-radius:14px;padding:14px 18px;color:#fff;font:inherit;font-weight:800;cursor:pointer}.decline{background:#b42318}.accept{background:#4f46e5}.resolved{margin-top:24px;padding:15px;border-radius:14px;background:#f2f4f7;text-align:center;font-weight:800}.footer{padding:18px 30px;border-top:1px solid #eaecf0;color:#98a2b3;font-size:11px;text-align:center}@media(max-width:600px){.page{margin:14px auto}.content{padding:22px}.grid{grid-template-columns:1fr}.header{align-items:flex-start;flex-direction:column}.actions{flex-direction:column}.actions form{width:100%}}
  </style>
</head>
<body>
  <main class="page">
    <div class="brand">Bookflow</div>
    <article class="card">
      <div class="rule"></div>
      <div class="content">
        <header class="header">
          <div><div class="eyebrow">Invoice</div><h1>${escapeHtml(payload.invoice.id)}</h1></div>
          <div class="status">${escapeHtml(status)}</div>
        </header>
        ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
        <section class="grid">
          <div class="panel"><div class="label">From</div><div class="name">${display(payload.businessProfile.name, 'Bookflow business')}</div><div class="muted">${display(payload.businessProfile.phone, '')}</div><div class="muted">${display(payload.businessProfile.email, '')}</div></div>
          <div class="panel"><div class="label">Bill to</div><div class="name">${display(payload.customer.name)}</div><div class="muted">${display(payload.customer.email, '')}</div><div class="muted">${display(payload.customer.phone, '')}</div></div>
        </section>
        <section class="summary"><div class="label">Service</div><div class="service">${display(payload.serviceName, 'Custom service')}</div><div class="description">${display(payload.packageDetails, 'Professional services')}</div><div class="amount">${escapeHtml(formatter.format(payload.invoice.amount))}</div></section>
        <section class="rows">
          <div class="row"><span>Issued</span><strong>${formatDate(payload.invoice.sentAt)}</strong></div>
          <div class="row"><span>Due date</span><strong>${formatDate(payload.invoice.dueDate)}</strong></div>
          <div class="row"><span>Deposit paid</span><strong>${escapeHtml(formatter.format(deposit))}</strong></div>
          <div class="row"><span>Balance due</span><strong>${escapeHtml(formatter.format(balance))}</strong></div>
          <div class="row"><span>Event</span><strong>${formatDate(payload.eventDate)} · ${display(payload.eventStartTime)}–${display(payload.eventEndTime)}</strong></div>
          <div class="row"><span>Location</span><strong>${display(payload.eventLocation)}</strong></div>
        </section>
        ${payload.invoice.terms?.trim() ? `<section class="terms"><div class="label">Information &amp; terms</div>${escapeHtml(payload.invoice.terms)}</section>` : ''}
        ${
          canRespond
            ? `<div class="actions"><form method="post" action="?token=${safeToken}"><input type="hidden" name="action" value="Declined"/><button class="button decline" type="submit">Decline invoice</button></form><form method="post" action="?token=${safeToken}"><input type="hidden" name="action" value="Accepted"/><button class="button accept" type="submit">Accept invoice</button></form></div>`
            : `<div class="resolved">This invoice is ${escapeHtml(status.toLowerCase())}.</div>`
        }
      </div>
      <footer class="footer">Secure invoice link generated by Bookflow</footer>
    </article>
  </main>
</body>
</html>`;
}

function renderError(title: string, message: string, status: number) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title><style>body{margin:0;display:grid;min-height:100vh;place-items:center;padding:24px;background:#f4f6fb;color:#172033;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{max-width:520px;padding:30px;border:1px solid #e4e7ec;border-radius:22px;background:#fff;text-align:center;box-shadow:0 18px 48px rgba(16,24,40,.09)}h1{margin:0 0 10px}p{margin:0;color:#667085;line-height:1.6}</style></head><body><main class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`;
  return new Response(html, { status, headers: responseHeaders });
}

Deno.serve(async (request) => {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST' } });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return renderError('Invalid invoice link', 'Ask the sender for a new invoice link.', 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return renderError('Invoice unavailable', 'The invoice service is not configured.', 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (request.method === 'POST') {
    const form = await request.formData();
    const action = form.get('action');
    if (action !== 'Accepted' && action !== 'Declined') {
      return renderError('Invalid response', 'Choose Accept or Decline from the invoice page.', 400);
    }

    const { data, error } = await admin.rpc('respond_to_invoice_link', {
      p_token: token,
      p_status: action,
    });
    if (error || !data) {
      return renderError('Invoice unavailable', 'This invoice link is invalid or has expired.', 404);
    }

    const result = data as { payload: InvoicePayload; status: InvoiceStatus };
    return new Response(
      renderPage(
        result.payload,
        token,
        result.status,
        action === 'Accepted' ? 'Thank you. The invoice has been accepted.' : 'Your response has been recorded.',
      ),
      { status: 200, headers: responseHeaders },
    );
  }

  const { data, error } = await admin
    .from('public_invoice_links')
    .select('payload,status,expires_at')
    .eq('token', token)
    .maybeSingle();

  if (error || !data || new Date(data.expires_at).getTime() <= Date.now()) {
    return renderError('Invoice unavailable', 'This invoice link is invalid or has expired.', 404);
  }

  return new Response(renderPage(data.payload as InvoicePayload, token, data.status as InvoiceStatus), {
    status: 200,
    headers: responseHeaders,
  });
});
