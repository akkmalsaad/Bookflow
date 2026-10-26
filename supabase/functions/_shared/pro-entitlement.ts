/**
 * The business owner's Pro entitlement, verified server-side with RevenueCat at the moment it is
 * needed. Nothing is cached or stored, so there is no copy to fall behind: a purchase, restore,
 * renewal, expiry or refund is reflected as soon as RevenueCat knows about it, whether or not the
 * owner's app is open, and there are no subscription events whose order could matter.
 *
 * 'pro'     — RevenueCat confirms an active entitlement (unexpired, or inside a billing grace period).
 * 'free'    — RevenueCat answered and there is no active entitlement (or no customer record at all).
 * 'unknown' — the check could not be completed (not configured, network, timeout, RevenueCat error).
 *             Callers must not treat this as Free: it is reported as a temporary failure instead.
 *
 * `reason` is a short code saying why — safe to log and to show an owner, never a key or an id:
 *   pro: entitlement_active · free: entitlement_missing, entitlement_expired, customer_not_found ·
 *   unknown: no_api_key, key_rejected (401/403: wrong key type, e.g. not a v1 key), http_<status>,
 *   timeout, network, malformed_response.
 *
 * The RevenueCat app user id checked is the workspace `user_id` (the Clerk user id), which is what
 * lib/revenuecat.ts passes to Purchases.logIn.
 */
export type VerifiedPlan = 'pro' | 'free' | 'unknown';
export type PlanCheck = { plan: VerifiedPlan; reason: string };

type EntitlementRecord = {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
};

type Options = {
  /** REVENUECAT_SECRET_API_KEY — the same secret delete-account uses. */
  apiKey: string | undefined;
  /** Must match lib/revenuecat.ts PRO_ENTITLEMENT_ID. */
  entitlementId?: string;
  fetchImpl?: typeof fetch;
  now?: number;
  timeoutMs?: number;
};

export const DEFAULT_PRO_ENTITLEMENT_ID = 'bookflow_pro';

function isActive(entitlement: EntitlementRecord, now: number) {
  // A lifetime (non-expiring) entitlement has no expiry date.
  if (entitlement.expires_date == null) return true;
  const expires = Date.parse(entitlement.expires_date);
  const grace = entitlement.grace_period_expires_date ? Date.parse(entitlement.grace_period_expires_date) : Number.NaN;
  return (Number.isFinite(expires) && expires > now) || (Number.isFinite(grace) && grace > now);
}

export async function checkProEntitlement(userId: string, options: Options): Promise<PlanCheck> {
  const { apiKey, entitlementId = DEFAULT_PRO_ENTITLEMENT_ID, fetchImpl = fetch, now = Date.now(), timeoutMs = 5000 } = options;
  if (!apiKey) return { plan: 'unknown', reason: 'no_api_key' };
  if (!userId) return { plan: 'unknown', reason: 'no_user' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: controller.signal,
    });
    // No customer record: this owner has never purchased anything.
    if (response.status === 404) return { plan: 'free', reason: 'customer_not_found' };
    if (response.status === 401 || response.status === 403) return { plan: 'unknown', reason: 'key_rejected' };
    if (!response.ok) return { plan: 'unknown', reason: `http_${response.status}` };
    const body = await response.json().catch(() => null) as { subscriber?: { entitlements?: Record<string, EntitlementRecord> } } | null;
    const entitlements = body?.subscriber?.entitlements;
    if (!entitlements || typeof entitlements !== 'object') return { plan: 'unknown', reason: 'malformed_response' };
    const entitlement = entitlements[entitlementId];
    if (!entitlement || typeof entitlement !== 'object') return { plan: 'free', reason: 'entitlement_missing' };
    return isActive(entitlement, now) ? { plan: 'pro', reason: 'entitlement_active' } : { plan: 'free', reason: 'entitlement_expired' };
  } catch {
    return { plan: 'unknown', reason: controller.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

export async function getVerifiedPlan(userId: string, options: Options): Promise<VerifiedPlan> {
  return (await checkProEntitlement(userId, options)).plan;
}
