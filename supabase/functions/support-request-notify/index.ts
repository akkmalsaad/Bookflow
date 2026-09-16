/**
 * Emails support@bookflow.my when a new row lands in public.support_requests.
 *
 * NOT ACTIVE until configured. The app never calls this function — a request counts as sent once
 * it is stored. To turn email on:
 *   1. supabase functions deploy support-request-notify
 *   2. supabase secrets set SUPPORT_WEBHOOK_SECRET=<long random string> RESEND_API_KEY=<key>
 *      (optional) SUPPORT_EMAIL_FROM="BookFlow Support <support@bookflow.my>" CLERK_SECRET_KEY=<key>
 *   3. Dashboard > Database > Webhooks: on INSERT into public.support_requests, POST to this
 *      function with header `x-webhook-secret: <SUPPORT_WEBHOOK_SECRET>`.
 *
 * All secrets live in Supabase function secrets, never in the app bundle.
 */

type SupportRequestRecord = {
  id: string;
  user_id: string;
  topic: string;
  message: string;
  app_version: string | null;
  platform: string | null;
  os_version: string | null;
  created_at: string;
};

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: SupportRequestRecord | null;
};

const SUPPORT_INBOX = 'support@bookflow.my';

const TOPIC_LABELS: Record<string, string> = {
  booking: 'Booking',
  invoice_payment: 'Invoice & Payment',
  pro: 'BookFlow Pro',
  account_data: 'Account & Data',
  technical: 'Technical Issue',
  other: 'Other',
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** Constant-time comparison, so the secret cannot be guessed byte by byte from response timing. */
function safeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

/** The account email, so support can reply directly. Optional: skipped without a Clerk key. */
async function lookupAccountEmail(userId: string): Promise<string | null> {
  const clerkSecret = Deno.env.get('CLERK_SECRET_KEY');
  if (!clerkSecret) return null;
  try {
    const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
      headers: { authorization: `Bearer ${clerkSecret}` },
    });
    if (!response.ok) return null;
    const user = await response.json();
    const primary = user.email_addresses?.find((entry: { id: string }) => entry.id === user.primary_email_address_id);
    return primary?.email_address ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const expectedSecret = Deno.env.get('SUPPORT_WEBHOOK_SECRET');
  const providedSecret = request.headers.get('x-webhook-secret') ?? '';
  if (!expectedSecret || !safeEqual(providedSecret, expectedSecret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as WebhookPayload | null;
  const record = payload?.record;
  if (payload?.type !== 'INSERT' || payload.table !== 'support_requests' || !record) {
    return new Response('Ignored', { status: 202 });
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    // Stored safely already; email simply is not configured yet.
    return new Response('Email provider not configured', { status: 202 });
  }

  const accountEmail = await lookupAccountEmail(record.user_id);
  const topic = TOPIC_LABELS[record.topic] ?? record.topic;
  const details = [
    ['Request', record.id],
    ['User', record.user_id],
    ['Account email', accountEmail ?? 'Unavailable'],
    ['App version', record.app_version ?? 'Unknown'],
    ['Platform', [record.platform, record.os_version].filter(Boolean).join(' ') || 'Unknown'],
    ['Received', record.created_at],
  ];

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('SUPPORT_EMAIL_FROM') ?? `BookFlow Support <${SUPPORT_INBOX}>`,
      to: [SUPPORT_INBOX],
      reply_to: accountEmail ?? undefined,
      subject: `[BookFlow support] ${topic}`,
      text: `${record.message}\n\n${details.map(([label, value]) => `${label}: ${value}`).join('\n')}`,
      html: `<p style="white-space:pre-wrap">${escapeHtml(record.message)}</p><hr/>${details
        .map(([label, value]) => `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`)
        .join('')}`,
    }),
  });

  if (!response.ok) {
    console.error('support-request-notify: email provider rejected the message', response.status);
    return new Response('Email failed', { status: 502 });
  }
  return new Response('Sent', { status: 200 });
});
