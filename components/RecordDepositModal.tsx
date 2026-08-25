import { useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native';

import {
  CurrencyAmountInput,
  PaymentBalanceRow,
  PaymentModalShell,
  PaymentSummaryRow,
  paymentModalStyles,
} from '@/components/PaymentModalShell';
import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { fromCents, getInvoicePayments, parseAmountInput, sumPaymentsInCents, toCents } from '@/lib/invoice-payments';

type Props = {
  invoiceId: string | null;
  onClose: () => void;
};

/** Records the booking deposit for an invoice. The deposit is set outright, not appended. */
export function RecordDepositModal({ invoiceId, onClose }: Props) {
  const { isDarkMode } = useTheme();
  const { invoices, payments, currency, updateInvoiceDeposit } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const invoice = invoices.find((item) => item.id === invoiceId) ?? null;
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const invoicePayments = invoice ? getInvoicePayments(invoice.id, payments) : [];
  const depositCents = sumPaymentsInCents(invoicePayments.filter((payment) => payment.kind === 'deposit'));
  const otherCents = sumPaymentsInCents(invoicePayments.filter((payment) => payment.kind !== 'deposit'));
  const maxDeposit = invoice ? fromCents(Math.max(0, toCents(invoice.amount) - otherCents)) : 0;

  useEffect(() => {
    if (!invoice) return;

    setAmount(depositCents > 0 ? String(fromCents(depositCents)) : '');
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

    if (updateInvoiceDeposit(invoice.id, parsed)) {
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
      isDarkMode={isDarkMode}>
      <PaymentSummaryRow
        label="Invoice total"
        value={currencyFormatter.format(invoice?.amount ?? 0)}
        palette={palette}
        isDarkMode={isDarkMode}
      />

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>Deposit amount</Text>
      <CurrencyAmountInput
        autoFocus
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
    </PaymentModalShell>
  );
}
