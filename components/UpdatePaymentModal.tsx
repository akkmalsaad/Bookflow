import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SuccessFeedback } from '@/components/feedback/SuccessFeedback';
import { useConfirmedSave } from '@/components/feedback/useConfirmedSave';
import { DatePickerField } from '@/components/DatePickerField';
import {
  CurrencyAmountInput,
  PaymentBalanceRow,
  PaymentModalShell,
  PaymentSummaryRow,
  paymentModalStyles,
} from '@/components/PaymentModalShell';
import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import type { TranslationKey } from '@/lib/i18n';
import { useTranslation } from '@/lib/use-translation';
import { getInvoiceClientName } from '@/lib/invoice-customer';
import { fromCents, getInvoicePaymentSummary, parseAmountInput, toCents } from '@/lib/invoice-payments';
import { captureEvent } from '@/lib/analytics';

export const paymentMethods = ['Cash', 'Bank transfer', 'Card', 'E-wallet'];

type Props = {
  invoiceId: string | null;
  onClose: () => void;
  onSaved?: (amount: number) => void;
};

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Records one payment against an invoice, on top of any deposit or earlier payments. */
export function UpdatePaymentModal({ invoiceId, onClose, onSaved }: Props) {
  const { isDarkMode } = useTheme();
  const { invoices, payments, customers, currency, recordInvoicePayment } = useAppData();
  const { t } = useTranslation();
  const palette = getThemePalette(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const invoice = invoices.find((item) => item.id === invoiceId) ?? null;
  // Named from the invoice's own snapshot once the client record is gone, so recording a payment
  // against a deleted client's invoice still shows who it was raised for.
  const clientName = invoice
    ? getInvoiceClientName(invoice, customers.find((item) => item.id === invoice.customerId), t('invoice.deletedClient'))
    : '';
  const summary = invoice ? getInvoicePaymentSummary(invoice, payments) : null;

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(paymentMethods[0]);
  const [date, setDate] = useState(todayKey);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const feedback = useConfirmedSave(invoiceId !== null);
  const savedAmount = useRef(0);
  const paymentActionIdRef = useRef('');

  useEffect(() => {
    if (!invoice) return;

    setAmount('');
    setMethod(paymentMethods[0]);
    setDate(todayKey());
    setNotes('');
    setError('');
    paymentActionIdRef.current = `payment-action-${invoice.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // Re-seed only when a different invoice opens the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id]);

  const outstandingCents = toCents(summary?.outstanding ?? 0);
  const typedCents = toCents(parseAmountInput(amount) ?? 0);
  const remaining = fromCents(Math.max(0, outstandingCents - typedCents));

  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const accentSoft = isDarkMode ? '#29284B' : '#E9E8FF';

  const handleAmountChange = (value: string) => {
    setAmount(value);

    const parsed = parseAmountInput(value);
    setError(
      parsed !== null && toCents(parsed) > outstandingCents
        ? `The payment cannot exceed the ${currencyFormatter.format(summary?.outstanding ?? 0)} outstanding.`
        : '',
    );
  };

  const handleSave = () => feedback.run(() => {
    if (!invoice) return false;

    const parsed = parseAmountInput(amount);
    if (parsed === null) {
      setError(t('payment.error.amount'));
      return false;
    }

    if (toCents(parsed) > outstandingCents) {
      setError(t('payment.error.exceeds', { amount: currencyFormatter.format(summary?.outstanding ?? 0) }));
      return false;
    }

    const result = recordInvoicePayment({
      invoiceId: invoice.id,
      amount: parsed,
      method,
      date,
      notes,
      sourceId: paymentActionIdRef.current,
    });

    if (!result.ok) {
      setError(result.error ?? t('payment.error.failed'));
      return false;
    }

    captureEvent('payment_recorded', { method });
    savedAmount.current = parsed;
    return true;
  });

  return (
    <PaymentModalShell
      visible={invoice !== null}
      eyebrow={t('payment.eyebrow')}
      title={t('payment.update.title')}
      description={t('payment.update.description')}
      primaryLabel={feedback.saving ? t('payment.saving') : feedback.pending ? t('payment.retry') : t('payment.save')}
      primaryDisabled={feedback.saving || feedback.success}
      closeDisabled={feedback.saving || feedback.success}
      formDisabled={feedback.pending}
      saveError={feedback.error}
      feedbackActive={feedback.success}
      feedback={<SuccessFeedback visible={feedback.success} title={t('payment.recorded.title')} message={t('payment.recorded.body')} onComplete={() => { onSaved?.(savedAmount.current); onClose(); }} />}
      onPrimary={handleSave}
      onClose={onClose}
      palette={palette}
      isDarkMode={isDarkMode}
      // Reached from the Manage payment sheet, so it slides up from below rather than popping —
      // the hand-off then reads as one continuous movement.
      entrance="sheet">
      {clientName ? (
        <Text style={[styles.reference, { color: palette.muter }]} numberOfLines={1}>
          {clientName}
        </Text>
      ) : null}

      <PaymentSummaryRow
        label={t('payment.invoiceTotal')}
        value={currencyFormatter.format(summary?.totalAmount ?? 0)}
        palette={palette}
        isDarkMode={isDarkMode}
      />
      <PaymentSummaryRow
        label={t('payment.amountPaid')}
        value={currencyFormatter.format(summary?.amountPaid ?? 0)}
        palette={palette}
        isDarkMode={isDarkMode}
        valueColor={palette.success}
      />
      <PaymentSummaryRow
        label={t('payment.outstanding')}
        value={currencyFormatter.format(summary?.outstanding ?? 0)}
        palette={palette}
        isDarkMode={isDarkMode}
        valueColor={(summary?.outstanding ?? 0) > 0 ? palette.warning : palette.success}
      />

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>{t('payment.amount')}</Text>
      <CurrencyAmountInput
        currency={currency}
        hasError={Boolean(error)}
        // No return key: the decimal pad has none, so asking for one only makes iOS float its own
        // "Done" over the checkmark that already dismisses the keyboard. Matches the deposit and
        // transaction modals, which both do this.
        hideReturnKey
        isDarkMode={isDarkMode}
        onChangeText={handleAmountChange}
        palette={palette}
        value={amount}
      />
      {error ? <Text accessibilityRole="alert" style={[paymentModalStyles.error, { color: palette.danger }]}>{error}</Text> : null}

      <PaymentBalanceRow
        label={t('payment.remainingAfter')}
        value={currencyFormatter.format(remaining)}
        palette={palette}
      />

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>{t('payment.method')}</Text>
      <View style={styles.methodRow}>
        {paymentMethods.map((option) => {
          const isActive = option === method;

          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              onPress={() => setMethod(option)}
              style={({ pressed }) => [
                styles.methodChip,
                { backgroundColor: softInset, borderColor: softBorder },
                isActive && { backgroundColor: accentSoft, borderColor: palette.accent },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.methodChipText, { color: isActive ? palette.accent : palette.text }]}>{t(`payment.method.${option}` as TranslationKey)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>{t('payment.date')}</Text>
      <DatePickerField value={date} onChange={setDate} isDarkMode={isDarkMode} palette={palette} />

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>{t('deposit.notes')}</Text>
      <TextInput
        multiline
        onChangeText={setNotes}
        placeholder={t('deposit.notes.placeholder')}
        placeholderTextColor={palette.muter}
        style={[styles.notesInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
        value={notes}
      />
    </PaymentModalShell>
  );
}

const styles = StyleSheet.create({
  reference: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodChip: {
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  methodChipText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  notesInput: {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '600',
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  pressed: {
    opacity: 0.78,
  },
});
