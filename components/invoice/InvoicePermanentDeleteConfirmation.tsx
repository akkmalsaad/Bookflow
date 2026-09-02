import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { InvoiceIdentityCard, SheetCallout, invoiceSheetStyles } from '@/components/invoice/InvoiceSheetParts';
import { modalScrollProps } from '@/components/modal-keyboard';
import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';

type Props = {
  visible: boolean;
  invoiceNumber: string;
  clientName: string;
  amount: string;
  /** Set when the invoice has payments, so the sheet can say what is and is not being destroyed. */
  hasPaymentHistory: boolean;
  isBusy: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * The stronger of the two confirmations. Reached only from a Dustbin card's ••• menu — never from a
 * swipe — so permanent deletion always takes two deliberate taps on two separate surfaces.
 */
export function InvoicePermanentDeleteConfirmation({
  visible,
  invoiceNumber,
  clientName,
  amount,
  hasPaymentHistory,
  isBusy,
  error,
  onConfirm,
  onClose,
}: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const insets = useSafeAreaInsets();

  return (
    <BottomSheetModal visible={visible} onClose={isBusy ? () => {} : onClose} heightRatio={0.85}>
      <>
        <ScrollView {...modalScrollProps} style={styles.body}>
          <View style={invoiceSheetStyles.header}>
            <Text style={[invoiceSheetStyles.eyebrow, { color: palette.danger }]}>Permanent</Text>
            <Text style={[invoiceSheetStyles.title, { color: palette.text }]}>Permanently delete invoice?</Text>
          </View>

          <InvoiceIdentityCard invoiceNumber={invoiceNumber} clientName={clientName} amount={amount} />

          <Text style={[invoiceSheetStyles.description, { color: palette.muter }]}>
            This invoice will be permanently removed.{'\n'}This action cannot be undone.
          </Text>

          <SheetCallout icon="warning-outline" tone="danger">
            {hasPaymentHistory
              ? 'The invoice, its payment records and its finance entries are all destroyed. They stopped counting towards your totals when it was moved to the Dustbin, so no figure will change.'
              : 'The invoice record and its shared link are destroyed. It will not return to the Dustbin.'}
          </SheetCallout>

          {error ? (
            <SheetCallout icon="alert-circle-outline" tone="danger">
              {error}
            </SheetCallout>
          ) : null}
        </ScrollView>

        <View style={[invoiceSheetStyles.actions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Keep this invoice in the Dustbin"
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
            accessibilityLabel={`Permanently delete invoice ${invoiceNumber}`}
            accessibilityHint="This cannot be undone"
            accessibilityState={{ disabled: isBusy, busy: isBusy }}
            disabled={isBusy}
            onPress={onConfirm}
            style={({ pressed }) => [
              invoiceSheetStyles.destructiveButton,
              { backgroundColor: palette.danger, shadowColor: palette.danger },
              pressed && invoiceSheetStyles.pressed,
              isBusy && invoiceSheetStyles.disabled,
            ]}>
            {isBusy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
            )}
            <Text style={invoiceSheetStyles.destructiveText} numberOfLines={1}>
              {isBusy ? 'Deleting…' : 'Delete permanently'}
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
});
