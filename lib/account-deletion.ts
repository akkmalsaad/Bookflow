import { getSupabaseFunctionUrl, isSupabaseConfigured } from '@/lib/supabase';

const REQUEST_TIMEOUT_MS = 45_000;

/**
 * Asks the `delete-account` Edge Function to delete the signed-in account. The server works out
 * who is being deleted from the Clerk session token; nothing identifying is sent in the body.
 *
 * Resolves true only when the server confirms the whole deletion finished. Every failure —
 * offline, timeout, auth, server — resolves false, and the server's reasons never reach the UI.
 */
export async function requestAccountDeletion(getAccessToken: () => Promise<string | null>): Promise<boolean> {
  if (!isSupabaseConfigured) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // Fetched fresh: Clerk session tokens are short-lived and the server rejects expired ones.
    const token = await getAccessToken();
    if (!token) return false;

    const response = await fetch(getSupabaseFunctionUrl('delete-account'), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
        'content-type': 'application/json',
      },
      body: '{}',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const body = (await response.json().catch(() => null)) as { deleted?: unknown } | null;
    return body?.deleted === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
