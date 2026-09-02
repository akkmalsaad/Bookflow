import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { InvoiceIdentityCard, SheetCallout, invoiceSheetStyles } from '@/components/invoice/InvoiceSheetParts';
import { modalScrollProps } from '@/components/modal-keyboard';
import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { INVOICE_DELETION_REASONS, type InvoiceRemovalAction } from '@/lib/invoice-lifecycle';

type Props = {
  visible: boolean;
  action: InvoiceRemovalAction | null;
  invoiceNumber: string;
  clientName: string;
  amount: string;
  /** Shown on a void so the user can see the money that is being preserved. */
  amountPaidNote?: string;
  isBusy: boolean;
  error?: string | null;
  onConfirm: (reason?: string) => void;
  onClose: () => void;
};

/**
 * Confirms moving an invoice to Dustbin — as a plain delete, a cancellation or a void, which differ
 * only in wording and in how loudly they promise that history survives.
 *
 * The reason picker is genuinely optional: it starts unselected, and the confirm button is enabled
 * from the moment the sheet opens.
 */
export function InvoiceDeleteConfirmation({
  visible,
  action,
  invoiceNumber,
  clientName,
  amount,
  amountPaidNote,
  isBusy,
  error,
  onConfirm,
  onClose,
}: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<string | null>(null);

  // Cleared on each opening rather than by remounting the sheet, so the slide-out still plays.
  useEffect(() => {
    if (visible) setReason(null);
  }, [visible]);

  if (!action) return null;

  const isVoid = action.mode === 'void';

  return (
    <BottomSheetModal visible={visible} onClose={isBusy ? () => {} : onClose} heightRatio={0.9}>
      <>
        <ScrollView {...modalScrollProps} style={styles.body}>
          <View style={invoiceSheetStyles.header}>
            <Text style={[invoiceSheetStyles.eyebrow, { color: palette.danger }]}>
              {isVoid ? 'Void' : action.mode === 'cancel' ? 'Cancel' : 'Delete'}
            </Text>
            <Text style={[invoiceSheetStyles.title, { color: palette.text }]}>{action.sheetTitle}</Text>
          </View>

          <InvoiceIdentityCard
            invoiceNumber={invoiceNumber}
            clientName={clientName}
            amount={amount}
            note={amountPaidNote}
          />

          <Text style={[invoiceSheetStyles.description, { color: palette.muter }]}>{action.description}</Text>

          <Text style={[invoiceSheetStyles.fieldLabel, { color: palette.muter }]}>
            {action.reasonLabel} <Text style={{ color: palette.muter }}>(optional)</Text>
          </Text>
          <View style={styles.reasons}>
            {INVOICE_DELETION_REASONS.map((option) => {
              const selected = reason === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityLabel={option}
                  accessibilityState={{ selected }}
                  disabled={isBusy}
                  // Tapping the chosen reason again clears it, so the choice is never a trap.
                  onPress={() => setReason(selected ? null : option)}
                  style={({ pressed }) => [
                    styles.reasonChip,
                    {
                      backgroundColor: selected ? soft.accentSoft : soft.inset,
                      borderColor: selected ? palette.accent : soft.border,
                    },
                    pressed && invoiceSheetStyles.pressed,
                  ]}>
                  <View style={styles.reasonCheck}>
                    {selected ? <Ionicons name="checkmark" size={14} color={palette.accent} /> : null}
                  </View>
                  <Text
                    style={[styles.reasonText, { color: selected ? palette.accent : palette.text }]}
                    numberOfLines={1}>
                    {option}
                  </Text>
                  {/* Mirrors the check slot, so the label centres on the chip itself rather than on
                      the space left over beside the check. */}
                  <View style={styles.reasonCheck} />
                </Pressable>
              );
            })}
          </View>

          {isVoid ? (
            <SheetCallout icon="shield-checkmark-outline" tone="warning">
              Payments, deposits and their dates are kept on the invoice, and its amounts come out of
              your revenue and outstanding totals. Restoring it puts them straight back.
            </SheetCallout>
          ) : null}

          {error ? (
            <SheetCallout icon="alert-circle-outline" tone="danger">
              {error}
            </SheetCallout>
          ) : null}
        </ScrollView>

        <View style={[invoiceSheetStyles.actions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Keep this invoice"
            disabled={isBusy}
            onPress={onClose}
            style={({ pressed }) => [
              invoiceSheetStyles.secondaryButton,
              { backgroundColor: soft.inset, borderColor: soft.border },
              pressed && invoiceSheetStyles.pressed,
              isBusy && invoiceSheetStyles.disabled,
            ]}>
            <Text style={[invoiceSheetStyles.secondaryText, { color: palette.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${action.confirmLabel} ${invoiceNumber}`}
            accessibilityState={{ disabled: isBusy, busy: isBusy }}
            disabled={isBusy}
            onPress={() => onConfirm(reason ?? undefined)}
            style={({ pressed }) => [
              invoiceSheetStyles.destructiveButton,
              { backgroundColor: palette.danger, shadowColor: palette.danger },
              pressed && invoiceSheetStyles.pressed,
              isBusy && invoiceSheetStyles.disabled,
            ]}>
            {isBusy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Ionicons name={isVoid ? 'ban-outline' : 'trash-outline'} size={18} color="#FFFFFF" />
            )}
            <Text style={invoiceSheetStyles.destructiveText} numberOfLines={1}>
              {isBusy ? 'Working…' : action.confirmLabel}
            </Text>
          </Pressable>
        </View>
      </>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  reasons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonChip: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    // Two even columns: a 46% basis leaves room for the gap, and growing fills the row exactly, so
    // the four options read as a tidy grid instead of wrapping to ragged widths.
    flexBasis: '46%',
    flexDirection: 'row',
    flexGrow: 1,
    gap: 6,
    minHeight: 46,
    minWidth: 0,
    paddingHorizontal: 12,
  },
  reasonCheck: {
    alignItems: 'center',
    // Always occupies its slot so the label sits in the same place selected or not.
    width: 15,
  },
  reasonText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
