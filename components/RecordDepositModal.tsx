import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
import { getThemePalette, useTheme } from '@/context/theme-context';
import { fromCents, getInvoicePayments, parseAmountInput, sumPaymentsInCents, toCents } from '@/lib/invoice-payments';

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
  const palette = getThemePalette(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const invoice = invoices.find((item) => item.id === invoiceId) ?? null;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(paymentMethods[0]);
  const [date, setDate] = useState(todayKey);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
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
    if (!invoice) return;

    const parsed = parseAmountInput(amount);
    if (parsed === null) {
      setError('Enter a deposit amount greater than zero.');
      return;
    }

    if (toCents(parsed) > toCents(maxDeposit)) {
      setError(`Deposit cannot exceed ${currencyFormatter.format(maxDeposit)}.`);
      return;
    }

    if (updateInvoiceDeposit(invoice.id, parsed, { method, date, notes })) {
      onClose();
      return;
    }

    setError('The deposit could not be saved for this invoice.');
  };

  return (
    <PaymentModalShell
      visible={invoice !== null}
      eyebrow="Payment received"
      title="Record deposit"
      description={`Enter the deposit received for this invoice. The remaining customer balance updates automatically.`}
      primaryLabel="Save deposit"
      onPrimary={handleSave}
      onClose={onClose}
      palette={palette}
      isDarkMode={isDarkMode}
      // Reached from the Manage payment sheet, so it slides up from below rather than popping —
      // the hand-off then reads as one continuous movement.
      entrance="sheet">
      <PaymentSummaryRow
        label="Invoice total"
        value={currencyFormatter.format(invoice?.amount ?? 0)}
        palette={palette}
        isDarkMode={isDarkMode}
      />

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>Deposit amount</Text>
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
        label="Remaining after deposit"
        value={currencyFormatter.format(remaining)}
        palette={palette}
      />

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>Payment method</Text>
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
              <Text style={[styles.methodChipText, { color: isActive ? palette.accent : palette.text }]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>Deposit date</Text>
      <DatePickerField value={date} onChange={setDate} isDarkMode={isDarkMode} palette={palette} />

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>Notes (optional)</Text>
      <TextInput
        multiline
        onChangeText={setNotes}
        placeholder="Bank reference, remarks"
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
