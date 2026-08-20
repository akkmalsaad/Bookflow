import { createContext, useContext, useMemo, useState } from 'react';

export type AuthUser = {
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
  isAuthenticated: boolean;
  isClerkConfigured: boolean;
  signIn: (input: SignInInput) => Promise<void>;
  signInWithSocial: (provider: SocialProvider) => Promise<void>;
  signOut: () => void;
  signUp: (input: SignUpInput) => Promise<void>;
  user: AuthUser | null;
  verifyPassword: (password: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Local auth adapter used until Clerk is connected. Keeping all session changes
 * behind this provider means Clerk can replace these methods without changing
 * the screens or route guards.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [password, setPassword] = useState<string | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: user !== null,
      isClerkConfigured: false,
      user,
      signIn: async ({ email, password: signInPassword }) => {
        setUser({ email: email.trim().toLowerCase(), name: email.trim().split('@')[0] || 'Bookflow user' });
        setPassword(signInPassword);
      },
      signUp: async ({ email, name, password: signUpPassword }) => {
        setUser({ email: email.trim().toLowerCase(), name: name.trim() });
        setPassword(signUpPassword);
      },
      signInWithSocial: async (provider) => {
        const providerName = provider === 'apple' ? 'Apple' : 'Google';
        setUser({ email: `${provider}@bookflow.demo`, name: `${providerName} user` });
        setPassword(null);
      },
      signOut: () => {
        setUser(null);
        setPassword(null);
      },
      verifyPassword: (input) => password !== null && input === password,
    }),
    [password, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
