import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { InvoiceIdentityCard, SheetCallout, invoiceSheetStyles } from '@/components/invoice/InvoiceSheetParts';
import { modalScrollProps } from '@/components/modal-keyboard';
import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { useTranslation } from '@/lib/use-translation';

type Props = {
  visible: boolean;
  title: string;
  customerLabel: string;
  amount: string;
  isBusy: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  /** Fires once the sheet has slid away, so a follow-up confirmation never overlaps it. */
  onClosed?: () => void;
};

/**
 * Confirms deleting a booking form. Built from the same parts as the invoice delete sheets, so it
 * reads and behaves like every other destructive confirmation in BookFlow.
 */
export function BookingFormDeleteConfirmation({ visible, title, customerLabel, amount, isBusy, error, onConfirm, onClose, onClosed }: Props) {
  const { t } = useTranslation();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const insets = useSafeAreaInsets();

  return (
    <BottomSheetModal visible={visible} onClose={isBusy ? () => {} : onClose} onClosed={onClosed} heightRatio={0.85}>
      <>
        <ScrollView {...modalScrollProps} style={styles.body}>
          <View style={invoiceSheetStyles.header}>
            <Text style={[invoiceSheetStyles.eyebrow, { color: palette.danger }]}>{t('of.deleteForm.eyebrow')}</Text>
            <Text style={[invoiceSheetStyles.title, { color: palette.text }]}>{t('of.deleteForm.title')}</Text>
          </View>

          <InvoiceIdentityCard invoiceNumber={title} clientName={customerLabel} amount={amount} />

          <Text style={[invoiceSheetStyles.description, { color: palette.muter }]}>{t('of.deleteForm.body')}</Text>

          <SheetCallout icon="calendar-outline" tone="warning">
            {t('of.deleteForm.booking')}
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
            accessibilityLabel={t('of.deleteForm.keep')}
            disabled={isBusy}
            onPress={onClose}
            style={({ pressed }) => [
              invoiceSheetStyles.secondaryButton,
              { backgroundColor: soft.inset, borderColor: soft.border },
              pressed && invoiceSheetStyles.pressed,
              isBusy && invoiceSheetStyles.disabled,
            ]}>
            <Text style={[invoiceSheetStyles.secondaryText, { color: palette.text }]}>{t('of.cancel')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('of.deleteForm')}
            accessibilityState={{ disabled: isBusy, busy: isBusy }}
            disabled={isBusy}
            onPress={onConfirm}
            style={({ pressed }) => [
              invoiceSheetStyles.destructiveButton,
              { backgroundColor: palette.danger, shadowColor: palette.danger },
              pressed && invoiceSheetStyles.pressed,
              isBusy && invoiceSheetStyles.disabled,
            ]}>
            {isBusy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="trash-outline" size={18} color="#FFFFFF" />}
            <Text style={invoiceSheetStyles.destructiveText} numberOfLines={1}>
              {isBusy ? t('of.deleteForm.deleting') : t('of.deleteForm')}
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
