import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { SuccessFeedback } from '@/components/feedback/SuccessFeedback';
import { SettingsDetailScreen, settingsDetailStyles } from '@/components/settings/SettingsDetailScreen';
import { getSoftTokens } from '@/components/settings/tokens';
import { useAuth, type ChangePasswordFailure } from '@/context/auth-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { useTranslation } from '@/lib/use-translation';

const MIN_PASSWORD_LENGTH = 8;

type LocalError = 'required' | 'tooShort' | 'mismatch' | 'unchanged';

/** Changes the Clerk password. Passwords go to Clerk only — nothing is stored or logged by BookFlow. */
export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const { changePassword, signInMethods } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [failure, setFailure] = useState<ChangePasswordFailure | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const savingRef = useRef(false);
  // A password can only be changed on an account that has one; guards a stale link to this screen.
  const hasNoPassword = Boolean(signInMethods && !signInMethods.hasPassword);

  useEffect(() => {
    if (hasNoPassword) router.back();
  }, [hasNoPassword, router]);

  const localError: LocalError | null =
    !currentPassword || !newPassword || !confirmPassword
      ? 'required'
      : newPassword.length < MIN_PASSWORD_LENGTH
        ? 'tooShort'
        : newPassword !== confirmPassword
          ? 'mismatch'
          : newPassword === currentPassword
            ? 'unchanged'
            : null;
  const locked = isSaving || showSuccess;

  const handleSave = async () => {
    if (savingRef.current || showSuccess) return;
    setAttempted(true);
    if (localError) return;

    savingRef.current = true;
    setIsSaving(true);
    setFailure(null);
    const result = await changePassword({ currentPassword, newPassword, signOutOfOtherSessions: signOutOthers });
    savingRef.current = false;
    setIsSaving(false);

    if (result.ok) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowSuccess(true);
      return;
    }
    setFailure(result.reason);
  };

  const localMessage =
    localError === 'required'
      ? t('password.error.required')
      : localError === 'tooShort'
        ? t('password.error.tooShort', { min: MIN_PASSWORD_LENGTH })
        : localError === 'mismatch'
          ? t('password.error.mismatch')
          : localError === 'unchanged'
            ? t('password.error.unchanged')
            : '';
  const failureMessage = failure ? t(`password.failure.${failure}`) : '';
  const message = failureMessage || (attempted ? localMessage : '');

  const inputStyle = [styles.input, { backgroundColor: soft.surface, borderColor: soft.border, color: palette.text }];

  if (hasNoPassword) return null;

  return (
    <SettingsDetailScreen
      eyebrow={t('security.eyebrow')}
      title={t('signIn.changePassword')}
      description={t('password.description')}
      avoidKeyboard
      footer={
        <View>
          {message ? (
            <Text accessibilityRole="alert" style={[styles.message, { color: palette.danger }]}>
              {message}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: locked, busy: isSaving }}
            disabled={locked}
            onPress={handleSave}
            style={({ pressed }) => [
              settingsDetailStyles.primaryButton,
              styles.submit,
              { backgroundColor: palette.accent, shadowColor: palette.accent },
              locked && styles.disabled,
              pressed && styles.pressed,
            ]}>
            {isSaving ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
            <Text style={settingsDetailStyles.primaryButtonText}>
              {isSaving ? t('password.saving') : t('password.submit')}
            </Text>
          </Pressable>
        </View>
      }>
      <Text style={[settingsDetailStyles.groupLabel, styles.firstLabel, { color: palette.muter }]}>{t('password.current')}</Text>
      <TextInput
        value={currentPassword}
        onChangeText={(value) => {
          setCurrentPassword(value);
          setFailure(null);
        }}
        editable={!locked}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        accessibilityLabel={t('password.current')}
        style={inputStyle}
      />

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>{t('password.new')}</Text>
      <TextInput
        value={newPassword}
        onChangeText={(value) => {
          setNewPassword(value);
          setFailure(null);
        }}
        editable={!locked}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        accessibilityLabel={t('password.new')}
        style={inputStyle}
      />
      <Text style={[styles.hint, { color: palette.muter }]}>{t('password.hint', { min: MIN_PASSWORD_LENGTH })}</Text>

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>{t('password.confirm')}</Text>
      <TextInput
        value={confirmPassword}
        onChangeText={(value) => {
          setConfirmPassword(value);
          setFailure(null);
        }}
        editable={!locked}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        accessibilityLabel={t('password.confirm')}
        style={inputStyle}
      />

      <View style={[styles.toggleCard, { backgroundColor: soft.surface, borderColor: soft.border }]}>
        <View style={styles.toggleCopy}>
          <Text style={[styles.toggleTitle, { color: palette.text }]}>{t('password.signOutOthers')}</Text>
          <Text style={[styles.toggleHint, { color: palette.muter }]}>{t('password.signOutOthers.hint')}</Text>
        </View>
        <Switch
          accessibilityLabel={t('password.signOutOthers')}
          value={signOutOthers}
          disabled={locked}
          onValueChange={setSignOutOthers}
          trackColor={{ true: palette.accent, false: soft.divider }}
        />
      </View>

      <Modal visible={showSuccess} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.successBackdrop}>
          <SuccessFeedback
            visible={showSuccess}
            title={t('password.updated.title')}
            message={t('password.updated.body')}
            onComplete={() => {
              setShowSuccess(false);
              router.back();
            }}
          />
        </View>
      </Modal>
    </SettingsDetailScreen>
  );
}

const styles = StyleSheet.create({
  firstLabel: { marginTop: 0 },
  input: {
    borderRadius: 18,
    borderWidth: 1.5,
    fontSize: 14.5,
    fontWeight: '600',
    minHeight: 52,
    paddingHorizontal: 15,
  },
  hint: { fontSize: 12.5, fontWeight: '500', marginTop: 8, paddingHorizontal: 4 },
  toggleCard: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
    padding: 15,
  },
  toggleCopy: { flex: 1 },
  toggleTitle: { fontSize: 14.5, fontWeight: '700' },
  toggleHint: { fontSize: 12.5, fontWeight: '500', lineHeight: 18, marginTop: 3 },
  message: { fontSize: 13, fontWeight: '600', marginBottom: 10, textAlign: 'center' },
  submit: { flexDirection: 'row', gap: 10 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.8 },
  /** The same dim every other BookFlow success state is presented over. */
  successBackdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    flex: 1,
  },
});
