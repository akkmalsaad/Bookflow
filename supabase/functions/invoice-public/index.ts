import { createClient } from 'npm:@supabase/supabase-js@2';

type InvoiceStatus = 'Sent' | 'Accepted' | 'Declined' | 'Paid' | 'Cancelled' | 'Void';

type InvoicePayload = {
  invoice: {
    id: string;
    invoiceNumber?: string;
    amount: number;
    depositPaid?: number;
    dueDate: string;
    sentAt: string;
    status: InvoiceStatus;
    terms?: string;
  };
  customer: { name: string; email: string; phone: string };
  businessProfile: { name: string; ssmRegistrationNo?: string; phone: string; email: string; address: string; logoUrl?: string };
  currency: 'MYR' | 'IDR' | 'USD';
  serviceName?: string;
  packageDetails?: string;
  eventLocation?: string;
  eventDate?: string;
  eventStartTime?: string;
  eventEndTime?: string;
};

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const publicInvoiceWebUrl = 'https://bookflow.expo.app';

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  });
}

function isInvoiceToken(value: string | null): value is string {
  return Boolean(
    value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}

function createPublicInvoiceUrl(baseUrl: string, token: string) {
  const target = new URL(baseUrl);
  target.pathname = `${target.pathname.replace(/\/$/, '')}/invoice-public`;
  target.search = '';
  target.hash = '';
  target.searchParams.set('token', token);
  return target.toString();
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!isInvoiceToken(token)) {
    return jsonResponse({ error: 'Invalid invoice link. Ask the sender for a new invoice link.' }, 400);
  }

  // Supabase Edge Functions intentionally rewrite HTML responses to text/plain.
  // Browser visits are redirected to Expo web; that page requests JSON explicitly.
  if (request.method === 'GET' && url.searchParams.get('format') !== 'json') {
    return new Response(null, {
      status: 302,
      headers: {
        'cache-control': 'no-store',
        location: createPublicInvoiceUrl(publicInvoiceWebUrl, token),
        'referrer-policy': 'no-referrer',
      },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'The invoice service is not configured.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (request.method === 'POST') {
    let action: unknown;
    try {
      const body = await request.json();
      action = body?.action;
    } catch {
      return jsonResponse({ error: 'The invoice response was not valid JSON.' }, 400);
    }

    if (action !== 'Accepted' && action !== 'Declined') {
      return jsonResponse({ error: 'Choose Accept or Decline from the invoice page.' }, 400);
    }

    const { data, error } = await admin.rpc('respond_to_invoice_link', {
      p_token: token,
      p_status: action,
    });
    // Deliberately says nothing about cancellation, voiding or deletion — only that the invoice
    // can no longer be answered.
    if (error?.message?.includes('no longer active')) {
      return jsonResponse({ error: 'This invoice is no longer active.' }, 409);
    }
    if (error || !data) {
      return jsonResponse({ error: 'This invoice link is invalid or has expired.' }, 404);
    }

    const result = data as { payload: InvoicePayload; status: InvoiceStatus };
    return jsonResponse({ payload: result.payload, status: result.status });
  }

  const { data, error } = await admin
    .from('public_invoice_links')
    .select('payload,status,expires_at')
    .eq('token', token)
    .maybeSingle();

  if (error || !data || new Date(data.expires_at).getTime() <= Date.now()) {
    return jsonResponse({ error: 'This invoice link is invalid or has expired.' }, 404);
  }

  return jsonResponse({ payload: data.payload as InvoicePayload, status: data.status as InvoiceStatus });
});
