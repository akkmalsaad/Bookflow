import Constants from 'expo-constants';
import { useMemo } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/context/auth-context';
import { createClerkSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import {
  classifySubmitError,
  isDuplicateSubmission,
  type FeedbackCategory,
  type SubmitFailure,
  type SupportTopic,
} from '@/lib/support-messages';

type BookFlowSupabase = ReturnType<typeof createClerkSupabaseClient>;

/**
 * A database client for the support inboxes, authorised by the same Clerk session as the workspace.
 * It is separate from the workspace sync so sending a message never touches workspace state.
 */
export function useSupportInboxClient() {
  const { getAccessToken } = useAuth();
  return useMemo(() => (isSupabaseConfigured ? createClerkSupabaseClient(getAccessToken) : null), [getAccessToken]);
}

export type SubmitResult = { ok: true } | { ok: false; reason: SubmitFailure };

/**
 * The only device details attached to a message: enough to reproduce a bug, nothing that
 * identifies the device or the person. No device ids, model names, tokens or locale.
 */
export function getSupportDiagnostics() {
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' ? Platform.OS : null;
  return {
    app_version: (Constants.expoConfig?.version ?? '').slice(0, 40) || null,
    platform,
    os_version: String(Platform.Version ?? '').slice(0, 40) || null,
  };
}

async function runInsert(insert: () => PromiseLike<{ error: { code?: string; message?: string } | null }>): Promise<SubmitResult> {
  try {
    const { error } = await insert();
    if (!error || isDuplicateSubmission(error)) return { ok: true };
    if (__DEV__) console.warn('[support] insert failed', error.code);
    return { ok: false, reason: classifySubmitError(error) };
  } catch {
    // Offline, DNS, or no Clerk token — all the same to the person sending the message.
    return { ok: false, reason: 'unavailable' };
  }
}

/** Stores a Contact Support message. The owner comes from the session token, never the client. */
export function submitSupportRequest(
  client: BookFlowSupabase | null,
  request: { id: string; topic: SupportTopic; message: string },
): Promise<SubmitResult> {
  if (!client) return Promise.resolve({ ok: false, reason: 'unavailable' });
  const diagnostics = getSupportDiagnostics();
  return runInsert(() =>
    client.from('support_requests').insert({
      id: request.id,
      topic: request.topic,
      message: request.message.trim(),
      ...diagnostics,
    }),
  );
}

/** Stores in-app feedback. Feedback carries no OS version — it is not needed to act on it. */
export function submitUserFeedback(
  client: BookFlowSupabase | null,
  feedback: { id: string; category: FeedbackCategory; message: string },
): Promise<SubmitResult> {
  if (!client) return Promise.resolve({ ok: false, reason: 'unavailable' });
  const { app_version, platform } = getSupportDiagnostics();
  return runInsert(() =>
    client.from('user_feedback').insert({
      id: feedback.id,
      category: feedback.category,
      message: feedback.message.trim(),
      app_version,
      platform,
    }),
  );
}
