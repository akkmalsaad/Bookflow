import { Ionicons } from '@expo/vector-icons';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { getSoftTokens } from '@/components/settings/tokens';
import type { Invoice } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import type { InvoicePaymentSummary } from '@/lib/invoice-payments';
import { getInvoiceNumber } from '@/lib/invoice-numbering';

type Props = {
  visible: boolean;
  invoice: Invoice | null;
  clientName: string;
  summary: InvoicePaymentSummary | null;
  currencyFormatter: Intl.NumberFormat;
  onClose: () => void;
  /** Fires once the sheet has finished sliding away, for handing off to a follow-up modal. */
  onClosed?: () => void;
  /** Each of these runs one of the screen's existing handlers, unchanged. */
  onUpdateDeposit: () => void;
  onRecordPayment: () => void;
  onMarkAsAccepted: () => void;
  onMarkAsPaid: () => void;
};

/**
 * Everything money-related for one invoice, gathered into a single sheet so the card can carry two
 * actions instead of four competing ones.
 *
 * Purely a re-presentation layer: every row calls a handler the screen already had, so deposits,
 * payments and status changes keep running through exactly the same code as before. The labels are
 * the only thing reworded — "Deposit paid" read as a status rather than an action.
 */
export function ManagePaymentSheet({
  visible,
  invoice,
  clientName,
  summary,
  currencyFormatter,
  onClose,
  onClosed,
  onUpdateDeposit,
  onRecordPayment,
  onMarkAsAccepted,
  onMarkAsPaid,
}: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const insets = useSafeAreaInsets();

  if (!invoice || !summary) return null;

  const hasDeposit = summary.payments.some((payment) => payment.kind === 'deposit');
  const canAccept = invoice.status !== 'Accepted' && invoice.status !== 'Paid';

  const rows = [
    {
      key: 'deposit',
      icon: 'wallet-outline' as const,
      label: hasDeposit ? 'Update deposit' : 'Add deposit',
      onPress: onUpdateDeposit,
      emphasised: false,
    },
    {
      key: 'payment',
      icon: 'cash-outline' as const,
      label: 'Record payment',
      onPress: onRecordPayment,
      emphasised: false,
    },
    ...(canAccept
      ? [
          {
            key: 'accept',
            icon: 'checkmark-circle-outline' as const,
            label: 'Mark as accepted',
            onPress: onMarkAsAccepted,
            emphasised: false,
          },
        ]
      : []),
    {
      key: 'paid',
      icon: 'checkmark-done-outline' as const,
      // Emphasised because it settles the invoice — with the brand indigo, never green. Green is
      // reserved for showing an achieved Paid state, not for the action that gets you there.
      label: 'Mark as paid',
      onPress: onMarkAsPaid,
      emphasised: true,
    },
  ];

  const summaryLines: { label: string; value: string; tone?: string }[] = [
    { label: 'Invoice total', value: currencyFormatter.format(summary.totalAmount) },
    { label: 'Paid', value: currencyFormatter.format(summary.amountPaid), tone: palette.success },
    { label: 'Remaining', value: currencyFormatter.format(summary.outstanding) },
  ];

  return (
    <BottomSheetModal visible={visible} onClose={onClose} onClosed={onClosed} heightRatio={0.85}>
      <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.text }]}>Manage payment</Text>
          <Text style={[styles.subtitle, { color: palette.muter }]} numberOfLines={1}>
            {getInvoiceNumber(invoice)} · {clientName}
          </Text>
        </View>

        <View style={[styles.summary, { backgroundColor: soft.inset }]}>
          {summaryLines.map((line, index) => (
            <Fragment key={line.label}>
              {index > 0 ? <View style={[styles.summaryDivider, { backgroundColor: soft.divider }]} /> : null}
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: palette.muter }]}>{line.label}</Text>
                <Text style={[styles.summaryValue, { color: line.tone ?? palette.text }]} numberOfLines={1}>
                  {line.value}
                </Text>
              </View>
            </Fragment>
          ))}
        </View>

        <View style={styles.actions}>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              accessibilityRole="button"
              accessibilityLabel={row.label}
              onPress={row.onPress}
              style={({ pressed }) => [
                styles.actionRow,
                row.emphasised
                  ? { backgroundColor: palette.accent }
                  : { backgroundColor: soft.inset },
                pressed && styles.pressed,
              ]}>
              <Ionicons
                name={row.icon}
                size={19}
                color={row.emphasised ? '#FFFFFF' : palette.accent}
              />
              <Text
                style={[styles.actionLabel, { color: row.emphasised ? '#FFFFFF' : palette.text }]}
                numberOfLines={1}>
                {row.label}
              </Text>
              {row.emphasised ? null : <Ionicons name="chevron-forward" size={16} color={palette.muter} />}
            </Pressable>
          ))}
        </View>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingTop: 2,
  },
  header: {
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13.5,
    fontWeight: '500',
    marginTop: 4,
  },
  summary: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
  },
  summaryLabel: {
    fontSize: 13.5,
    fontWeight: '500',
  },
  summaryValue: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  actions: {
    gap: 10,
    marginTop: 20,
  },
  actionRow: {
    alignItems: 'center',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  actionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
});
