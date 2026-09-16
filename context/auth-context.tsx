import { isClerkAPIResponseError, useAuth as useClerkAuth, useSignIn, useSignUp, useSSO, useUser } from '@clerk/expo';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

import { identifyUser, resetAnalyticsIdentity } from '@/lib/analytics';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

type SignInInput = {
  email: string;
  password: string;
};

type SignUpInput = SignInInput & {
  name: string;
};

export type SocialProvider = 'apple' | 'google';

/** How this account can sign in, read from Clerk. Never includes credentials. */
export type SignInMethods = {
  email: string;
  hasPassword: boolean;
  /** Connected sign-in providers, e.g. 'apple' or 'google'. */
  providers: string[];
};

/** A signed-in session as Clerk reports it. Device fields are only what Clerk actually provides. */
export type AccountSession = {
  id: string;
  isCurrent: boolean;
  lastActiveAt: Date;
  browserName?: string;
  deviceType?: string;
  isMobile?: boolean;
  city?: string;
  country?: string;
};

export type ChangePasswordFailure = 'incorrectPassword' | 'weakPassword' | 'reverificationRequired' | 'unavailable';

type AuthContextValue = {
  isLoaded: boolean;
  isAuthenticated: boolean;
  isClerkConfigured: boolean;
  getAccessToken: () => Promise<string | null>;
  signIn: (input: SignInInput) => Promise<void>;
  signInWithSocial: (provider: SocialProvider) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  user: AuthUser | null;
  signInMethods: SignInMethods | null;
  listSessions: () => Promise<AccountSession[]>;
  revokeSession: (sessionId: string) => Promise<void>;
  changePassword: (input: {
    currentPassword: string;
    newPassword: string;
    signOutOfOtherSessions: boolean;
  }) => Promise<{ ok: true } | { ok: false; reason: ChangePasswordFailure }>;
  /**
   * True only when Clerk positively reports the signed-in user no longer exists — used when a
   * deletion request failed on the client but may have completed on the server.
   */
  accountNoLongerExists: () => Promise<boolean>;
  /** Clears the local session after the server has deleted the account. Never throws. */
  endDeletedSession: () => Promise<void>;
  sendPasswordResetCode: (email: string) => Promise<void>;
  verifyPasswordResetCode: (code: string) => Promise<void>;
  submitNewPassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Sign-in reached a verification step (such as new-device or second-factor verification) that the
 * app does not complete. Screens show their own translated message for it.
 */
export class AdditionalVerificationRequiredError extends Error {
  constructor() {
    super('Additional verification is required to complete sign-in.');
    this.name = 'AdditionalVerificationRequiredError';
  }
}

function describeError(error: { longMessage?: string; message: string } | null | undefined, fallback: string) {
  return error ? error.longMessage ?? error.message : fallback;
}

/**
 * Clerk-backed implementation of the auth adapter. Screens only ever talk to this
 * context, so swapping the underlying provider never requires touching the UI.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { getToken: getClerkToken, isLoaded, isSignedIn, sessionId, signOut: clerkSignOut } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { signIn: signInResource } = useSignIn();
  const { signUp: signUpResource } = useSignUp();
  const { startSSOFlow } = useSSO();

  const user = useMemo<AuthUser | null>(() => {
    if (!isSignedIn || !clerkUser) return null;

    const fullName = [clerkUser.firstName?.trim(), clerkUser.lastName?.trim()].filter(Boolean).join(' ');
    const email = clerkUser.primaryEmailAddress?.emailAddress ?? '';
    return { id: clerkUser.id, email, name: fullName || email.split('@')[0] || 'BookFlow user' };
  }, [clerkUser, isSignedIn]);

  const signInMethods = useMemo<SignInMethods | null>(() => {
    if (!isSignedIn || !clerkUser) return null;
    return {
      email: clerkUser.primaryEmailAddress?.emailAddress ?? '',
      hasPassword: clerkUser.passwordEnabled,
      // Clerk reports e.g. 'apple' / 'google' (older SDKs prefix them with 'oauth_').
      providers: Array.from(
        new Set(clerkUser.externalAccounts.map((account) => String(account.provider).replace(/^oauth_/, ''))),
      ),
    };
  }, [clerkUser, isSignedIn]);

  const identifiedUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      if (identifiedUserIdRef.current) {
        resetAnalyticsIdentity();
        identifiedUserIdRef.current = null;
      }
      return;
    }

    if (identifiedUserIdRef.current === user.id) return;

    // Identity only: the email and name stay on the `user` object for BookFlow's own use and are
    // deliberately not sent to PostHog.
    identifyUser(user.id);
    identifiedUserIdRef.current = user.id;
  }, [user]);

  // @clerk/expo wraps getToken with a new function when its auth hook rerenders.
  // Keep Bookflow's backend adapter stable while always calling Clerk's latest
  // implementation, otherwise every token refresh recreates the Supabase client.
  const getClerkTokenRef = useRef(getClerkToken);
  useEffect(() => {
    getClerkTokenRef.current = getClerkToken;
  }, [getClerkToken]);
  const getAccessToken = useCallback(() => getClerkTokenRef.current(), []);

  const value: AuthContextValue = {
    isLoaded,
    isAuthenticated: Boolean(isSignedIn),
    isClerkConfigured: true,
    getAccessToken,
    user,
    signInMethods,

    signIn: async ({ email, password }) => {
      const { error } = await signInResource.password({ identifier: email.trim().toLowerCase(), password });
      if (error) throw new Error(describeError(error, 'We could not sign you in. Please check your details and try again.'));

      if (signInResource.status === 'complete') {
        await signInResource.finalize();
        return;
      }
      throw new AdditionalVerificationRequiredError();
    },

    signUp: async ({ email, name, password }) => {
      const trimmedName = name.trim();
      const [firstName, ...rest] = trimmedName.split(/\s+/);
      const lastName = rest.join(' ') || undefined;

      const { error } = await signUpResource.password({
        emailAddress: email.trim().toLowerCase(),
        password,
        firstName,
        lastName,
      });
      if (error) throw new Error(describeError(error, 'We could not create your account. Please try again.'));

      if (signUpResource.status === 'complete') {
        await signUpResource.finalize();
        return;
      }

      if (signUpResource.status === 'missing_requirements' && signUpResource.unverifiedFields.includes('email_address')) {
        const { error: codeError } = await signUpResource.verifications.sendEmailCode();
        if (codeError) throw new Error(describeError(codeError, 'We could not send a verification code. Please try again.'));
        return;
      }

      throw new Error('We could not create your account. Please try again.');
    },

    verifyEmail: async (code) => {
      const { error } = await signUpResource.verifications.verifyEmailCode({ code });
      if (error) throw new Error(describeError(error, 'That code is incorrect or has expired. Please try again.'));

      if (signUpResource.status === 'complete') {
        await signUpResource.finalize();
        return;
      }
      throw new Error('We could not verify your email. Please try again.');
    },

    signInWithSocial: async (provider) => {
      const strategy = provider === 'apple' ? 'oauth_apple' : 'oauth_google';
      const { createdSessionId, setActive, signUp: ssoSignUp } = await startSSOFlow({ strategy });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        return;
      }
      if (ssoSignUp?.status === 'missing_requirements') {
        throw new Error('Your account needs additional details. Please sign up with email instead.');
      }
    },

    signOut: async () => {
      await clerkSignOut();
      resetAnalyticsIdentity();
      identifiedUserIdRef.current = null;
    },

    listSessions: async () => {
      if (!clerkUser) return [];
      const sessions = await clerkUser.getSessions();
      return sessions
        .filter((session) => session.status === 'active')
        .map((session) => ({
          id: session.id,
          isCurrent: session.id === sessionId,
          lastActiveAt: session.lastActiveAt,
          browserName: session.latestActivity?.browserName || undefined,
          deviceType: session.latestActivity?.deviceType || undefined,
          isMobile: session.latestActivity?.isMobile,
          city: session.latestActivity?.city || undefined,
          country: session.latestActivity?.country || undefined,
        }))
        .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.lastActiveAt.getTime() - a.lastActiveAt.getTime());
    },

    revokeSession: async (targetId) => {
      if (!clerkUser) throw new Error('Not signed in');
      // The current device signs out through Sign out instead, so it is never revoked from here.
      if (targetId === sessionId) throw new Error('Cannot revoke the current session');
      const sessions = await clerkUser.getSessions();
      const target = sessions.find((session) => session.id === targetId);
      if (target) await target.revoke();
    },

    changePassword: async ({ currentPassword, newPassword, signOutOfOtherSessions }) => {
      if (!clerkUser?.passwordEnabled) return { ok: false, reason: 'unavailable' };
      try {
        await clerkUser.updatePassword({ currentPassword, newPassword, signOutOfOtherSessions });
        return { ok: true };
      } catch (error) {
        const code = isClerkAPIResponseError(error) ? error.errors[0]?.code : undefined;
        if (code === 'form_password_incorrect') {
          return { ok: false, reason: 'incorrectPassword' };
        }
        if (code?.startsWith('form_password_')) {
          return { ok: false, reason: 'weakPassword' };
        }
        if (code === 'session_reverification_required') return { ok: false, reason: 'reverificationRequired' };
        return { ok: false, reason: 'unavailable' };
      }
    },

    accountNoLongerExists: async () => {
      if (!clerkUser) return false;
      try {
        await clerkUser.reload();
        return false;
      } catch (error) {
        // Network failures are not proof of anything; only Clerk's own not-found/unauthorised answer is.
        return isClerkAPIResponseError(error) && (error.status === 404 || error.status === 401);
      }
    },

    endDeletedSession: async () => {
      resetAnalyticsIdentity();
      identifiedUserIdRef.current = null;
      try {
        // The server already removed the user, so Clerk may reject the request; the local session
        // is cleared either way.
        await clerkSignOut();
      } catch {
        // Nothing to recover: the account no longer exists.
      }
    },

    sendPasswordResetCode: async (email) => {
      const { error } = await signInResource.create({ identifier: email.trim().toLowerCase() });
      if (error) throw new Error(describeError(error, 'We could not find an account with that email.'));

      const { error: codeError } = await signInResource.resetPasswordEmailCode.sendCode();
      if (codeError) throw new Error(describeError(codeError, 'We could not send a reset code. Please try again.'));
    },

    verifyPasswordResetCode: async (code) => {
      const { error } = await signInResource.resetPasswordEmailCode.verifyCode({ code });
      if (error) throw new Error(describeError(error, 'That code is incorrect or has expired. Please try again.'));
    },

    submitNewPassword: async (password) => {
      const { error } = await signInResource.resetPasswordEmailCode.submitPassword({ password });
      if (error) throw new Error(describeError(error, 'We could not update your password. Please try again.'));
      await signInResource.reset();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
