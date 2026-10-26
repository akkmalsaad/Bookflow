import { getSupabaseFunctionUrl, isSupabaseConfigured } from '@/lib/supabase';

const REQUEST_TIMEOUT_MS = 10_000;
/** Waits before each retry. RevenueCat records a store purchase within seconds. */
const RETRY_DELAYS_MS = [1_500, 3_000, 6_000];

/**
 * active      — BookFlow's server verified the Pro entitlement with RevenueCat. Existing booking-form
 *               links now accept submissions (booking-public makes the same check on every one).
 * not_active  — the server answered, and RevenueCat does not (yet) show Pro for this account.
 * unavailable — no definite answer.
 *
 * `reason` tells the failures apart, so a failed activation is never assumed to mean one thing:
 *   session_rejected (401 — the caller's session/identity) · entitlement_missing, entitlement_expired,
 *   customer_not_found (RevenueCat answered without Pro for this app user id) · key_rejected,
 *   no_api_key (server key) · timeout, network, http_<status> · no_session, not_configured.
 */
export type ProActivationOutcome = 'active' | 'not_active' | 'unavailable';
export type ProActivationResult = { outcome: ProActivationOutcome; reason: string };

type Options = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  retryDelaysMs?: number[];
};

const readReason = (body: { reason?: unknown } | null, fallback: string) =>
  typeof body?.reason === 'string' && /^[a-z0-9_]{1,40}$/.test(body.reason) ? body.reason : fallback;

async function checkOnce(getAccessToken: () => Promise<string | null>, fetchImpl: typeof fetch): Promise<ProActivationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // Fetched fresh each time: Clerk session tokens are short-lived.
    const token = await getAccessToken();
    if (!token) return { outcome: 'unavailable', reason: 'no_session' };
    const response = await fetchImpl(getSupabaseFunctionUrl('entitlement-status'), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
        'content-type': 'application/json',
      },
      body: '{}',
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as { plan?: unknown; reason?: unknown } | null;
    if (response.ok && body?.plan === 'pro') return { outcome: 'active', reason: readReason(body, 'entitlement_active') };
    if (response.ok && body?.plan === 'free') return { outcome: 'not_active', reason: readReason(body, 'entitlement_missing') };
    if (response.status === 401) return { outcome: 'unavailable', reason: 'session_rejected' };
    return { outcome: 'unavailable', reason: readReason(body, `http_${response.status}`) };
  } catch {
    return { outcome: 'unavailable', reason: controller.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Confirms with BookFlow's server that a purchase or restore the store has verified is now active
 * there too. Retries while the answer is not yet 'active', since RevenueCat can take a moment to
 * record a new purchase. Only an 'active' result may be reported to the owner as done.
 */
export async function confirmProActivation(getAccessToken: () => Promise<string | null>, options: Options = {}): Promise<ProActivationResult> {
  if (!isSupabaseConfigured) return { outcome: 'unavailable', reason: 'not_configured' };
  const { fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), retryDelaysMs = RETRY_DELAYS_MS } = options;
  let result = await checkOnce(getAccessToken, fetchImpl);
  for (const delay of retryDelaysMs) {
    if (result.outcome === 'active') break;
    await sleep(delay);
    result = await checkOnce(getAccessToken, fetchImpl);
  }
  return result;
}
