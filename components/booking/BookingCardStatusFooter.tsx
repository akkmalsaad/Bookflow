import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { JobStatusPill } from '@/components/booking/JobStatusPill';
import { useTheme } from '@/context/theme-context';
import type { BookingInvoicePayment, BookingPaymentState } from '@/lib/job-financials';
import { useTranslation } from '@/lib/use-translation';

type BadgeColors = { background: string; text: string };

/**
 * Payment badge colours for both themes: soft amber for a deposit or part payment, green for paid
 * in full, neutral for unpaid. Every pair clears 4.5:1 for the badge's small bold label.
 */
export const PAYMENT_BADGE_COLORS: Record<BookingPaymentState, { light: BadgeColors; dark: BadgeColors }> = {
  unpaid: { light: { background: '#F3F4F6', text: '#4B5563' }, dark: { background: '#1F2937', text: '#D1D5DB' } },
  deposit_paid: { light: { background: '#FFF6E7', text: '#8A5300' }, dark: { background: '#3A2E12', text: '#FBBF24' } },
  partially_paid: { light: { background: '#FFF6E7', text: '#8A5300' }, dark: { background: '#3A2E12', text: '#FBBF24' } },
  paid: { light: { background: '#EAFBF2', text: '#117A4C' }, dark: { background: '#12362B', text: '#34D399' } },
};

export type FormStatusTone = 'awaiting' | 'attention';

/**
 * Form status badge colours: blue while waiting on the client, soft amber once details or a change
 * request need the owner. Same tones as the form card's previous pill, with dark-mode pairs.
 */
export const FORM_STATUS_BADGE_COLORS: Record<FormStatusTone, { light: BadgeColors; dark: BadgeColors }> = {
  awaiting: { light: { background: '#EAF3FF', text: '#1C5FDA' }, dark: { background: '#16304D', text: '#7DD3FC' } },
  attention: { light: { background: '#FFF6E7', text: '#8A5300' }, dark: { background: '#3A2E12', text: '#FBBF24' } },
};

type SharedProps = {
  /** From getBookingInvoicePayment; null when no open invoice is linked. */
  payment: BookingInvoicePayment | null;
  /** A linked invoice exists outside the Dustbin (open or closed) — "No active invoice" vs none. */
  hasLinkedInvoice: boolean;
  formatAmount: (amount: number) => string;
  colors: { text: string; muted: string; divider: string };
};

type BookingVariantProps = SharedProps & {
  variant: 'booking';
  jobStatus: string | null | undefined;
  onChangeJobStatus: () => void;
  isSavingJobStatus: boolean;
  jobStatusDisabled: boolean;
};

type FormVariantProps = SharedProps & {
  variant: 'form';
  /** The form's own calculated total — what the booking will be worth, not an invoice. */
  bookingTotal: number;
  /** The form's automatically derived state, already translated. Read-only. */
  formStatus: { label: string; tone: FormStatusTone };
};

type Props = BookingVariantProps | FormVariantProps;

/**
 * The bottom of a booking card: a total, then payment and a status side by side.
 *
 * Booking variant: the linked invoice total, payment, and the job status picker. The two are
 * independent on purpose — payment is a read-only badge from the invoice and its payment records;
 * job status is the booking's own field, changed only through its picker.
 *
 * Form variant (a booking form not yet a booking): the form's total, payment ("No invoice yet" until
 * a real invoice exists), and the form's derived status as a read-only badge — no picker.
 */
export function BookingCardStatusFooter(props: Props) {
  const { payment, hasLinkedInvoice, formatAmount, colors } = props;
  const isForm = props.variant === 'form';
  const { t } = useTranslation();
  const { isDarkMode } = useTheme();
  const theme = isDarkMode ? 'dark' : 'light';
  const noInvoiceLabel = t(hasLinkedInvoice ? 'bk.card.noActiveInvoice' : isForm ? 'bk.card.noInvoiceYet' : 'bk.card.noInvoice');
  const badge = payment ? PAYMENT_BADGE_COLORS[payment.state][theme] : null;
  const { fontScale, width } = useWindowDimensions();
  // Side by side needs room; large accessibility text or a narrow phone stacks the two instead.
  const stacked = fontScale >= 1.3 || width < 350;
  const total = props.variant === 'form'
    ? { label: t('bk.card.bookingTotal'), amount: props.bookingTotal }
    : payment ? { label: t('bk.card.invoiceTotal'), amount: payment.invoiceTotal } : null;

  return (
    <View style={styles.footer}>
      {total ? (
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: colors.muted }]}>{total.label}</Text>
          <Text style={[styles.totalValue, { color: colors.text }]}>{formatAmount(total.amount)}</Text>
        </View>
      ) : null}

      <View style={[styles.columns, stacked && styles.columnsStacked]}>
        <View style={styles.column} accessible accessibilityLabel={payment
          ? `${t('bk.card.payment')}, ${t(`bk.pay.${payment.state}`)}, ${t('bk.card.balance', { amount: formatAmount(payment.balance) })}`
          : `${t('bk.card.payment')}, ${noInvoiceLabel}`}>
          <Text style={[styles.columnLabel, { color: colors.muted }]}>{t('bk.card.payment')}</Text>
          {payment && badge ? (
            <>
              <View style={[styles.badge, { backgroundColor: badge.background }]}>
                <Text style={[styles.badgeText, { color: badge.text }]}>{t(`bk.pay.${payment.state}`)}</Text>
              </View>
              <Text style={[styles.balance, { color: colors.muted }]}>
                {t('bk.card.balance', { amount: formatAmount(payment.balance) })}
              </Text>
            </>
          ) : (
            <Text style={[styles.noInvoice, { color: colors.muted }]}>{noInvoiceLabel}</Text>
          )}
        </View>

        <View style={[stacked ? styles.dividerHorizontal : styles.dividerVertical, { backgroundColor: colors.divider }]} />

        {props.variant === 'form' ? (
          <View style={styles.column} accessible accessibilityLabel={`${t('bk.card.formStatus')}, ${props.formStatus.label}`}>
            <Text style={[styles.columnLabel, { color: colors.muted }]}>{t('bk.card.formStatus')}</Text>
            <View style={[styles.badge, { backgroundColor: FORM_STATUS_BADGE_COLORS[props.formStatus.tone][theme].background }]}>
              <Text style={[styles.badgeText, { color: FORM_STATUS_BADGE_COLORS[props.formStatus.tone][theme].text }]}>
                {props.formStatus.label}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.column}>
            <Text style={[styles.columnLabel, { color: colors.muted }]}>{t('bk.card.jobStatus')}</Text>
            <View style={styles.pillWrap}>
              <JobStatusPill
                status={props.jobStatus}
                onPress={props.onChangeJobStatus}
                isBusy={props.isSavingJobStatus}
                disabled={props.jobStatusDisabled}
              />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    marginTop: 12,
  },
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  totalLabel: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  totalValue: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  columns: {
    flexDirection: 'row',
    gap: 12,
  },
  columnsStacked: {
    flexDirection: 'column',
  },
  column: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  columnLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // The StatusPill shape, with colours for the active theme.
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  balance: {
    fontSize: 12,
    fontWeight: '600',
  },
  noInvoice: {
    fontSize: 13,
    fontWeight: '600',
  },
  pillWrap: {
    alignItems: 'flex-start',
  },
  dividerVertical: {
    alignSelf: 'stretch',
    width: StyleSheet.hairlineWidth,
  },
  dividerHorizontal: {
    height: StyleSheet.hairlineWidth,
  },
});
