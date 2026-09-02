import { Ionicons } from '@expo/vector-icons';
import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDoneButton } from '@/components/KeyboardDoneButton';
import { modalScrollProps } from '@/components/modal-keyboard';
import { useModalTransition } from '@/components/modal-transition';
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
  /** Lets a form scroll its own body, e.g. to reveal a field the keyboard would cover. */
  bodyRef?: RefObject<ScrollView | null>;
  /**
   * How the card arrives.
   *
   * 'lift' rises a short distance on a spring — the original behaviour, right for a modal opened
   * straight from a screen. 'sheet' travels up from below the viewport on a timing curve, which is
   * what a modal opened *from another sheet* needs so the two movements read as one continuous
   * gesture rather than a sheet closing and a card popping.
   */
  entrance?: 'lift' | 'sheet';
};

/** How far below its resting place the card starts, far enough to read as rising from the bottom. */
const SLIDE_OFFSET = 96;
const SHEET_OPEN_MS = 300;
const SHEET_CLOSE_MS = 240;

/**
 * The compact centered payment modal shared by Record deposit and Update payment: dimmed backdrop,
 * rounded card, scrollable body so small screens still fit, and the paired footer actions.
 *
 * The card rises from the bottom on open and slides back down on close. Closing is driven by the
 * `visible` prop going false, so callers keep closing the modal exactly as before — the shell stays
 * mounted for the exit animation and unmounts itself once it finishes.
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
  bodyRef,
  entrance = 'lift',
}: ShellProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const isSheet = entrance === 'sheet';
  const { mounted, overlayStyle, contentStyle, guard } = useModalTransition({
    visible,
    // A full screen height guarantees the card begins entirely below the viewport.
    offset: isSheet ? screenHeight : SLIDE_OFFSET,
    // Matching BottomSheetModal: a long travel reads better on a curve than on a spring, and the
    // card should move as one piece rather than fading its contents in separately.
    motion: isSheet ? 'timing' : 'spring',
    openDuration: isSheet ? SHEET_OPEN_MS : undefined,
    closeDuration: isSheet ? SHEET_CLOSE_MS : undefined,
    fadeContent: !isSheet,
  });
  // Callers null out their record as they close, so hold the last body to render during the exit.
  const lastBody = useRef(children);
  if (visible) lastBody.current = children;

  // The caller's ref when it wants to drive the scroll itself, otherwise our own.
  const internalBodyRef = useRef<ScrollView>(null);
  const scrollRef = bodyRef ?? internalBodyRef;

  /**
   * Open at the first field.
   *
   * These forms are long enough to scroll, and an autofocused input plus the keyboard insets can
   * leave the body parked partway down — so the modal would slide up already showing its middle.
   * Resetting on each open guarantees the invoice total and amount are what you land on.
   */
  useEffect(() => {
    if (!visible) return;

    const id = setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 0);
    return () => clearTimeout(id);
  }, [visible, scrollRef]);
  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={guard(onClose)}>
      {/* No keyboard avoidance: the card holds its position and the body scroll area absorbs the
          keyboard instead. */}
      <View
        pointerEvents={visible ? 'auto' : 'none'}
        // Insets keep the card clear of the status bar and home indicator; the body scrolls instead.
        style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]} />
        <Pressable
          accessible={false}
          onPress={Keyboard.dismiss}
          style={StyleSheet.absoluteFill}
          importantForAccessibility="no"
        />
        <Animated.View
          style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }, contentStyle]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: palette.accent }]}>{eyebrow}</Text>
              <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Close ${title.toLowerCase()}`}
              onPress={guard(onClose)}
              style={[styles.closeButton, { backgroundColor: softInset }]}>
              <Ionicons name="close" size={22} color={palette.text} />
            </Pressable>
          </View>

          <Text style={[styles.description, { color: palette.muter }]}>{description}</Text>

          <ScrollView ref={scrollRef} style={styles.body} {...modalScrollProps}>
            {visible ? children : lastBody.current}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={guard(onClose)}
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
              onPress={guard(onPrimary)}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: palette.accent, shadowColor: palette.accent },
                primaryDisabled && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.primaryText}>{primaryLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>

        <KeyboardDoneButton />
      </View>
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
  hideReturnKey = false,
}: {
  value: string;
  onChangeText: (value: string) => void;
  currency: string;
  palette: AppPalette;
  isDarkMode: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  /** Drops the keyboard's own Done key for forms that rely on the floating checkmark instead. */
  hideReturnKey?: boolean;
}) {
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';

  return (
    <View style={[styles.amountWrap, { backgroundColor: softInset, borderColor: hasError ? palette.danger : softBorder }]}>
      <Text style={[styles.currencyPrefix, { color: palette.muter }]}>{currency}</Text>
      <TextInput
        autoFocus={autoFocus}
        keyboardType="decimal-pad"
        onChangeText={(next) => onChangeText(next.replace(/[^0-9.,]/g, ''))}
        placeholder={placeholder}
        placeholderTextColor={palette.muter}
        selectionColor={palette.accent}
        style={[styles.amountInput, { color: palette.text }]}
        value={value}
        {...(hideReturnKey
          ? null
          : {
              // The return key only finishes input; saving stays with the Save button.
              onSubmitEditing: Keyboard.dismiss,
              returnKeyType: 'done' as const,
              submitBehavior: 'blurAndSubmit' as const,
            })}
      />
    </View>
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
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  overlay: {
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
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
