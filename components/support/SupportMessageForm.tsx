import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { SuccessFeedback } from '@/components/feedback/SuccessFeedback';
import { SettingsDetailScreen, settingsDetailStyles } from '@/components/settings/SettingsDetailScreen';
import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';
import type { SubmitResult } from '@/lib/support';
import {
  createSubmissionId,
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
  validateSupportMessage,
  type SubmitFailure,
} from '@/lib/support-messages';
import { useTranslation } from '@/lib/use-translation';

type Props<Option extends string> = {
  eyebrow: string;
  title: string;
  description: string;
  optionLabel: string;
  options: readonly Option[];
  getOptionLabel: (option: Option) => string;
  /** Shown in the option field until something is chosen. */
  selectPlaceholder: string;
  optionRequiredMessage: string;
  placeholder: string;
  submitLabel: string;
  unavailableMessage: string;
  successTitle: string;
  successMessage: string;
  submit: (draft: { id: string; option: Option; message: string }) => Promise<SubmitResult>;
  /** Analytics hooks. They receive the chosen option only — never the message. */
  onSubmitted?: (option: Option) => void;
  onFailed?: (option: Option, reason: SubmitFailure) => void;
};

/**
 * The Contact Support and Send Feedback form: one required choice, one required message, a pinned
 * send button, and the app's shared success card once the message is stored.
 */
