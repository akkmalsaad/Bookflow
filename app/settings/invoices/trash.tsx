import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { InvoiceActionSheet } from '@/components/invoice/InvoiceActionSheet';
import { InvoicePermanentDeleteConfirmation } from '@/components/invoice/InvoicePermanentDeleteConfirmation';
import { InvoiceTrashCard } from '@/components/invoice/InvoiceTrashCard';
import { SettingsDetailScreen } from '@/components/settings/SettingsDetailScreen';
import { getSoftTokens } from '@/components/settings/tokens';
import { getCurrencyFormatter, type Invoice, useAppData } from '@/context/app-data-context';
import { useSnackbar } from '@/context/snackbar-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { DUSTBIN_RETENTION_DAYS, hasInvoiceFinancialHistory } from '@/lib/invoice-lifecycle';
import { getInvoiceNumber } from '@/lib/invoice-numbering';

type PendingAction =
  | { kind: 'restore'; invoiceId: string }
  | { kind: 'purge'; invoiceId: string };

export default function InvoiceTrashScreen() {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const { trashedInvoices, customers, allPayments, currency, restoreInvoice, deleteInvoicePermanently } = useAppData();
  const { showSnackbar } = useSnackbar();
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);

  const [menuInvoiceId, setMenuInvoiceId] = useState<string | null>(null);
  // Two RN modals must never be on screen at once, so the confirmation waits for the menu's exit.
  const [queuedPurgeId, setQueuedPurgeId] = useState<string | null>(null);
  const [purgeInvoiceId, setPurgeInvoiceId] = useState<string | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  // One in-flight mutation at a time: a second tap on Restore or Delete cannot start a duplicate.
  const [pending, setPending] = useState<PendingAction | null>(null);

  // Both sheets keep rendering their invoice while they slide away, so neither empties out at the
  // moment it is closed — or, for a permanent delete, at the moment the invoice ceases to exist.
  const lastMenuInvoice = useRef<Invoice | null>(null);
  const lastPurgeInvoice = useRef<Invoice | null>(null);
  const activeMenuInvoice = trashedInvoices.find((invoice) => invoice.id === menuInvoiceId) ?? null;
  const activePurgeInvoice = trashedInvoices.find((invoice) => invoice.id === purgeInvoiceId) ?? null;
  if (activeMenuInvoice) lastMenuInvoice.current = activeMenuInvoice;
  if (activePurgeInvoice) lastPurgeInvoice.current = activePurgeInvoice;
  const menuInvoice = activeMenuInvoice ?? lastMenuInvoice.current;
  const purgeInvoice = activePurgeInvoice ?? lastPurgeInvoice.current;
  const getClientName = (customerId: string) => customerMap.get(customerId)?.name ?? 'Unknown client';

  const handleRestore = async (invoiceId: string) => {
    if (pending) return;

    setPending({ kind: 'restore', invoiceId });
    const result = await restoreInvoice(invoiceId);
    setPending(null);

    if (!result.ok) {
      showSnackbar({ message: result.error ?? 'The invoice could not be restored.', tone: 'danger' });
      return;
    }
    showSnackbar({ message: result.error ?? 'Invoice restored', tone: result.error ? 'danger' : 'success' });
  };

  const handlePermanentDelete = async () => {
    if (!purgeInvoice || pending) return;

    const invoiceNumber = getInvoiceNumber(purgeInvoice);
    setPurgeError(null);
    setPending({ kind: 'purge', invoiceId: purgeInvoice.id });
    const result = await deleteInvoicePermanently(purgeInvoice.id);
    setPending(null);

    if (!result.ok) {
      setPurgeError(result.error ?? 'The invoice could not be deleted.');
      return;
    }

    setPurgeInvoiceId(null);
    showSnackbar({ message: `${invoiceNumber} permanently deleted`, tone: 'default' });
  };

  return (
    <SettingsDetailScreen
      title="Dustbin"
      description={`Deleted invoices stay here for ${DUSTBIN_RETENTION_DAYS} days, then BookFlow removes them permanently. Restore one any time before that.`}>
      {trashedInvoices.length > 0 ? (
        trashedInvoices.map((invoice) => (
          <InvoiceTrashCard
            key={invoice.id}
            invoice={invoice}
            clientName={getClientName(invoice.customerId)}
            amount={currencyFormatter.format(invoice.amount)}
            isRestoring={pending?.kind === 'restore' && pending.invoiceId === invoice.id}
            isBusy={pending !== null}
            onRestore={() => handleRestore(invoice.id)}
            onOpenMenu={() => setMenuInvoiceId(invoice.id)}
          />
        ))
      ) : (
        <View style={[styles.empty, { backgroundColor: soft.surface, borderColor: soft.border }]}>
          <View style={[styles.emptyIcon, { backgroundColor: soft.inset }]}>
            <Ionicons name="trash-outline" size={26} color={palette.muter} />
          </View>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>The Dustbin is empty</Text>
          <Text style={[styles.emptyBody, { color: palette.muter }]}>Deleted invoices will appear here.</Text>
        </View>
      )}

      <InvoiceActionSheet
        visible={activeMenuInvoice !== null}
        onClose={() => setMenuInvoiceId(null)}
        onClosed={() => {
          if (!queuedPurgeId) return;
          setPurgeInvoiceId(queuedPurgeId);
          setQueuedPurgeId(null);
        }}
        title={menuInvoice ? getInvoiceNumber(menuInvoice) : ''}
        subtitle={menuInvoice ? getClientName(menuInvoice.customerId) : undefined}
        items={
          menuInvoice
            ? [
                {
                  key: 'restore',
                  icon: 'arrow-undo-outline',
                  label: 'Restore invoice',
                  accessibilityHint: 'Returns this invoice to your active invoices',
                  onPress: () => {
                    const invoiceId = menuInvoice.id;
                    setMenuInvoiceId(null);
                    handleRestore(invoiceId);
                  },
                },
                {
                  key: 'purge',
                  icon: 'trash-outline',
                  label: 'Delete permanently',
                  destructive: true,
                  separatedAbove: true,
                  accessibilityHint: 'This cannot be undone',
                  onPress: () => {
                    setPurgeError(null);
                    setQueuedPurgeId(menuInvoice.id);
                    setMenuInvoiceId(null);
                  },
                },
              ]
            : []
        }
      />

      <InvoicePermanentDeleteConfirmation
        visible={activePurgeInvoice !== null}
        invoiceNumber={purgeInvoice ? getInvoiceNumber(purgeInvoice) : ''}
        clientName={purgeInvoice ? getClientName(purgeInvoice.customerId) : ''}
        amount={purgeInvoice ? currencyFormatter.format(purgeInvoice.amount) : ''}
        hasPaymentHistory={purgeInvoice ? hasInvoiceFinancialHistory(purgeInvoice, allPayments) : false}
        isBusy={pending?.kind === 'purge'}
        error={purgeError}
        onConfirm={handlePermanentDelete}
        onClose={() => {
          setPurgeInvoiceId(null);
          setPurgeError(null);
        }}
      />
    </SettingsDetailScreen>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 38,
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: 20,
    height: 58,
    justifyContent: 'center',
    marginBottom: 16,
    width: 58,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  emptyBody: {
    fontSize: 13.5,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
  },
});
