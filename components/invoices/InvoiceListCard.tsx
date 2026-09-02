import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { InvoiceStatusBadge } from '@/components/invoices/InvoiceStatusBadge';
import { getSoftTokens } from '@/components/settings/tokens';
import type { Invoice } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import type { InvoicePaymentSummary } from '@/lib/invoice-payments';
import { getInvoiceNumber } from '@/lib/invoice-numbering';

/** "2026-09-03" → "03 Sep 2026". Display only — the stored value is never touched. */
function formatCardDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
}

type Props = {
  invoice: Invoice;
  clientName: string;
  summary: InvoicePaymentSummary;
  currencyFormatter: Intl.NumberFormat;
  /** False once the invoice is paid or closed — both card actions retire together. */
  showActions: boolean;
  isSending: boolean;
  onOpen: () => void;
  onSend: () => void;
  onManagePayment: () => void;
};

/**
 * One invoice in the list.
 *
 * Two actions only: sending is the primary job, and everything to do with money is gathered behind
 * "Manage payment" instead of four buttons competing at the same weight. Both run the screen's
 * existing handlers — this component decides presentation, never behaviour.
 */
export function InvoiceListCard({
  invoice,
  clientName,
  summary,
  currencyFormatter,
  showActions,
  isSending,
  onOpen,
  onSend,
  onManagePayment,
}: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const invoiceNumber = getInvoiceNumber(invoice);
  const hasPayments = summary.amountPaid > 0;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: soft.divider, shadowColor: soft.shadow },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open invoice ${invoiceNumber} for ${clientName}`}
        accessibilityHint={`${invoice.status}, ${currencyFormatter.format(invoice.amount)}`}
        onPress={onOpen}
        style={({ pressed }) => pressed && styles.pressed}>
        <View style={styles.identityRow}>
          <Text style={[styles.invoiceNumber, { color: palette.text }]} numberOfLines={1}>
            {invoiceNumber}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={palette.muter} />
        </View>
        <View style={styles.clientRow}>
          <Text style={[styles.client, { color: palette.muter }]} numberOfLines={1}>
            {clientName}
          </Text>
          <InvoiceStatusBadge status={invoice.status} />
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaCell}>
            <Text style={[styles.metaLabel, { color: palette.muter }]}>Due date</Text>
            <View style={styles.metaValueRow}>
              <Ionicons name="calendar-outline" size={16} color={palette.muter} />
              <Text style={[styles.metaValue, { color: palette.text }]} numberOfLines={1}>
                {formatCardDate(invoice.dueDate)}
              </Text>
            </View>
          </View>
          <View style={styles.metaCell}>
            <Text style={[styles.metaLabel, { color: palette.muter }]}>Sent</Text>
            <View style={styles.metaValueRow}>
              <Ionicons name="paper-plane-outline" size={16} color={palette.muter} />
              <Text style={[styles.metaValue, { color: palette.text }]} numberOfLines={1}>
                {formatCardDate(invoice.sentAt)}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: soft.divider }]} />

        <Text style={[styles.totalLabel, { color: palette.muter }]}>Invoice total</Text>
        <Text style={[styles.total, { color: palette.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {currencyFormatter.format(invoice.amount)}
        </Text>

        {hasPayments ? (
          <View style={styles.paymentRow}>
            <Text style={[styles.paymentText, { color: palette.muter }]} numberOfLines={1}>
              Paid <Text style={{ color: palette.success, fontWeight: '800' }}>{currencyFormatter.format(summary.amountPaid)}</Text>
            </Text>
            <Text style={[styles.paymentText, { color: palette.muter }]} numberOfLines={1}>
              Balance <Text style={{ color: palette.text, fontWeight: '800' }}>{currencyFormatter.format(summary.outstanding)}</Text>
            </Text>
          </View>
        ) : (
          <Text style={[styles.paymentText, styles.noPayment, { color: palette.muter }]}>No deposit recorded</Text>
        )}
      </Pressable>

      {showActions ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Send invoice ${invoiceNumber} to ${clientName}`}
            accessibilityState={{ disabled: isSending, busy: isSending }}
            disabled={isSending}
            onPress={onSend}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: palette.accent },
              pressed && styles.pressed,
              isSending && styles.disabled,
            ]}>
            {isSending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
            )}
            <Text style={styles.primaryButtonText} numberOfLines={1}>
              {isSending ? 'Creating link…' : 'Send invoice'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Manage payment for invoice ${invoiceNumber}`}
            onPress={onManagePayment}
            style={({ pressed }) => [
              styles.secondaryButton,
              { backgroundColor: soft.inset },
              pressed && styles.pressed,
            ]}>
            <Ionicons name="wallet-outline" size={18} color={palette.accent} />
            <Text style={[styles.secondaryButtonText, { color: palette.text }]} numberOfLines={1}>
              Manage payment
            </Text>
            <Ionicons name="chevron-forward" size={16} color={palette.muter} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    elevation: 2,
    marginBottom: 16,
    padding: 20,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
  },
  identityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  invoiceNumber: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  clientRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  client: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
  },
  metaCell: {
    flex: 1,
    minWidth: 0,
  },
  metaLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  metaValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  metaValue: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 20,
  },
  totalLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  total: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.9,
  },
  paymentRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  paymentText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  noPayment: {
    marginTop: 10,
  },
  actions: {
    gap: 10,
    marginTop: 20,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.6,
  },
});
