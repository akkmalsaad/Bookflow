import { useAuth as useClerkAuth, useSignIn, useSignUp, useSSO, useUser } from '@clerk/expo';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

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
  verifyPassword: (password: string) => Promise<boolean>;
  deleteAccount: () => Promise<void>;
  sendPasswordResetCode: (email: string) => Promise<void>;
  verifyPasswordResetCode: (code: string) => Promise<void>;
  submitNewPassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function describeError(error: { longMessage?: string; message: string } | null | undefined, fallback: string) {
  return error ? error.longMessage ?? error.message : fallback;
}

/**
 * Clerk-backed implementation of the auth adapter. Screens only ever talk to this
 * context, so swapping the underlying provider never requires touching the UI.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { getToken: getClerkToken, isLoaded, isSignedIn, signOut: clerkSignOut } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { signIn: signInResource } = useSignIn();
  const { signUp: signUpResource } = useSignUp();
  const { startSSOFlow } = useSSO();

  const user = useMemo<AuthUser | null>(() => {
    if (!isSignedIn || !clerkUser) return null;

    const fullName = [clerkUser.firstName?.trim(), clerkUser.lastName?.trim()].filter(Boolean).join(' ');
    const email = clerkUser.primaryEmailAddress?.emailAddress ?? '';
    return { id: clerkUser.id, email, name: fullName || email.split('@')[0] || 'Bookflow user' };
  }, [clerkUser, isSignedIn]);

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

    signIn: async ({ email, password }) => {
      const { error } = await signInResource.password({ identifier: email.trim().toLowerCase(), password });
      if (error) throw new Error(describeError(error, 'We could not sign you in. Please check your details and try again.'));

      if (signInResource.status === 'complete') {
        await signInResource.finalize();
        return;
      }
      throw new Error('This account requires an additional verification step that Bookflow does not support yet.');
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
    },

    verifyPassword: async (password) => {
      if (!user) return false;
      const { error } = await signInResource.password({ identifier: user.email, password });
      const isValid = !error;
      await signInResource.reset();
      return isValid;
    },

    deleteAccount: async () => {
      if (!clerkUser) throw new Error('No account is currently signed in.');
      if (!clerkUser.deleteSelfEnabled) {
        throw new Error('Account deletion is not enabled for this app yet. Please contact support.');
      }
      await clerkUser.delete();
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
