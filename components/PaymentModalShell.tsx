import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  Keyboard,
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

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDoneAccessory, PAYMENT_KEYBOARD_ACCESSORY_ID } from '@/components/KeyboardDoneAccessory';
import type { AppPalette } from '@/context/theme-context';

type ShellProps = {
  visible: boolean;
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  onClose: () => void;
  palette: AppPalette;
  isDarkMode: boolean;
  children: ReactNode;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
};

/**
 * The compact centered payment modal shared by Record deposit and Update payment: dimmed backdrop,
 * rounded card, scrollable body so small screens still fit, and the paired footer actions.
 */
export function PaymentModalShell({
  visible,
  eyebrow,
  title,
  description,
  primaryLabel,
  onPrimary,
  onClose,
  palette,
  isDarkMode,
  children,
  primaryDisabled = false,
  secondaryLabel = 'Cancel',
}: ShellProps) {
  const insets = useSafeAreaInsets();
  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        // Insets keep the card clear of the status bar and home indicator; the body scrolls instead.
        style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          accessible={false}
          onPress={Keyboard.dismiss}
          style={StyleSheet.absoluteFill}
          importantForAccessibility="no"
        />
        <View style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: palette.accent }]}>{eyebrow}</Text>
              <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Close ${title.toLowerCase()}`}
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: softInset }]}>
              <Ionicons name="close" size={22} color={palette.text} />
            </Pressable>
          </View>

          <Text style={[styles.description, { color: palette.muter }]}>{description}</Text>

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.secondaryButton,
                { backgroundColor: softInset, borderColor: softBorder },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.secondaryText, { color: palette.text }]}>{secondaryLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: primaryDisabled }}
              disabled={primaryDisabled}
              onPress={onPrimary}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: palette.accent, shadowColor: palette.accent },
                primaryDisabled && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.primaryText}>{primaryLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Inset row used for invoice total / amount paid / outstanding. */
export function PaymentSummaryRow({
  label,
  value,
  palette,
  isDarkMode,
  valueColor,
}: {
  label: string;
  value: string;
  palette: AppPalette;
  isDarkMode: boolean;
  valueColor?: string;
}) {
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';

  return (
    <View style={[styles.summaryRow, { backgroundColor: softInset }]}>
      <Text style={[styles.summaryLabel, { color: palette.muter }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: valueColor ?? palette.text }]}>{value}</Text>
    </View>
  );
}

/** Money field with the currency code as a prefix, matching the deposit amount input. */
export function CurrencyAmountInput({
  value,
  onChangeText,
  currency,
  palette,
  isDarkMode,
  hasError,
  autoFocus,
  placeholder = '0.00',
}: {
  value: string;
  onChangeText: (value: string) => void;
  currency: string;
  palette: AppPalette;
  isDarkMode: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';

  return (
    <>
      <View style={[styles.amountWrap, { backgroundColor: softInset, borderColor: hasError ? palette.danger : softBorder }]}>
        <Text style={[styles.currencyPrefix, { color: palette.muter }]}>{currency}</Text>
        <TextInput
          autoFocus={autoFocus}
          inputAccessoryViewID={Platform.OS === 'ios' ? PAYMENT_KEYBOARD_ACCESSORY_ID : undefined}
          keyboardType="decimal-pad"
          onChangeText={(next) => onChangeText(next.replace(/[^0-9.,]/g, ''))}
          // The keyboard's checkmark only finishes input; saving stays with the Save button.
          onSubmitEditing={Keyboard.dismiss}
          placeholder={placeholder}
          placeholderTextColor={palette.muter}
          returnKeyType="done"
          selectionColor={palette.accent}
          submitBehavior="blurAndSubmit"
          style={[styles.amountInput, { color: palette.text }]}
          value={value}
        />
      </View>
      <KeyboardDoneAccessory nativeID={PAYMENT_KEYBOARD_ACCESSORY_ID} accessibilityLabel="Close payment keyboard" />
    </>
  );
}

/** "Remaining after payment  RM0.00" line under the amount field. */
export function PaymentBalanceRow({
  label,
  value,
  palette,
}: {
  label: string;
  value: string;
  palette: AppPalette;
}) {
  return (
    <View style={styles.balanceRow}>
      <Text style={[styles.balanceLabel, { color: palette.muter }]}>{label}</Text>
      <Text style={[styles.balanceValue, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

export const paymentModalStyles = StyleSheet.create({
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 7,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.65,
  },
  error: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 7,
  },
});

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    elevation: 14,
    maxHeight: '100%',
    maxWidth: 520,
    padding: 20,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  description: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
    marginBottom: 15,
  },
  summaryRow: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '900',
  },
  amountWrap: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    height: 66,
    paddingHorizontal: 16,
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginRight: 10,
  },
  amountInput: {
    flex: 1,
    fontSize: 23,
    fontWeight: '800',
    includeFontPadding: false,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  balanceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 11,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 16,
    elevation: 4,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    shadowOffset: { height: 6, width: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.78,
  },
});
