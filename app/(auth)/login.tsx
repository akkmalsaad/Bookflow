import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AuthDivider,
  AuthField,
  AuthModal,
  AuthScreen,
  InlineMessage,
  ModalActions,
  PrimaryAuthButton,
  SocialButtons,
} from '@/components/AuthUI';
import { type SocialProvider, useAuth } from '@/context/auth-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

type ResetStage = 'email' | 'code' | 'password' | 'success';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { signIn, signInWithSocial } = useAuth();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [socialProvider, setSocialProvider] = useState<SocialProvider | null>(null);

  const [showReset, setShowReset] = useState(false);
  const [resetStage, setResetStage] = useState<ResetStage>('email');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');

  const resetCopy = useMemo(() => {
    switch (resetStage) {
      case 'code':
        return {
          title: 'Check your inbox',
          subtitle: `Enter the 6-digit reset code sent to ${resetEmail}.`,
          icon: 'mail-unread-outline' as const,
        };
      case 'password':
        return {
          title: 'Choose a new password',
          subtitle: 'Use at least 8 characters so your account stays secure.',
          icon: 'lock-closed-outline' as const,
        };
      case 'success':
        return {
          title: 'Password updated',
          subtitle: 'Your new password is ready. You can now return to sign in.',
          icon: 'checkmark-circle-outline' as const,
        };
      default:
        return {
          title: 'Reset your password',
          subtitle: 'Enter the email address linked to your Bookflow account.',
          icon: 'key-outline' as const,
        };
    }
  }, [resetEmail, resetStage]);

  const handleLogin = async () => {
    const safeEmail = email.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(safeEmail)) {
      setFormError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setFormError('Password must contain at least 6 characters.');
      return;
    }

    setFormError('');
    setIsSubmitting(true);
    try {
      await signIn({ email: safeEmail, password });
    } catch {
      setFormError('We could not sign you in. Please check your details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeReset = () => {
    setShowReset(false);
    setResetStage('email');
    setResetEmail('');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setResetError('');
  };

  const continueReset = () => {
    setResetError('');

    if (resetStage === 'email') {
      if (!EMAIL_PATTERN.test(resetEmail.trim())) {
        setResetError('Enter a valid email address.');
        return;
      }
      setResetStage('code');
      return;
    }

    if (resetStage === 'code') {
      if (!/^\d{6}$/.test(resetCode)) {
        setResetError('Enter the complete 6-digit code.');
        return;
      }
      setResetStage('password');
      return;
    }

    if (resetStage === 'password') {
      if (newPassword.length < 8) {
        setResetError('Your new password must contain at least 8 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setResetError('The passwords do not match.');
        return;
      }
      setPassword(newPassword);
      setEmail(resetEmail.trim().toLowerCase());
      setResetStage('success');
    }
  };

  const continueWithSocial = async () => {
    if (!socialProvider) return;
    const provider = socialProvider;
    setSocialProvider(null);
    await signInWithSocial(provider);
  };

  return (
    <AuthScreen
      eyebrow="Welcome back"
      subtitle="Sign in to manage your bookings, customers, invoices, and cash flow."
      title="Your business, right where you left it.">
      <AuthField
        autoCapitalize="none"
        autoComplete="email"
        icon="mail-outline"
        keyboardType="email-address"
        label="Email address"
        onChangeText={setEmail}
        onSubmitEditing={handleLogin}
        placeholder="you@business.com"
        returnKeyType="next"
        textContentType="emailAddress"
        value={email}
      />
      <AuthField
        autoCapitalize="none"
        autoComplete="current-password"
        icon="lock-closed-outline"
        label="Password"
        onChangeText={setPassword}
        onSubmitEditing={handleLogin}
        placeholder="Enter your password"
        returnKeyType="done"
        secureTextEntry
        textContentType="password"
        value={password}
      />

      <View style={styles.forgotRow}>
        <Pressable
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => {
            setResetEmail(email);
            setShowReset(true);
          }}>
          <Text style={[styles.linkText, { color: palette.accent }]}>Forgot password?</Text>
        </Pressable>
      </View>

      {formError ? <InlineMessage>{formError}</InlineMessage> : null}
      <PrimaryAuthButton
        label="Sign in"
        loadingLabel="Signing in…"
        onPress={handleLogin}
        pending={isSubmitting}
      />

      <AuthDivider />
      <SocialButtons onPress={setSocialProvider} />

      <View style={styles.footerRow}>
        <Text style={[styles.footerText, { color: palette.muter }]}>New to Bookflow?</Text>
        <Link href="/signup" asChild>
          <Pressable hitSlop={8}>
            <Text style={[styles.footerLink, { color: palette.accent }]}>Create an account</Text>
          </Pressable>
        </Link>
      </View>

      <AuthModal
        icon={resetCopy.icon}
        onClose={closeReset}
        subtitle={resetCopy.subtitle}
        title={resetCopy.title}
        visible={showReset}>
        {resetStage === 'email' ? (
          <AuthField
            autoCapitalize="none"
            autoComplete="email"
            icon="mail-outline"
            keyboardType="email-address"
            label="Email address"
            onChangeText={setResetEmail}
            placeholder="you@business.com"
            value={resetEmail}
          />
        ) : null}
        {resetStage === 'code' ? (
          <>
            <AuthField
              autoComplete="one-time-code"
              icon="keypad-outline"
              keyboardType="number-pad"
              label="Reset code"
              maxLength={6}
              onChangeText={(value) => setResetCode(value.replace(/\D/g, ''))}
              placeholder="000000"
              textContentType="oneTimeCode"
              value={resetCode}
            />
            <InlineMessage tone="muted">Demo mode accepts any 6-digit code until Clerk is connected.</InlineMessage>
          </>
        ) : null}
        {resetStage === 'password' ? (
          <>
            <AuthField
              autoComplete="new-password"
              icon="lock-closed-outline"
              label="New password"
              onChangeText={setNewPassword}
              placeholder="At least 8 characters"
              secureTextEntry
              value={newPassword}
            />
            <AuthField
              autoComplete="new-password"
              icon="shield-checkmark-outline"
              label="Confirm password"
              onChangeText={setConfirmPassword}
              placeholder="Repeat your password"
              secureTextEntry
              value={confirmPassword}
            />
          </>
        ) : null}
        {resetError ? <InlineMessage>{resetError}</InlineMessage> : null}
        {resetStage === 'success' ? (
          <ModalActions primaryLabel="Back to sign in" primaryOnPress={closeReset} />
        ) : (
          <ModalActions
            primaryLabel={resetStage === 'email' ? 'Send reset code' : resetStage === 'code' ? 'Verify code' : 'Update password'}
            primaryOnPress={continueReset}
            secondaryLabel="Cancel"
            secondaryOnPress={closeReset}
          />
        )}
      </AuthModal>

      <AuthModal
        icon={socialProvider === 'apple' ? 'logo-apple' : 'logo-google'}
        onClose={() => setSocialProvider(null)}
        subtitle="This button is prepared for Clerk OAuth. For now, continuing creates a local demo session so you can test the complete routed flow."
        title={`Continue with ${socialProvider === 'apple' ? 'Apple' : 'Google'}`}
        visible={socialProvider !== null}>
        <ModalActions
          primaryLabel="Continue in demo"
          primaryOnPress={continueWithSocial}
          secondaryLabel="Not now"
          secondaryOnPress={() => setSocialProvider(null)}
        />
      </AuthModal>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  forgotRow: { alignItems: 'flex-end', marginBottom: 18, marginTop: -2 },
  linkText: { fontSize: 13, fontWeight: '800' },
  footerRow: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 22 },
  footerText: { fontSize: 13, fontWeight: '600' },
  footerLink: { fontSize: 13, fontWeight: '900' },
});
