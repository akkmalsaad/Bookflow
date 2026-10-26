import { StyleSheet, Text, View } from 'react-native';

import type { BookingFormColors } from '@/components/booking/booking-form-styles';
import { chargeAmountCents, fromCents, type BookingCharge, type BookingTotals } from '@/lib/booking-pricing';
import { useTranslation } from '@/lib/use-translation';

type Props = {
  totals: BookingTotals;
  formatter: Intl.NumberFormat;
  colors: BookingFormColors;
  /** Payments and the remaining balance only mean something once the booking exists. */
  showPayments?: boolean;
  depositDueDate?: string;
  /**
   * The charges behind `totals.chargesCents`. When given, each gets its own row under its own
   * description, in order, instead of one combined "Additional charges" row.
   */
  charges?: BookingCharge[];
};

/**
 * Package subtotal, additional charges, total, deposit due and — on an existing booking — payments
 * received and the remaining balance. BookFlow has no discount or tax rules, so none are shown.
 */
export function BookingMoneySummary({ totals, formatter, colors, showPayments, depositDueDate, charges }: Props) {
  const { t } = useTranslation();
  const { palette, softInset, softBorder } = colors;
  const money = (cents: number) => formatter.format(fromCents(cents));
  const rows: { key: string; label: string; value: string; strong?: boolean }[] = [
    { key: 'package', label: t('bm.summary.package'), value: money(totals.baseCents) },
    ...(charges
      ? charges.map((charge, index) => ({ key: `charge-${index}`, label: charge.description, value: money(chargeAmountCents(charge.quantity, charge.unitPrice)) }))
      : totals.chargesCents > 0 ? [{ key: 'charges', label: t('bm.summary.charges'), value: money(totals.chargesCents) }] : []),
    { key: 'total', label: t('bm.summary.total'), value: money(totals.totalCents), strong: true },
    ...(totals.depositDueCents > 0
      ? [{ key: 'deposit', label: depositDueDate ? `${t('bm.summary.depositDue')} · ${depositDueDate}` : t('bm.summary.depositDue'), value: money(totals.depositDueCents) }]
      : []),
    ...(showPayments
      ? [
          { key: 'paid', label: t('bm.summary.paid'), value: money(totals.paidCents) },
          { key: 'balance', label: t('bm.summary.balance'), value: money(totals.balanceCents), strong: true },
        ]
      : []),
  ];

  return (
    <View accessible accessibilityRole="summary" style={[styles.card, { backgroundColor: softInset, borderColor: softBorder }]}>
      {rows.map((row) => (
        <View key={row.key} style={[styles.row, row.key === 'total' && styles.totalRow, row.key === 'total' && { borderTopColor: palette.border }]}>
          <Text style={[styles.label, { color: row.strong ? palette.text : palette.muter }, row.strong && styles.strong]}>{row.label}</Text>
          <Text style={[styles.value, { color: palette.text }, row.strong && styles.strong]}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, marginTop: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, gap: 12 },
  totalRow: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4, paddingTop: 9 },
  label: { flex: 1, fontSize: 13, fontWeight: '600' },
  value: { fontSize: 13, fontWeight: '700' },
  strong: { fontSize: 14, fontWeight: '800' },
});
