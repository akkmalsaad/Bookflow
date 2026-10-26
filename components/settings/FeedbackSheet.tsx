import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { modalScrollProps } from '@/components/modal-keyboard';
import { settingsDetailStyles } from '@/components/settings/SettingsDetailScreen';
import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { captureEvent } from '@/lib/analytics';
import { getSupportDiagnostics, submitUserFeedback, useSupportInboxClient } from '@/lib/support';
import {
  createSubmissionId,
  FEEDBACK_SHEET_CATEGORIES,
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
  validateSupportMessage,
  type FeedbackSheetCategory,
  type SubmitFailure,
} from '@/lib/support-messages';
import { useTranslation } from '@/lib/use-translation';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Fires once the sheet has finished sliding away. */
  onClosed?: () => void;
  /**
   * Called once the feedback is stored. The screen closes the sheet and thanks the person after it
   * has gone, the same way booking details hands off its "Status saved" confirmation.
   */
  onSent: () => void;
};

/**
 * Private product feedback from Settings. Stored in the user_feedback inbox (insert-only, never
 * readable from the app) with only the category, the message, the contact choice and the app
 * version — nothing from the workspace.
 */
export function FeedbackSheet({ visible, onClose, onClosed, onSent }: Props) {
  const { t } = useTranslation();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const insets = useSafeAreaInsets();
  const client = useSupportInboxClient();

  const [category, setCategory] = useState<FeedbackSheetCategory | null>(null);
  const [message, setMessage] = useState('');
  const [contactAllowed, setContactAllowed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  // Synchronous lock: a second tap in the same frame cannot start a second insert.
  const sendingRef = useRef(false);
  // Reused while the draft is unchanged, so retrying after a lost response cannot store it twice.
  const submission = useRef<{ id: string; fingerprint: string } | null>(null);
  // Cleared on the next opening rather than at once, so the form does not blank while sliding away.
  const sentRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    if (sentRef.current) {
      sentRef.current = false;
      submission.current = null;
      setCategory(null);
      setMessage('');
      setContactAllowed(false);
      setAttempted(false);
      setFailure(null);
    }
    captureEvent('feedback_opened');
  }, [visible]);

  const validation = validateSupportMessage(category, message);
  const showValidation = attempted && validation !== null;
  const categoryError = showValidation && validation === 'optionRequired';
  const messageError = showValidation && validation !== 'optionRequired';

  const validationMessage =
    validation === 'optionRequired'
      ? t('feedback.error.optionRequired')
      : validation === 'messageRequired'
        ? t('messageForm.error.messageRequired')
        : validation === 'messageTooShort'
          ? t('messageForm.error.messageTooShort', { min: MESSAGE_MIN_LENGTH })
          : validation === 'messageTooLong'
            ? t('messageForm.error.messageTooLong', { max: MESSAGE_MAX_LENGTH })
            : '';

  // Only the category and non-identifying build details — the feedback text never goes to analytics.
  const eventProperties = (chosen: FeedbackSheetCategory) => {
    const { app_version, platform } = getSupportDiagnostics();
    return { category: chosen, platform: platform ?? 'unknown', app_version: app_version ?? 'unknown' };
  };

  const handleSubmit = async () => {
    if (sendingRef.current) return;
    setAttempted(true);
    if (validation !== null || !category) return;

    const trimmed = message.trim();
    const fingerprint = `${category}|${contactAllowed}|${trimmed}`;
    if (submission.current?.fingerprint !== fingerprint) {
      submission.current = { id: createSubmissionId(), fingerprint };
    }

    sendingRef.current = true;
    setIsSending(true);
    setFailure(null);
    const result = await submitUserFeedback(client, {
      id: submission.current.id,
      category,
      message: trimmed,
      contactAllowed,
    });
    sendingRef.current = false;
    setIsSending(false);

    if (result.ok) {
      captureEvent('feedback_submitted', eventProperties(category));
      sentRef.current = true;
      onSent();
      return;
    }
    // The draft stays exactly as typed so the person can simply try again.
    setFailure(result.reason);
    captureEvent('feedback_failed', { ...eventProperties(category), reason: result.reason });
  };

  const buttonLabel = isSending ? t('messageForm.sending') : failure ? t('messageForm.retry') : t('feedback.submit');

  return (
    <BottomSheetModal visible={visible} onClose={isSending ? () => {} : onClose} onClosed={onClosed} heightRatio={0.92}>
      <ScrollView {...modalScrollProps} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
        <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>
          {t('feedbackSheet.title')}
        </Text>
        <Text style={[styles.description, { color: palette.muter }]}>{t('feedbackSheet.description')}</Text>

        <View accessibilityRole="radiogroup" accessibilityLabel={t('feedback.type.label')} style={styles.categories}>
          {FEEDBACK_SHEET_CATEGORIES.map((item) => {
            const isSelected = item === category;
            return (
              <Pressable
                key={item}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled: isSending }}
                disabled={isSending}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setCategory(item);
                  setFailure(null);
                }}
                style={({ pressed }) => [
                  styles.category,
                  { backgroundColor: soft.inset, borderColor: categoryError ? palette.danger : soft.border },
                  isSelected && { backgroundColor: soft.accentSoft, borderColor: palette.accent },
                  pressed && styles.pressed,
                ]}>
                <Text numberOfLines={2} style={[styles.categoryText, { color: isSelected ? palette.accent : palette.text }]}>
                  {t(`feedback.category.${item}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {categoryError ? <Text style={[styles.fieldError, { color: palette.danger }]}>{validationMessage}</Text> : null}

        <TextInput
          value={message}
          onChangeText={(value) => {
            setMessage(value.slice(0, MESSAGE_MAX_LENGTH));
            setFailure(null);
          }}
          editable={!isSending}
          multiline
          textAlignVertical="top"
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder={t('feedbackSheet.placeholder')}
          placeholderTextColor={palette.muter}
          accessibilityLabel={`${t('feedbackSheet.placeholder')}, ${t('messageForm.required')}`}
          style={[
            styles.input,
            { backgroundColor: soft.inset, borderColor: messageError ? palette.danger : soft.border, color: palette.text },
          ]}
        />
        <View style={styles.inputMeta}>
          <Text style={[styles.fieldError, styles.inputMetaError, { color: palette.danger }]}>
            {messageError ? validationMessage : ''}
          </Text>
          <Text style={[styles.counter, { color: palette.muter }]}>
            {t('messageForm.counter', { count: message.length, max: MESSAGE_MAX_LENGTH })}
          </Text>
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: contactAllowed, disabled: isSending }}
          disabled={isSending}
          onPress={() => {
            setContactAllowed((current) => !current);
            setFailure(null);
          }}
          style={({ pressed }) => [styles.checkboxRow, pressed && styles.pressed]}>
          <Ionicons
            name={contactAllowed ? 'checkbox' : 'square-outline'}
            size={22}
            color={contactAllowed ? palette.accent : palette.muter}
          />
          <Text style={[styles.checkboxText, { color: palette.text }]}>{t('feedbackSheet.contact')}</Text>
        </Pressable>

        {failure ? (
          <Text accessibilityRole="alert" style={[styles.failure, { color: palette.danger }]}>
            {failure === 'rateLimited' ? t('messageForm.error.rateLimited') : t('feedback.error.unavailable')}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={buttonLabel}
          accessibilityState={{ disabled: isSending, busy: isSending }}
          disabled={isSending}
          onPress={handleSubmit}
          style={({ pressed }) => [
            settingsDetailStyles.primaryButton,
            styles.submit,
            { backgroundColor: palette.accent, shadowColor: palette.accent },
            isSending && styles.disabled,
            pressed && styles.pressed,
          ]}>
          {isSending ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
          <Text style={settingsDetailStyles.primaryButtonText}>{buttonLabel}</Text>
        </Pressable>
      </ScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginBottom: 6 },
  description: { fontSize: 13.5, fontWeight: '500', lineHeight: 19, marginBottom: 18 },
  categories: { flexDirection: 'row', gap: 8 },
  // Equal thirds; a longer label wraps onto a second line inside the same height.
  category: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  categoryText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  input: {
    borderRadius: 18,
    borderWidth: 1.5,
    fontSize: 14.5,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 16,
    minHeight: 140,
    paddingHorizontal: 15,
    paddingTop: 13,
    paddingBottom: 13,
  },
  inputMeta: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, marginTop: 8 },
  inputMetaError: { flex: 1, marginTop: 0 },
  fieldError: { fontSize: 12.5, fontWeight: '600', marginTop: 8 },
  counter: { fontSize: 12, fontWeight: '700' },
  checkboxRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 10, minHeight: 44 },
  checkboxText: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  failure: { fontSize: 13, fontWeight: '600', marginTop: 12, textAlign: 'center' },
  submit: { flexDirection: 'row', gap: 10, marginTop: 16 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.8 },
});
