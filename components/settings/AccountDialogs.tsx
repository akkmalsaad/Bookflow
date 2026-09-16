import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { KeyboardDoneButton } from '@/components/KeyboardDoneButton';
import { getSoftTokens } from '@/components/settings/tokens';
import { useAppData } from '@/context/app-data-context';
import { useAuth } from '@/context/auth-context';
import { useSnackbar } from '@/context/snackbar-context';
import { useSubscription } from '@/context/subscription-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { requestAccountDeletion } from '@/lib/account-deletion';
import type { TranslationKey } from '@/lib/i18n';
import { cancelBookingReminderNotifications } from '@/lib/notifications';
import { useTranslation } from '@/lib/use-translation';
import { captureEvent } from '@/lib/analytics';

/**
 * Everything the server-side deletion removes, matching the delete-account Edge Function and
 * delete_bookflow_account_data(): the workspace document's contents, the tables keyed by the
 * account, the logo in Storage, the RevenueCat customer record and the Clerk sign-in account.
 */
const DELETED_RECORD_KEYS: TranslationKey[] = [
  'deleteAccount.record.customers',
  'deleteAccount.record.bookings',
  'deleteAccount.record.invoices',
  'deleteAccount.record.payments',
  'deleteAccount.record.finance',
  'deleteAccount.record.services',
  'deleteAccount.record.reminders',
  'deleteAccount.record.business',
  'deleteAccount.record.logo',
  'deleteAccount.record.links',
  'deleteAccount.record.support',
  'deleteAccount.record.login',
];

/** Typed exactly, in capitals, to unlock the final button. Kept the same in every language. */
export const DELETE_CONFIRMATION_WORD = 'DELETE';

