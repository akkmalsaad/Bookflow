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
import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { fromCents, getInvoicePaymentSummary, parseAmountInput, toCents } from '@/lib/invoice-payments';

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
  const palette = getThemePalette(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const invoice = invoices.find((item) => item.id === invoiceId) ?? null;
  const customer = customers.find((item) => item.id === invoice?.customerId) ?? null;
  const summary = invoice ? getInvoicePaymentSummary(invoice, payments) : null;

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(paymentMethods[0]);
  const [date, setDate] = useState(todayKey);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!invoice) return;

    setAmount('');
    setMethod(paymentMethods[0]);
    setDate(todayKey());
    setNotes('');
    setError('');
    setIsSaving(false);
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

  const handleSave = () => {
    if (!invoice || isSaving) return;

    const parsed = parseAmountInput(amount);
    if (parsed === null) {
      setError('Enter a payment amount greater than zero.');
      return;
    }

    if (toCents(parsed) > outstandingCents) {
      setError(`The payment cannot exceed the ${currencyFormatter.format(summary?.outstanding ?? 0)} outstanding.`);
      return;
    }

    setIsSaving(true);
    const result = recordInvoicePayment({
      invoiceId: invoice.id,
      amount: parsed,
      method,
      date,
      notes,
    });
    setIsSaving(false);

    if (!result.ok) {
      setError(result.error ?? 'The payment could not be recorded.');
      return;
    }

    onSaved?.(parsed);
    onClose();
  };

  return (
    <PaymentModalShell
      visible={invoice !== null}
      eyebrow="Payment received"
      title="Update payment"
      description="Record a payment received for this invoice. The remaining balance updates automatically."
      primaryLabel={isSaving ? 'Saving…' : 'Save payment'}
      primaryDisabled={isSaving}
      onPrimary={handleSave}
      onClose={onClose}
      palette={palette}
      isDarkMode={isDarkMode}>
      {customer ? (
        <Text style={[styles.reference, { color: palette.muter }]} numberOfLines={1}>
          {customer.name}
        </Text>
      ) : null}

      <PaymentSummaryRow
        label="Invoice total"
        value={currencyFormatter.format(summary?.totalAmount ?? 0)}
        palette={palette}
        isDarkMode={isDarkMode}
      />
      <PaymentSummaryRow
        label="Amount paid"
        value={currencyFormatter.format(summary?.amountPaid ?? 0)}
        palette={palette}
        isDarkMode={isDarkMode}
        valueColor={palette.success}
      />
      <PaymentSummaryRow
        label="Outstanding"
        value={currencyFormatter.format(summary?.outstanding ?? 0)}
        palette={palette}
        isDarkMode={isDarkMode}
        valueColor={(summary?.outstanding ?? 0) > 0 ? palette.warning : palette.success}
      />

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>Payment amount</Text>
      <CurrencyAmountInput
        autoFocus
        currency={currency}
        hasError={Boolean(error)}
        isDarkMode={isDarkMode}
        onChangeText={handleAmountChange}
        palette={palette}
        value={amount}
      />
      {error ? <Text style={[paymentModalStyles.error, { color: palette.danger }]}>{error}</Text> : null}

      <PaymentBalanceRow
        label="Remaining after payment"
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

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>Payment date</Text>
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
