/**
 * The rules for Contact Support and Send Feedback messages, kept free of React Native imports so
 * they can be unit tested. The database enforces the same limits
 * (supabase/migrations/20260915000000_create_support_requests_and_user_feedback.sql) — change both
 * together.
 */

export const SUPPORT_TOPICS = ['booking', 'invoice_payment', 'pro', 'account_data', 'technical', 'other'] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export const FEEDBACK_CATEGORIES = ['feature_request', 'improvement', 'praise', 'other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const MESSAGE_MIN_LENGTH = 10;
export const MESSAGE_MAX_LENGTH = 2000;

export type MessageValidationError = 'optionRequired' | 'messageRequired' | 'messageTooShort' | 'messageTooLong';

/** The first problem with a draft, or null when it can be sent. Whitespace never counts. */
export function validateSupportMessage(option: string | null, message: string): MessageValidationError | null {
  if (!option) return 'optionRequired';
  const trimmed = message.trim();
  if (!trimmed) return 'messageRequired';
  if (trimmed.length < MESSAGE_MIN_LENGTH) return 'messageTooShort';
  if (trimmed.length > MESSAGE_MAX_LENGTH) return 'messageTooLong';
  return null;
}

export type SubmitFailure = 'rateLimited' | 'unavailable';

/**
 * Maps whatever Supabase returned to the only two things the user is told. Raw database, network
 * and API messages never reach the screen.
 */
export function classifySubmitError(error: { code?: string; message?: string } | null | undefined): SubmitFailure {
  if (error?.code === 'P0001' && error.message?.includes('rate_limited')) return 'rateLimited';
  return 'unavailable';
}

/**
 * A retry of a request the server may already have stored reuses the same id, so a lost response
 * cannot create a duplicate: the second insert hits the primary key (23505) and counts as sent.
 */
export function isDuplicateSubmission(error: { code?: string } | null | undefined) {
  return error?.code === '23505';
}

/** RFC 4122 v4 layout. Only an idempotency key — never used for anything security-sensitive. */
export function createSubmissionId(random: () => number = Math.random) {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(random() * 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}
