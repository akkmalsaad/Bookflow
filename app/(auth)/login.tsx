import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePostHog } from 'posthog-react-native';

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
import { MIN_PASSWORD_LENGTH } from '@/constants/auth';
import { type SocialProvider, useAuth } from '@/context/auth-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { useTranslation } from '@/lib/use-translation';

type ResetStage = 'email' | 'code' | 'password' | 'success';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { signIn, signInWithSocial, sendPasswordResetCode, verifyPasswordResetCode, submitNewPassword } = useAuth();
  const posthog = usePostHog();
  const { t } = useTranslation();
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
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);

  const resetCopy = useMemo(() => {
    switch (resetStage) {
      case 'code':
        return {
          title: t('auth.reset.codeTitle'),
          subtitle: t('auth.reset.codeSubtitle', { email: resetEmail }),
          icon: 'mail-unread-outline' as const,
        };
      case 'password':
        return {
          title: t('auth.reset.passwordTitle'),
          subtitle: t('auth.reset.passwordSubtitle', { count: MIN_PASSWORD_LENGTH }),
          icon: 'lock-closed-outline' as const,
        };
      case 'success':
        return {
          title: t('auth.reset.successTitle'),
          subtitle: t('auth.reset.successSubtitle'),
          icon: 'checkmark-circle-outline' as const,
        };
      default:
        return {
          title: t('auth.reset.title'),
          subtitle: t('auth.reset.subtitle'),
          icon: 'key-outline' as const,
        };
    }
  }, [resetEmail, resetStage, t]);

  const handleLogin = async () => {
    const safeEmail = email.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(safeEmail)) {
      setFormError(t('auth.error.email'));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError(`Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setFormError('');
    setIsSubmitting(true);
    try {
      await signIn({ email: safeEmail, password });
      posthog.capture('user_signed_in', { method: 'password' });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('auth.error.signIn'));
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

  const continueReset = async () => {
    if (isResetSubmitting) return;
    setResetError('');

    if (resetStage === 'email') {
      if (!EMAIL_PATTERN.test(resetEmail.trim())) {
        setResetError(t('auth.error.email'));
        return;
      }
      setIsResetSubmitting(true);
      try {
        await sendPasswordResetCode(resetEmail.trim());
        setResetStage('code');
      } catch (error) {
        setResetError(error instanceof Error ? error.message : t('auth.error.resetSend'));
      } finally {
        setIsResetSubmitting(false);
      }
      return;
    }

    if (resetStage === 'code') {
      if (!/^\d{6}$/.test(resetCode)) {
        setResetError(t('auth.error.code'));
        return;
      }
      setIsResetSubmitting(true);
      try {
        await verifyPasswordResetCode(resetCode);
        setResetStage('password');
      } catch (error) {
        setResetError(error instanceof Error ? error.message : t('auth.error.codeInvalid'));
      } finally {
        setIsResetSubmitting(false);
      }
      return;
    }

    if (resetStage === 'password') {
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        setResetError(`Your new password must contain at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (newPassword !== confirmPassword) {
        setResetError(t('auth.error.mismatch'));
        return;
      }
      setIsResetSubmitting(true);
      try {
        await submitNewPassword(newPassword);
        setEmail(resetEmail.trim().toLowerCase());
        setResetStage('success');
      } catch (error) {
        setResetError(error instanceof Error ? error.message : t('auth.error.passwordUpdate'));
      } finally {
        setIsResetSubmitting(false);
      }
    }
  };

  const continueWithSocial = async () => {
    if (!socialProvider) return;
    const provider = socialProvider;
    setSocialProvider(null);
    try {
      await signInWithSocial(provider);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('auth.error.provider', { provider: provider === 'apple' ? 'Apple' : 'Google' }));
    }
  };

  return (
    <AuthScreen
      eyebrow={t('auth.login.eyebrow')}
      subtitle={t('auth.login.subtitle')}
      title={t('auth.login.title')}>
      <AuthField
        autoCapitalize="none"
        autoComplete="email"
        icon="mail-outline"
        keyboardType="email-address"
        label={t('auth.email')}
        onChangeText={setEmail}
        onSubmitEditing={handleLogin}
        placeholder={t('auth.email.placeholder')}
        returnKeyType="next"
        textContentType="emailAddress"
        value={email}
      />
      <AuthField
        autoCapitalize="none"
        autoComplete="current-password"
        icon="lock-closed-outline"
        label={t('auth.password')}
        onChangeText={setPassword}
        onSubmitEditing={handleLogin}
        placeholder={t('auth.password.placeholder')}
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
          <Text style={[styles.linkText, { color: palette.accent }]}>{t('auth.forgot')}</Text>
        </Pressable>
      </View>

      {formError ? <InlineMessage>{formError}</InlineMessage> : null}
      <PrimaryAuthButton
        label={t('auth.signIn')}
        loadingLabel="Signing in…"
        onPress={handleLogin}
        pending={isSubmitting}
      />

      <AuthDivider />
      <SocialButtons onPress={setSocialProvider} />

      <View style={styles.footerRow}>
        <Text style={[styles.footerText, { color: palette.muter }]}>{t('auth.newHere')}</Text>
        <Link href="/signup" asChild>
          <Pressable hitSlop={8}>
            <Text style={[styles.footerLink, { color: palette.accent }]}>{t('auth.createAccount')}</Text>
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
            label={t('auth.email')}
            onChangeText={setResetEmail}
            placeholder={t('auth.email.placeholder')}
            value={resetEmail}
          />
        ) : null}
        {resetStage === 'code' ? (
          <>
            <AuthField
              autoComplete="one-time-code"
              icon="keypad-outline"
              keyboardType="number-pad"
              label={t('auth.reset.code')}
              maxLength={6}
              onChangeText={(value) => setResetCode(value.replace(/\D/g, ''))}
              placeholder="000000"
              textContentType="oneTimeCode"
              value={resetCode}
            />
          </>
        ) : null}
        {resetStage === 'password' ? (
          <>
            <AuthField
              autoComplete="new-password"
              icon="lock-closed-outline"
              label={t('auth.newPassword')}
              onChangeText={setNewPassword}
              placeholder={t('auth.newPassword.placeholder', { count: MIN_PASSWORD_LENGTH })}
              secureTextEntry
              value={newPassword}
            />
            <AuthField
              autoComplete="new-password"
              icon="shield-checkmark-outline"
              label={t('auth.confirmPassword')}
              onChangeText={setConfirmPassword}
              placeholder={t('auth.confirmPassword.placeholder')}
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
        subtitle={`You'll be taken to ${socialProvider === 'apple' ? 'Apple' : 'Google'} to finish signing in.`}
        title={`Continue with ${socialProvider === 'apple' ? 'Apple' : 'Google'}`}
        visible={socialProvider !== null}>
        <ModalActions
          primaryLabel="Continue"
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