export function SupportMessageForm<Option extends string>({
  eyebrow,
  title,
  description,
  optionLabel,
  options,
  getOptionLabel,
  selectPlaceholder,
  optionRequiredMessage,
  placeholder,
  submitLabel,
  unavailableMessage,
  successTitle,
  successMessage,
  submit,
  onSubmitted,
  onFailed,
}: Props<Option>) {
  const router = useRouter();
  const { t } = useTranslation();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const scrollRef = useRef<ScrollView>(null);

  const [option, setOption] = useState<Option | null>(null);
  const [message, setMessage] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  // Synchronous lock: a second tap in the same frame cannot start a second insert.
  const sendingRef = useRef(false);
  // Reused while the draft is unchanged, so retrying after a lost response cannot store it twice.
  const submission = useRef<{ id: string; fingerprint: string } | null>(null);

  const validation = validateSupportMessage(option, message);
  const showValidation = attempted && validation !== null;
  const optionError = showValidation && validation === 'optionRequired';
  const messageError = showValidation && validation !== 'optionRequired';
  const locked = isSending || showSuccess;

  const validationMessage =
    validation === 'optionRequired'
      ? optionRequiredMessage
      : validation === 'messageRequired'
        ? t('messageForm.error.messageRequired')
        : validation === 'messageTooShort'
          ? t('messageForm.error.messageTooShort', { min: MESSAGE_MIN_LENGTH })
          : validation === 'messageTooLong'
            ? t('messageForm.error.messageTooLong', { max: MESSAGE_MAX_LENGTH })
            : '';

  const handleSubmit = async () => {
    if (sendingRef.current || showSuccess) return;
    setAttempted(true);
    if (validation !== null || !option) return;

    const trimmed = message.trim();
    const fingerprint = `${option}|${trimmed}`;
    if (submission.current?.fingerprint !== fingerprint) {
      submission.current = { id: createSubmissionId(), fingerprint };
    }

    sendingRef.current = true;
    setIsSending(true);
    setFailure(null);
    const result = await submit({ id: submission.current.id, option, message: trimmed });
    sendingRef.current = false;
    setIsSending(false);

    if (result.ok) {
      onSubmitted?.(option);
      setShowSuccess(true);
      return;
    }
    // The draft stays exactly as typed so the person can simply try again.
    setFailure(result.reason);
    onFailed?.(option, result.reason);
  };

  // The message is the last thing in the form, so once the keyboard is up its end is what matters.
  const revealMessage = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
  };

  const buttonLabel = isSending ? t('messageForm.sending') : failure ? t('messageForm.retry') : submitLabel;

  return (
    <SettingsDetailScreen
      eyebrow={eyebrow}
      title={title}
      description={description}
      avoidKeyboard
      scrollRef={scrollRef}
      footer={
        <View>
          {failure ? (
            <Text accessibilityRole="alert" style={[styles.failure, { color: palette.danger }]}>
              {failure === 'rateLimited' ? t('messageForm.error.rateLimited') : unavailableMessage}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={buttonLabel}
            accessibilityState={{ disabled: locked, busy: isSending }}
            disabled={locked}
            onPress={handleSubmit}
            style={({ pressed }) => [
              settingsDetailStyles.primaryButton,
              styles.submit,
              { backgroundColor: palette.accent, shadowColor: palette.accent },
              locked && styles.disabled,
              pressed && styles.pressed,
            ]}>
            {isSending ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
            <Text style={settingsDetailStyles.primaryButtonText}>{buttonLabel}</Text>
          </Pressable>
        </View>
      }>
      <FieldLabel label={optionLabel} requiredLabel={t('messageForm.required')} color={palette.muter} first />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${optionLabel}, ${option ? getOptionLabel(option) : selectPlaceholder}`}
        accessibilityState={{ disabled: locked, expanded: showPicker }}
        disabled={locked}
        onPress={() => {
          Keyboard.dismiss();
          setShowPicker(true);
        }}
        style={({ pressed }) => [
          styles.select,
          { backgroundColor: soft.surface, borderColor: optionError ? palette.danger : soft.border },
          pressed && styles.pressed,
        ]}>
        <Text numberOfLines={1} style={[styles.selectText, { color: option ? palette.text : palette.muter }]}>
          {option ? getOptionLabel(option) : selectPlaceholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={palette.muter} />
      </Pressable>
      {optionError ? <Text style={[styles.fieldError, { color: palette.danger }]}>{validationMessage}</Text> : null}

      <FieldLabel label={t('messageForm.message.label')} requiredLabel={t('messageForm.required')} color={palette.muter} />
      <TextInput
        value={message}
        onChangeText={(value) => {
          setMessage(value.slice(0, MESSAGE_MAX_LENGTH));
          setFailure(null);
        }}
        onFocus={revealMessage}
        editable={!locked}
        multiline
        textAlignVertical="top"
        maxLength={MESSAGE_MAX_LENGTH}
        placeholder={placeholder}
        placeholderTextColor={palette.muter}
        accessibilityLabel={`${t('messageForm.message.label')}, ${t('messageForm.required')}`}
        style={[
          styles.input,
          {
            backgroundColor: soft.surface,
            borderColor: messageError ? palette.danger : soft.border,
            color: palette.text,
          },
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

      <OptionPickerSheet
        visible={showPicker}
        title={optionLabel}
        options={options}
        selected={option}
        getOptionLabel={getOptionLabel}
        onClose={() => setShowPicker(false)}
        onSelect={(item) => {
          setOption(item);
          setFailure(null);
          setShowPicker(false);
        }}
      />

      <Modal visible={showSuccess} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.successBackdrop}>
          <SuccessFeedback
            visible={showSuccess}
            title={successTitle}
            message={successMessage}
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

/** Single-choice picker in the app's bottom sheet, styled like the booking status picker. */
function OptionPickerSheet<Option extends string>({
  visible,
  title,
  options,
  selected,
  getOptionLabel,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: readonly Option[];
  selected: Option | null;
  getOptionLabel: (option: Option) => string;
  onSelect: (option: Option) => void;
  onClose: () => void;
}) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const insets = useSafeAreaInsets();

  return (
    <BottomSheetModal visible={visible} onClose={onClose} heightRatio={0.8}>
      <View style={[styles.sheetBody, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Text style={[styles.sheetTitle, { color: palette.text }]}>{title}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={title}>
          {options.map((item) => {
            const isSelected = item === selected;
            return (
              <Pressable
                key={item}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onSelect(item);
                }}
                style={({ pressed }) => [styles.sheetRow, isSelected && { backgroundColor: soft.inset }, pressed && styles.pressed]}>
                <Text
                  numberOfLines={1}
                  style={[styles.sheetRowLabel, { color: isSelected ? palette.accent : palette.text }]}>
                  {getOptionLabel(item)}
                </Text>
                {isSelected ? <Ionicons name="checkmark" size={20} color={palette.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </BottomSheetModal>
  );
}

function FieldLabel({ label, requiredLabel, color, first = false }: { label: string; requiredLabel: string; color: string; first?: boolean }) {
  return (
    <Text
      accessibilityLabel={`${label}, ${requiredLabel}`}
      style={[settingsDetailStyles.groupLabel, first && styles.firstLabel, { color }]}>
      {label} *
    </Text>
  );
}

const styles = StyleSheet.create({
  firstLabel: { marginTop: 0 },
  select: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 15,
  },
  selectText: { flex: 1, fontSize: 14.5, fontWeight: '600' },
  sheetBody: { paddingTop: 2 },
  sheetTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.35, marginBottom: 14, paddingHorizontal: 4 },
  sheetRow: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 13,
    minHeight: 54,
    paddingHorizontal: 12,
  },
  sheetRowLabel: { flex: 1, fontSize: 15.5, fontWeight: '700' },
  input: {
    borderRadius: 18,
    borderWidth: 1.5,
    fontSize: 14.5,
    fontWeight: '600',
    lineHeight: 21,
    minHeight: 160,
    paddingHorizontal: 15,
    paddingTop: 13,
    paddingBottom: 13,
  },
  inputMeta: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, marginTop: 8 },
  inputMetaError: { flex: 1, marginTop: 0 },
  fieldError: { fontSize: 12.5, fontWeight: '600', marginTop: 8 },
  counter: { fontSize: 12, fontWeight: '700' },
  failure: { fontSize: 13, fontWeight: '600', marginBottom: 10, textAlign: 'center' },
  submit: { flexDirection: 'row', gap: 10 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.8 },
  /** The same dim every other BookFlow success state is presented over. */
  successBackdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    flex: 1,
  },
});
