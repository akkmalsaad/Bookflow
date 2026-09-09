import { Ionicons } from '@expo/vector-icons';
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

type LegalDocument = 'privacy' | 'terms';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupScreen() {
  const { signInWithSocial, signUp, verifyEmail } = useAuth();
  const posthog = usePostHog();
  const { t } = useTranslation();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [formError, setFormError] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [showVerification, setShowVerification] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);
  const [socialProvider, setSocialProvider] = useState<SocialProvider | null>(null);

  const legalCopy = useMemo(
    () =>
      legalDocument === 'privacy'
        ? {
            title: 'Privacy notice',
            subtitle: 'How Bookflow handles your account and business information.',
            paragraphs: [
              'Bookflow stores the account details and business records you provide so the app can deliver its booking, invoicing, customer, and finance features.',
              'Identity credentials are handled by Clerk. Business records are stored in Supabase and isolated per account with row-level security. Bookflow never stores raw Apple or Google passwords.',
              'Before production launch, replace this placeholder with your final privacy policy, retention rules, contact details, and jurisdiction-specific disclosures.',
            ],
          }
        : {
            title: 'Terms of service',
            subtitle: 'The basic rules for using Bookflow.',
            paragraphs: [
              'You are responsible for the accuracy of the customer, booking, invoice, and finance records entered into your workspace.',
              'Bookflow is currently a prototype and should not be treated as a final accounting, tax, payment, or identity service until the relevant production integrations are complete.',
              'Before launch, replace this placeholder with your final business terms, acceptable-use policy, billing terms, and governing law.',
            ],
          },
    [legalDocument],
  );

  const handleCreateAccount = async () => {
    const safeEmail = email.trim().toLowerCase();

    if (name.trim().length < 2) {
      setFormError(t('auth.error.name'));
      return;
    }
    if (!EMAIL_PATTERN.test(safeEmail)) {
      setFormError(t('auth.error.email'));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError(`Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setFormError(t('auth.error.mismatch'));
      return;
    }
    if (!acceptedTerms) {
      setFormError(t('auth.error.accept'));
      return;
    }

    setFormError('');
    setIsSubmitting(true);
    try {
      await signUp({ email: safeEmail, name: name.trim(), password });
      setShowVerification(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('auth.error.create'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyAndCreateAccount = async () => {
    if (!/^\d{6}$/.test(verificationCode)) {
      setVerificationError(t('auth.error.verifyCode'));
      return;
    }

    setVerificationError('');
    setIsSubmitting(true);
    try {
      await verifyEmail(verificationCode);
      posthog.capture('account_created', { method: 'password' });
      setShowVerification(false);
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : t('auth.error.verify'));
    } finally {
      setIsSubmitting(false);
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
      eyebrow={t('auth.signup.eyebrow')}
      subtitle={t('auth.signup.subtitle')}
      title={t('auth.signup.title')}>
      <AuthField
        autoCapitalize="words"
        autoComplete="name"
        icon="person-outline"
        label={t('auth.fullName')}
        onChangeText={setName}
        placeholder={t('auth.fullName.placeholder')}
        textContentType="name"
        value={name}
      />
      <AuthField
        autoCapitalize="none"
        autoComplete="email"
        icon="mail-outline"
        keyboardType="email-address"
        label={t('auth.email')}
        onChangeText={setEmail}
        placeholder={t('auth.email.placeholder')}
        textContentType="emailAddress"
        value={email}
      />
      <AuthField
        autoCapitalize="none"
        autoComplete="new-password"
        icon="lock-closed-outline"
        label={t('auth.password')}
        onChangeText={setPassword}
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        secureTextEntry
        textContentType="newPassword"
        value={password}
      />
      <AuthField
        autoCapitalize="none"
        autoComplete="new-password"
        icon="shield-checkmark-outline"
        label={t('auth.confirmPassword')}
        onChangeText={setConfirmPassword}
        onSubmitEditing={handleCreateAccount}
        placeholder={t('auth.confirmPassword.placeholder')}
        returnKeyType="done"
        secureTextEntry
        textContentType="newPassword"
        value={confirmPassword}
      />

      <View style={styles.termsRow}>
        <Pressable
          accessibilityLabel={t('a11y.acceptTerms')}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acceptedTerms }}
          hitSlop={6}
          onPress={() => setAcceptedTerms((current) => !current)}
          style={[
            styles.checkbox,
            {
              backgroundColor: acceptedTerms ? palette.accent : 'transparent',
              borderColor: acceptedTerms ? palette.accent : palette.border,
            },
          ]}>
          {acceptedTerms ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
        </Pressable>
        <Text style={[styles.termsCopy, { color: palette.muter }]}>{t('auth.agree')}</Text>
        <Pressable onPress={() => setLegalDocument('terms')}>
          <Text style={[styles.legalLink, { color: palette.accent }]}>{t('auth.terms')}</Text>
        </Pressable>
        <Text style={[styles.termsCopy, { color: palette.muter }]}> and </Text>
        <Pressable onPress={() => setLegalDocument('privacy')}>
          <Text style={[styles.legalLink, { color: palette.accent }]}>{t('auth.privacy')}</Text>
        </Pressable>
      </View>

      {formError ? <InlineMessage>{formError}</InlineMessage> : null}
      <PrimaryAuthButton
        label={t('auth.createAccountButton')}
        loadingLabel="Creating account…"
        onPress={handleCreateAccount}
        pending={isSubmitting}
      />
      <View nativeID="clerk-captcha" />

      <AuthDivider />
      <SocialButtons onPress={setSocialProvider} />

      <View style={styles.footerRow}>
        <Text style={[styles.footerText, { color: palette.muter }]}>{t('auth.haveAccount')}</Text>
        <Link href="/login" replace asChild>
          <Pressable hitSlop={8}>
            <Text style={[styles.footerLink, { color: palette.accent }]}>{t('auth.signIn')}</Text>
          </Pressable>
        </Link>
      </View>

      <AuthModal
        icon="mail-unread-outline"
        onClose={() => {
          setShowVerification(false);
          setVerificationError('');
        }}
        subtitle={`Enter the 6-digit code sent to ${email.trim().toLowerCase()}.`}
        title={t('auth.verifyEmail')}
        visible={showVerification}>
        <AuthField
          autoComplete="one-time-code"
          icon="keypad-outline"
          keyboardType="number-pad"
          label={t('auth.verificationCode')}
          maxLength={6}
          onChangeText={(value) => setVerificationCode(value.replace(/\D/g, ''))}
          placeholder="000000"
          textContentType="oneTimeCode"
          value={verificationCode}
        />
        {verificationError ? <InlineMessage>{verificationError}</InlineMessage> : null}
        <ModalActions
          primaryLabel={isSubmitting ? 'Creating account…' : 'Verify and continue'}
          primaryOnPress={verifyAndCreateAccount}
          secondaryLabel="Go back"
          secondaryOnPress={() => setShowVerification(false)}
        />
      </AuthModal>

      <AuthModal
        icon={legalDocument === 'privacy' ? 'shield-checkmark-outline' : 'document-text-outline'}
        onClose={() => setLegalDocument(null)}
        subtitle={legalCopy.subtitle}
        title={legalCopy.title}
        visible={legalDocument !== null}>
        {legalCopy.paragraphs.map((paragraph) => (
          <Text key={paragraph} style={[styles.legalParagraph, { color: palette.muter }]}>
            {paragraph}
          </Text>
        ))}
        <ModalActions primaryLabel="Done" primaryOnPress={() => setLegalDocument(null)} />
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
  termsRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', marginBottom: 18, marginTop: 1 },
  checkbox: { alignItems: 'center', borderRadius: 6, borderWidth: 1.5, height: 22, justifyContent: 'center', marginRight: 9, width: 22 },
  termsCopy: { fontSize: 12, fontWeight: '600', lineHeight: 20 },
  legalLink: { fontSize: 12, fontWeight: '900', lineHeight: 20 },
  footerRow: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 22 },
  footerText: { fontSize: 13, fontWeight: '600' },
  footerLink: { fontSize: 13, fontWeight: '900' },
  legalParagraph: { fontSize: 14, fontWeight: '500', lineHeight: 21, marginBottom: 13 },
});
