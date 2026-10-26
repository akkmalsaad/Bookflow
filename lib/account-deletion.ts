import { getSupabaseFunctionUrl, isSupabaseConfigured } from '@/lib/supabase';

const REQUEST_TIMEOUT_MS = 45_000;

/**
 * deleted  — the server confirmed the BookFlow account and its data are gone. `revenuecat` says
 *            whether the subscription record at RevenueCat is erased yet or still scheduled (it is
 *            erased by hand within 30 days while BookFlow has no RevenueCat secret key), and
 *            `reference` identifies the request if the person asks support about it.
 * failed   — the server answered and said it did not finish (with a reason code). `dataDeleted`
 *            is true when the data was removed but the sign-in account was not yet.
 * unknown  — no answer arrived (offline, timeout), so the deletion may or may not have finished.
 *
 * Reasons are short codes from the server or from this function — never tokens, emails or the
 * server's own error text — so they are safe to log and to send to analytics.
 */
export type RevenueCatErasure = { status: 'pending' | 'completed'; deadline?: string };
export type AccountDeletionOutcome =
  | { outcome: 'deleted'; revenuecat: RevenueCatErasure; reference?: string }
  | { outcome: 'failed'; reason: string; dataDeleted: boolean }
  | { outcome: 'unknown'; reason: string };

function readReason(body: unknown, fallback: string) {
  if (!body || typeof body !== 'object') return fallback;
  const { reason, step, error } = body as { reason?: unknown; step?: unknown; error?: unknown };
  const code = [reason, step, error].find((value) => typeof value === 'string' && /^[a-z_]{1,40}$/.test(value));
  return typeof code === 'string' ? code : fallback;
}

const isReference = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);

/** Pending unless the server explicitly says the RevenueCat erasure is complete. */
function readErasure(value: unknown): RevenueCatErasure {
  const erasure = value && typeof value === 'object' ? value as { status?: unknown; deadline?: unknown } : {};
  const deadline = typeof erasure.deadline === 'string' && !Number.isNaN(Date.parse(erasure.deadline)) ? erasure.deadline : undefined;
  return { status: erasure.status === 'completed' ? 'completed' : 'pending', ...(deadline ? { deadline } : {}) };
}

/**
 * Asks the `delete-account` Edge Function to delete the signed-in account. The server works out
 * who is being deleted from the Clerk session token; nothing identifying is sent in the body.
 */
export async function requestAccountDeletion(getAccessToken: () => Promise<string | null>): Promise<AccountDeletionOutcome> {
  if (!isSupabaseConfigured) return { outcome: 'failed', reason: 'not_configured', dataDeleted: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // Fetched fresh: Clerk session tokens are short-lived and the server rejects expired ones.
    const token = await getAccessToken();
    if (!token) return { outcome: 'failed', reason: 'no_session', dataDeleted: false };

    let response: Response;
    try {
      response = await fetch(getSupabaseFunctionUrl('delete-account'), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
          'content-type': 'application/json',
        },
        body: '{}',
        signal: controller.signal,
      });
    } catch {
      // The request may have reached the server and finished; only the answer was lost.
      return { outcome: 'unknown', reason: controller.signal.aborted ? 'timeout' : 'network' };
    }

    const body = (await response.json().catch(() => null)) as { deleted?: unknown; dataDeleted?: unknown; revenuecat?: unknown; reference?: unknown } | null;
    if (response.ok && body?.deleted === true) {
      return { outcome: 'deleted', revenuecat: readErasure(body.revenuecat), ...(isReference(body.reference) ? { reference: body.reference } : {}) };
    }
    // A gateway error page or a 5xx without a body is not a definite "no".
    if (!body && response.status >= 500) return { outcome: 'unknown', reason: `http_${response.status}` };
    return { outcome: 'failed', reason: readReason(body, `http_${response.status}`), dataDeleted: body?.dataDeleted === true };
  } catch {
    return { outcome: 'failed', reason: 'client_error', dataDeleted: false };
  } finally {
    clearTimeout(timeout);
  }
}
