import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DatePickerField } from '@/components/DatePickerField';
import {
  CurrencyAmountInput,
  PaymentBalanceRow,
  PaymentModalShell,
  PaymentSummaryRow,
  paymentModalStyles,
} from '@/components/PaymentModalShell';
// The same four methods the payment modal offers, so a deposit and a payment are described in the
// same vocabulary wherever they are later reported.
import { paymentMethods } from '@/components/UpdatePaymentModal';
import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { SuccessFeedback } from '@/components/feedback/SuccessFeedback';
import { getThemePalette, useTheme } from '@/context/theme-context';
import type { TranslationKey } from '@/lib/i18n';
import { useTranslation } from '@/lib/use-translation';
import { fromCents, getInvoicePayments, parseAmountInput, sumPaymentsInCents, toCents } from '@/lib/invoice-payments';
import { captureEvent } from '@/lib/analytics';

type Props = {
  invoiceId: string | null;
  onClose: () => void;
};

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Records the booking deposit for an invoice. The deposit is set outright, not appended.
 *
 * Collects the same method / date / notes a payment does. `updateInvoiceDeposit` already accepted
 * those details and simply defaulted them — so a deposit now carries the same record as any other
 * payment, and reaches the exported reports with a real method and date instead of "Deposit" on
 * today's date.
 */
export function RecordDepositModal({ invoiceId, onClose }: Props) {
  const { isDarkMode } = useTheme();
  const { invoices, payments, currency, updateInvoiceDeposit } = useAppData();
  const { t } = useTranslation();
  const palette = getThemePalette(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const invoice = invoices.find((item) => item.id === invoiceId) ?? null;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(paymentMethods[0]);
  const [date, setDate] = useState(todayKey);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successActive = useRef(false);
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const accentSoft = isDarkMode ? '#29284B' : '#E9E8FF';

  const invoicePayments = invoice ? getInvoicePayments(invoice.id, payments) : [];
  const depositCents = sumPaymentsInCents(invoicePayments.filter((payment) => payment.kind === 'deposit'));
  const otherCents = sumPaymentsInCents(invoicePayments.filter((payment) => payment.kind !== 'deposit'));
  const maxDeposit = invoice ? fromCents(Math.max(0, toCents(invoice.amount) - otherCents)) : 0;

  useEffect(() => {
    if (!invoice) return;

    const existingDeposit = invoicePayments.find((payment) => payment.kind === 'deposit');
    setAmount(depositCents > 0 ? String(fromCents(depositCents)) : '');
    setMethod(
      existingDeposit && paymentMethods.includes(existingDeposit.method)
        ? existingDeposit.method
        : paymentMethods[0],
    );
    setDate(existingDeposit?.date || todayKey());
    setNotes(existingDeposit?.notes ?? '');
    setError('');
    // Re-seed only when a different invoice opens the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id]);

  const typedAmount = parseAmountInput(amount) ?? 0;
  const remaining = invoice ? fromCents(Math.max(0, toCents(invoice.amount) - otherCents - toCents(typedAmount))) : 0;

  const handleSave = () => {
    if (!invoice || successActive.current) return;

    const parsed = parseAmountInput(amount);
    if (parsed === null) {
      setError(t('deposit.error.amount'));
      return;
    }

    if (toCents(parsed) > toCents(maxDeposit)) {
      setError(t('deposit.error.exceeds', { amount: currencyFormatter.format(maxDeposit) }));
      return;
    }

    if (updateInvoiceDeposit(invoice.id, parsed, { method, date, notes })) {
      captureEvent('deposit_recorded', { method });
      successActive.current = true;
      setSuccessMessage(t('deposit.saved'));
      Keyboard.dismiss();
      onClose();
      return;
    }

    setError(t('deposit.error.failed'));
  };

  return (
    <PaymentModalShell
      visible={invoice !== null || successMessage !== null}
      primaryDisabled={successMessage !== null}
      closeDisabled={successMessage !== null}
      formDisabled={successMessage !== null}
      feedbackActive={successMessage !== null}
      feedback={(
        <SuccessFeedback
          visible={successMessage !== null}
          title={successMessage ?? ''}
          onComplete={() => {
            successActive.current = false;
            setSuccessMessage(null);
          }}
        />
      )}
      eyebrow={t('payment.eyebrow')}
      title={t('deposit.title')}
      description={t('deposit.description')}
      primaryLabel={t('deposit.save')}
      onPrimary={handleSave}
      onClose={onClose}
      palette={palette}
      isDarkMode={isDarkMode}
      // Reached from the Manage payment sheet, so it slides up from below rather than popping —
      // the hand-off then reads as one continuous movement.
      entrance="sheet">
      <PaymentSummaryRow
        label={t('payment.invoiceTotal')}
        value={currencyFormatter.format(invoice?.amount ?? 0)}
        palette={palette}
        isDarkMode={isDarkMode}
      />

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>{t('deposit.amount')}</Text>
      <CurrencyAmountInput
        hideReturnKey
        currency={currency}
        hasError={Boolean(error)}
        isDarkMode={isDarkMode}
        onChangeText={(value) => {
          setAmount(value);
          setError('');
        }}
        palette={palette}
        value={amount}
      />
      {error ? <Text style={[paymentModalStyles.error, { color: palette.danger }]}>{error}</Text> : null}

      <PaymentBalanceRow
        label={t('deposit.remainingAfter')}
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

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>{t('deposit.date')}</Text>
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