export function SignOutDialog({ visible, onCancel, onConfirm }: { visible: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow }]}>
          <View style={[styles.dialogIcon, { backgroundColor: soft.dangerSoft }]}>
            <Ionicons name="log-out-outline" size={25} color={palette.danger} />
          </View>
          <Text style={[styles.dialogTitle, { color: palette.text }]}>{t('dialog.signOut.title')}</Text>
          <Text style={[styles.dialogCopy, { color: palette.muter }]}>
            {t('dialog.signOut.body')}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              style={[styles.secondaryButton, { backgroundColor: soft.inset, borderColor: soft.border }]}
              onPress={onCancel}>
              <Text style={[styles.secondaryButtonText, { color: palette.text }]}>{t('dialog.cancel')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.dangerButton, { backgroundColor: palette.danger, shadowColor: palette.danger }]}
              onPress={onConfirm}>
              <Text style={styles.dangerButtonText}>{t('dialog.signOut.confirm')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type Step = 'overview' | 'confirm';

/**
 * Two-step account deletion. The first step spells out what goes and warns about store-billed
 * subscriptions; the second needs DELETE typed before the final button unlocks. The deletion
 * itself runs on the server — this component never removes data on its own.
 */
export function DeleteAccountFlow({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const { t } = useTranslation();
  const router = useRouter();
  const { showSnackbar } = useSnackbar();
  const { isPro } = useSubscription();
  const { getAccessToken, accountNoLongerExists, endDeletedSession } = useAuth();
  const { suspendWorkspaceSync, resumeWorkspaceSync, deleteAllData } = useAppData();

  const [step, setStep] = useState<Step>('overview');
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep('overview');
    setConfirmation('');
    setFailed(false);
    captureEvent('account_deletion_started');
  }, [visible]);

  const canDelete = confirmation.trim() === DELETE_CONFIRMATION_WORD && !isDeleting;

  const cancel = () => {
    if (isDeleting) return;
    captureEvent('account_deletion_cancelled', { step });
    onClose();
  };

  const manageSubscription = () => {
    if (isDeleting) return;
    onClose();
    router.push('/settings/plan');
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    setIsDeleting(true);
    setFailed(false);

    // Nothing may write the workspace back while the server is deleting it.
    await suspendWorkspaceSync();
    let deleted = await requestAccountDeletion(getAccessToken);
    // The server may have finished even though its answer never arrived (timeout, dropped connection).
    if (!deleted) deleted = await accountNoLongerExists();

    if (!deleted) {
      resumeWorkspaceSync();
      setIsDeleting(false);
      setFailed(true);
      captureEvent('account_deletion_failed');
      return;
    }

    // Survives the navigation to the signed-out screens, which unmount this component.
    showSnackbar({ message: t('deleteAccount.done'), tone: 'success' });
    await cancelBookingReminderNotifications();
    deleteAllData();
    // Clears the analytics identity before signing out, so nothing further is tied to the account.
    await endDeletedSession();
    // Anonymous after the reset above; carries no properties.
    captureEvent('account_deletion_completed');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}>
        <View style={[styles.dialog, styles.flowDialog, { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            style={styles.flowScroll}
            contentContainerStyle={styles.flowContent}>
            <View style={[styles.dialogIcon, { backgroundColor: soft.dangerSoft }]}>
              <Ionicons name="warning-outline" size={25} color={palette.danger} />
            </View>

            {step === 'overview' ? (
              <>
                <Text style={[styles.dialogTitle, { color: palette.text }]}>{t('deleteAccount.title')}</Text>
                <Text style={[styles.dialogCopy, { color: palette.muter }]}>{t('deleteAccount.body')}</Text>

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('deleteAccount.whatDeleted')}</Text>
                <View style={[styles.recordList, styles.recordListTight, { backgroundColor: soft.inset }]}>
                  {DELETED_RECORD_KEYS.map((recordKey) => (
                    <View key={recordKey} style={styles.recordItem}>
                      <Ionicons name="close-circle" size={14} color={palette.danger} />
                      <Text style={[styles.recordText, styles.recordTextWrap, { color: palette.text }]}>{t(recordKey)}</Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.notice, { backgroundColor: soft.inset }]}>
                  <Ionicons name="card-outline" size={16} color={palette.warning} />
                  <View style={styles.noticeCopy}>
                    <Text style={[styles.noticeText, { color: palette.text }]}>
                      {isPro ? t('deleteAccount.subscription.active') : t('deleteAccount.subscription.general')}
                    </Text>
                    {isPro ? (
                      <Pressable accessibilityRole="link" hitSlop={6} onPress={manageSubscription}>
                        <Text style={[styles.noticeLink, { color: palette.accent }]}>{t('deleteAccount.subscription.manage')}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View style={styles.stackedActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={cancel}
                    style={({ pressed }) => [styles.safeButton, { backgroundColor: palette.accent, shadowColor: palette.accent }, pressed && styles.pressed]}>
                    <Text style={styles.dangerButtonText}>{t('deleteAccount.keep')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setStep('confirm')}
                    style={({ pressed }) => [styles.outlineDangerButton, { backgroundColor: soft.inset, borderColor: soft.border }, pressed && styles.pressed]}>
                    <Text style={[styles.secondaryButtonText, { color: palette.danger }]}>{t('deleteAccount.continue')}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.dialogTitle, { color: palette.text }]}>{t('deleteAccount.confirm.title')}</Text>
                <Text style={[styles.dialogCopy, { color: palette.muter }]}>
                  {t('deleteAccount.confirm.body', { word: DELETE_CONFIRMATION_WORD })}
                </Text>

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>
                  {t('deleteAccount.confirm.label', { word: DELETE_CONFIRMATION_WORD })}
                </Text>
                <TextInput
                  value={confirmation}
                  onChangeText={(value) => {
                    setConfirmation(value);
                    setFailed(false);
                  }}
                  editable={!isDeleting}
                  placeholder={DELETE_CONFIRMATION_WORD}
                  placeholderTextColor={palette.muter}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                  accessibilityLabel={t('deleteAccount.confirm.label', { word: DELETE_CONFIRMATION_WORD })}
                  style={[styles.input, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }]}
                />

                {failed ? (
                  <View accessibilityRole="alert" style={[styles.failure, { backgroundColor: soft.dangerSoft }]}>
                    <Text style={[styles.failureTitle, { color: palette.danger }]}>{t('deleteAccount.failed.title')}</Text>
                    <Text style={[styles.failureBody, { color: palette.text }]}>{t('deleteAccount.failed.body')}</Text>
                  </View>
                ) : null}

                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isDeleting }}
                    disabled={isDeleting}
                    onPress={cancel}
                    style={({ pressed }) => [styles.secondaryButton, { backgroundColor: soft.inset, borderColor: soft.border }, (isDeleting || pressed) && styles.pressed]}>
                    <Text style={[styles.secondaryButtonText, { color: palette.text }]}>{t('deleteAccount.keepShort')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canDelete, busy: isDeleting }}
                    disabled={!canDelete}
                    onPress={handleDelete}
                    style={({ pressed }) => [
                      styles.dangerButton,
                      styles.dangerButtonRow,
                      { backgroundColor: palette.danger, shadowColor: palette.danger },
                      !canDelete && !isDeleting && styles.disabled,
                      (isDeleting || pressed) && styles.pressed,
                    ]}>
                    {isDeleting ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
                    <Text style={styles.dangerButtonText} numberOfLines={1}>
                      {isDeleting ? t('deleteAccount.deleting') : failed ? t('deleteAccount.retry') : t('deleteAccount.submit')}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
        </View>

        <KeyboardDoneButton />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  dialog: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    elevation: 14,
    maxWidth: 440,
    padding: 22,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    width: '100%',
  },
  dialogIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 56,
    justifyContent: 'center',
    marginBottom: 15,
    width: 56,
  },
  dialogTitle: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  dialogCopy: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
    marginTop: 7,
    textAlign: 'center',
  },
  recordList: {
    alignSelf: 'stretch',
    borderRadius: 16,
    gap: 8,
    marginTop: 15,
    padding: 14,
  },
  recordItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  recordText: {
    fontSize: 13,
    fontWeight: '700',
  },
  fieldLabel: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.65,
    marginBottom: 8,
    marginTop: 15,
    textTransform: 'uppercase',
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '100%',
  },
  actions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryButtonText: {
    fontWeight: '800',
  },
  dangerButton: {
    alignItems: 'center',
    borderRadius: 16,
    elevation: 4,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    shadowOffset: { height: 6, width: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  dangerButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.45,
  },
  flowDialog: {
    maxHeight: '90%',
    padding: 0,
  },
  flowScroll: {
    alignSelf: 'stretch',
  },
  flowContent: {
    alignItems: 'center',
    padding: 22,
  },
  recordListTight: {
    marginTop: 0,
  },
  recordTextWrap: {
    flex: 1,
  },
  notice: {
    alignSelf: 'stretch',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 9,
    marginTop: 12,
    padding: 13,
  },
  noticeCopy: {
    flex: 1,
  },
  noticeText: {
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  noticeLink: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 8,
  },
  stackedActions: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 18,
  },
  safeButton: {
    alignItems: 'center',
    borderRadius: 16,
    elevation: 4,
    justifyContent: 'center',
    minHeight: 50,
    shadowOffset: { height: 6, width: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  outlineDangerButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  dangerButtonRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
  },
  failure: {
    alignSelf: 'stretch',
    borderRadius: 14,
    marginTop: 12,
    padding: 12,
  },
  failureTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  failureBody: {
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: 3,
  },
});
