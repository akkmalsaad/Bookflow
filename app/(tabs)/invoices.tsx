import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Animated, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecordDepositModal } from '@/components/RecordDepositModal';
import { KeyboardDoneButton } from '@/components/KeyboardDoneButton';
import { modalScrollProps } from '@/components/modal-keyboard';
import { UpdatePaymentModal } from '@/components/UpdatePaymentModal';
import { InvoiceActionSheet } from '@/components/invoice/InvoiceActionSheet';
import { InvoiceListCard } from '@/components/invoices/InvoiceListCard';
import { ManagePaymentSheet } from '@/components/invoices/ManagePaymentSheet';
import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { useSnackbar } from '@/context/snackbar-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { isInvoiceClosed } from '@/lib/invoice-lifecycle';
import { getInvoicePaymentSummary } from '@/lib/invoice-payments';
import { shareInvoiceOnWhatsApp } from '@/lib/invoice-sharing';

export default function InvoicesScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { customers, invoices, trashedInvoices, packages, payments, addCustomer, addInvoice, createInvoiceShareLink, refreshInvoiceStatuses, invoiceDraft, setInvoiceDraft, updateInvoiceStatus, currency } = useAppData();
  const { showSnackbar } = useSnackbar();
  const palette = getThemePalette(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const [showComposer, setShowComposer] = useState(Boolean(invoiceDraft));
  const [customerMode, setCustomerMode] = useState<'existing' | 'manual'>(invoiceDraft ? 'existing' : 'existing');
  const [selectedCustomerId, setSelectedCustomerId] = useState(invoiceDraft?.customerId ?? customers[0]?.id ?? '');
  const [customerQuery, setCustomerQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState(() => {
    return packages.find((item) => item.price === (invoiceDraft?.amount ?? item.price))?.id ?? packages[0]?.id ?? '';
  });
  const [usePackagePrice, setUsePackagePrice] = useState(Boolean(packages.length));
  const [draftAmount, setDraftAmount] = useState(invoiceDraft ? String(invoiceDraft.amount) : packages[0] ? String(packages[0].price) : '');
  const [draftDueDate, setDraftDueDate] = useState(invoiceDraft?.dueDate ?? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [depositInvoiceId, setDepositInvoiceId] = useState<string | null>(null);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [sharingInvoiceId, setSharingInvoiceId] = useState<string | null>(null);
  // The invoice whose money sheet is open, and the header's utility menu.
  const [managePaymentId, setManagePaymentId] = useState<string | null>(null);
  const [showUtilityMenu, setShowUtilityMenu] = useState(false);
  const [openDustbinAfterMenu, setOpenDustbinAfterMenu] = useState(false);
  // Held while the payment sheet slides away, then opened — see the sheet's onClosed hand-off.
  const [pendingPaymentAction, setPendingPaymentAction] = useState<{ kind: 'deposit' | 'payment'; invoiceId: string } | null>(null);
  const dropdownAnim = useRef(new Animated.Value(0)).current;
  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';
  const accentSoft = isDarkMode ? '#29284B' : '#E9E8FF';

  // Held so the sheet keeps rendering its invoice while it slides away.
  const lastManagedInvoice = useRef<{ invoice: (typeof invoices)[number]; summary: ReturnType<typeof getInvoicePaymentSummary> } | null>(null);
  const activeManagedInvoice = invoices.find((item) => item.id === managePaymentId) ?? null;
  if (activeManagedInvoice) {
    lastManagedInvoice.current = {
      invoice: activeManagedInvoice,
      summary: getInvoicePaymentSummary(activeManagedInvoice, payments),
    };
  }
  const managePaymentInvoice = activeManagedInvoice ?? lastManagedInvoice.current?.invoice ?? null;
  const managePaymentSummary = activeManagedInvoice
    ? getInvoicePaymentSummary(activeManagedInvoice, payments)
    : lastManagedInvoice.current?.summary ?? null;

  const selectedPackage = packages.find((item) => item.id === selectedPackageId) ?? null;
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const filteredCustomers = customers.filter((customer) => {
    const searchTerm = customerQuery.trim().toLowerCase();
    if (!searchTerm) {
      return true;
    }
    return customer.name.toLowerCase().includes(searchTerm) || customer.email.toLowerCase().includes(searchTerm);
  }).slice(0, 8);

  useEffect(() => {
    Animated.timing(dropdownAnim, {
      toValue: showCustomerDropdown ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [dropdownAnim, showCustomerDropdown]);

  // A draft can also arrive while this tab is already mounted (e.g. from a customer profile).
  useEffect(() => {
    if (!invoiceDraft) return;

    const draftPackage = packages.find((item) => item.name === invoiceDraft.serviceName);

    setCustomerMode('existing');
    setSelectedCustomerId(invoiceDraft.customerId);
    setDraftDueDate(invoiceDraft.dueDate);
    setDraftAmount(String(invoiceDraft.amount));
    setUsePackagePrice(false);
    if (draftPackage) {
      setSelectedPackageId(draftPackage.id);
    }
    setShowComposer(true);
  }, [invoiceDraft, packages]);

  useFocusEffect(
    useCallback(() => {
      refreshInvoiceStatuses().catch(() => {});
      const refreshInterval = setInterval(() => {
        refreshInvoiceStatuses().catch(() => {});
      }, 15_000);

      return () => clearInterval(refreshInterval);
    }, [refreshInvoiceStatuses]),
  );

  const handlePackageSelection = (packageId: string) => {
    const chosenPackage = packages.find((item) => item.id === packageId);
    setSelectedPackageId(packageId);
    setUsePackagePrice(true);
    setDraftAmount(String(chosenPackage?.price ?? 0));
  };

  const handleShareInvoice = async (invoice: (typeof invoices)[number]) => {
    setSharingInvoiceId(invoice.id);
    try {
      await shareInvoiceOnWhatsApp({
        invoice,
        customer: customerMap.get(invoice.customerId),
        currencyFormatter,
        createShareLink: createInvoiceShareLink,
      });
    } finally {
      setSharingInvoiceId(null);
    }
  };

  const handleCreateInvoice = () => {
    const resolvedAmount = usePackagePrice && selectedPackage ? Number(selectedPackage.price) : Number(draftAmount);
    const amount = resolvedAmount;
    let resolvedCustomerId = selectedCustomerId;

    if (customerMode === 'manual') {
      const trimmedName = manualName.trim();
      const trimmedEmail = manualEmail.trim();

      if (!trimmedName || !trimmedEmail || Number.isNaN(amount) || amount <= 0) {
        return;
      }

      const createdCustomer = {
        name: trimmedName,
        email: trimmedEmail,
        phone: manualPhone.trim(),
        location: 'New customer',
        notes: 'Created from invoice form',
      };

      const savedCustomer = addCustomer(createdCustomer);
      resolvedCustomerId = savedCustomer?.id ?? '';
    }

    if (!resolvedCustomerId || Number.isNaN(amount) || amount <= 0) {
      return;
    }

    addInvoice({
      bookingId: invoiceDraft?.bookingId ?? `booking-${Date.now()}`,
      customerId: resolvedCustomerId,
      amount,
      dueDate: draftDueDate,
      status: 'Draft',
      sentAt: new Date().toISOString().slice(0, 10),
      serviceName: selectedPackage?.name ?? invoiceDraft?.serviceName,
      packageDetails: selectedPackage?.details,
      terms: selectedPackage?.info ?? invoiceDraft?.terms,
    });

    const invoiceClient = customers.find((item) => item.id === resolvedCustomerId);
    showSnackbar({
      message: invoiceClient
        ? `Invoice for ${invoiceClient.name} created`
        : 'Invoice created',
      tone: 'success',
    });

    setDraftAmount(packages[0] ? String(packages[0].price) : '');
    setDraftDueDate(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    setSelectedPackageId(packages[0]?.id ?? '');
    setUsePackagePrice(Boolean(packages.length));
    setSelectedCustomerId(customers[0]?.id ?? '');
    setManualName('');
    setManualEmail('');
    setManualPhone('');
    setCustomerMode('existing');
    setInvoiceDraft(null);
    setShowComposer(false);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleGroup}>
          <View style={[styles.headerIcon, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <Ionicons name="receipt-outline" size={23} color={palette.accent} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>Invoices</Text>
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>Client billing</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More invoice actions"
            accessibilityHint={
              trashedInvoices.length
                ? `Dustbin, ${trashedInvoices.length} deleted ${trashedInvoices.length === 1 ? 'invoice' : 'invoices'}`
                : 'The Dustbin is empty'
            }
            hitSlop={8}
            onPress={() => setShowUtilityMenu(true)}
            style={({ pressed }) => [styles.utilityButton, pressed && styles.headerActionPressed]}>
            <Ionicons name="ellipsis-horizontal" size={22} color={palette.muter} />
            {trashedInvoices.length ? (
              <View style={[styles.trashBadge, { backgroundColor: palette.accent, borderColor: palette.background }]} />
            ) : null}
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: palette.accent, shadowColor: palette.accent },
              pressed && styles.headerActionPressed,
            ]}
            onPress={() => {
              setInvoiceDraft(null);
              setSelectedPackageId(packages[0]?.id ?? '');
              setUsePackagePrice(Boolean(packages.length));
              setDraftAmount(packages[0] ? String(packages[0].price) : '');
              setShowComposer(true);
            }}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>New</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={invoices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const customer = customerMap.get(item.customerId);
          const summary = getInvoicePaymentSummary(item, payments);

          return (
            <InvoiceListCard
              invoice={item}
              clientName={customer?.name ?? 'Unknown customer'}
              summary={summary}
              currencyFormatter={currencyFormatter}
              // Same condition the old action rows used, so nothing gains or loses an action.
              showActions={item.status !== 'Paid' && !isInvoiceClosed(item)}
              isSending={sharingInvoiceId === item.id}
              onOpen={() => router.push({ pathname: '/invoice/[invoiceId]', params: { invoiceId: item.id } })}
              onSend={() => handleShareInvoice(item)}
              onManagePayment={() => setManagePaymentId(item.id)}
            />
          );
        }}
      />

      <RecordDepositModal invoiceId={depositInvoiceId} onClose={() => setDepositInvoiceId(null)} />

      <UpdatePaymentModal invoiceId={paymentInvoiceId} onClose={() => setPaymentInvoiceId(null)} />

      {/* Every row here calls a handler this screen already had — only the labels changed. */}
      <ManagePaymentSheet
        visible={activeManagedInvoice !== null}
        onClosed={() => {
          if (!pendingPaymentAction) return;
          const { kind, invoiceId } = pendingPaymentAction;
          setPendingPaymentAction(null);
          if (kind === 'deposit') setDepositInvoiceId(invoiceId);
          else setPaymentInvoiceId(invoiceId);
        }}
        invoice={managePaymentInvoice}
        clientName={managePaymentInvoice ? customerMap.get(managePaymentInvoice.customerId)?.name ?? 'Unknown customer' : ''}
        summary={managePaymentSummary}
        currencyFormatter={currencyFormatter}
        onClose={() => setManagePaymentId(null)}
        // The deposit and payment editors are their own modals, so the sheet steps aside first —
        // two native modals must never be on screen at once.
        onUpdateDeposit={() => {
          const invoiceId = managePaymentId;
          setManagePaymentId(null);
          setPendingPaymentAction({ kind: 'deposit', invoiceId: invoiceId ?? '' });
        }}
        onRecordPayment={() => {
          const invoiceId = managePaymentId;
          setManagePaymentId(null);
          setPendingPaymentAction({ kind: 'payment', invoiceId: invoiceId ?? '' });
        }}
        onMarkAsAccepted={() => {
          if (managePaymentId) updateInvoiceStatus(managePaymentId, 'Accepted');
          setManagePaymentId(null);
        }}
        onMarkAsPaid={() => {
          if (managePaymentId) updateInvoiceStatus(managePaymentId, 'Paid');
          setManagePaymentId(null);
        }}
      />

      <InvoiceActionSheet
        visible={showUtilityMenu}
        onClose={() => setShowUtilityMenu(false)}
        onClosed={() => {
          if (!openDustbinAfterMenu) return;
          setOpenDustbinAfterMenu(false);
          router.push('/settings/invoices/trash');
        }}
        title="Invoices"
        subtitle={
          trashedInvoices.length
            ? `${trashedInvoices.length} deleted ${trashedInvoices.length === 1 ? 'invoice' : 'invoices'} in the Dustbin`
            : 'The Dustbin is empty'
        }
        items={[
          {
            key: 'dustbin',
            icon: 'trash-outline',
            label: 'Deleted invoices',
            accessibilityHint: 'Opens the Dustbin, where deleted invoices can be restored',
            onPress: () => {
              setOpenDustbinAfterMenu(true);
              setShowUtilityMenu(false);
            },
          },
        ]}
      />

      <Modal visible={showComposer} transparent animationType="slide" onRequestClose={() => setShowComposer(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <View style={[styles.modalHandle, { backgroundColor: palette.border }]} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalEyebrow, { color: palette.accent }]}>Create</Text>
                <Text style={[styles.modalTitle, { color: palette.text }]}>New invoice</Text>
              </View>
              <Pressable
                style={[styles.closeButton, { backgroundColor: softInset }]}
                onPress={() => {
                  setInvoiceDraft(null);
                  setSelectedPackageId(packages[0]?.id ?? '');
                  setUsePackagePrice(Boolean(packages.length));
                  setDraftAmount(packages[0] ? String(packages[0].price) : '');
                  setShowComposer(false);
                }}>
                <Ionicons name="close" size={24} color={palette.text} />
              </Pressable>
            </View>

            <ScrollView {...modalScrollProps} contentContainerStyle={styles.modalScrollContent}>
            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer source</Text>
            <View style={styles.modeRow}>
              <Pressable
                onPress={() => setCustomerMode('existing')}
                style={[
                  styles.modeButton,
                  { backgroundColor: softInset, borderColor: softBorder },
                  customerMode === 'existing' && { backgroundColor: accentSoft, borderColor: palette.accent },
                ]}>
                <Text style={[styles.modeButtonText, { color: customerMode === 'existing' ? palette.accent : palette.text }]}>Existing customer</Text>
              </Pressable>
              <Pressable
                onPress={() => setCustomerMode('manual')}
                style={[
                  styles.modeButton,
                  { backgroundColor: softInset, borderColor: softBorder },
                  customerMode === 'manual' && { backgroundColor: accentSoft, borderColor: palette.accent },
                ]}>
                <Text style={[styles.modeButtonText, { color: customerMode === 'manual' ? palette.accent : palette.text }]}>Manual entry</Text>
              </Pressable>
            </View>

            {customerMode === 'existing' ? (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Select customer</Text>
                <Pressable
                  onPress={() => setShowCustomerDropdown((current) => !current)}
                  style={[styles.dropdownButton, { backgroundColor: softInset, borderColor: softBorder }, showCustomerDropdown && { borderColor: palette.accent, backgroundColor: accentSoft }]}>
                  <Text style={[styles.dropdownText, { color: palette.text }]}>{selectedCustomer ? selectedCustomer.name : 'Choose a customer'}</Text>
                  <Ionicons name={showCustomerDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={palette.text} />
                </Pressable>

                <Animated.View
                  style={[
                    styles.dropdownPanel,
                    {
                      maxHeight: dropdownAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 220],
                      }),
                      opacity: dropdownAnim,
                      backgroundColor: softInset,
                      borderColor: softBorder,
                    },
                  ]}>
                  <TextInput
                    value={customerQuery}
                    onChangeText={setCustomerQuery}
                    placeholder="Search customer"
                    placeholderTextColor={palette.muter}
                    style={[styles.searchInput, { backgroundColor: softSurface, borderColor: softBorder, color: palette.text }]}
                  />

                  <View style={styles.dropdownList}>
                    {filteredCustomers.length > 0 ? (
                      filteredCustomers.map((customer) => (
                        <Pressable
                          key={customer.id}
                          onPress={() => {
                            setSelectedCustomerId(customer.id);
                            setCustomerQuery('');
                            setShowCustomerDropdown(false);
                          }}
                          style={[styles.selectOption, { backgroundColor: softSurface, borderColor: softBorder }, selectedCustomerId === customer.id && { backgroundColor: accentSoft, borderColor: palette.accent }]}>
                          <Text style={[styles.selectText, { color: palette.text }]}>{customer.name}</Text>
                          <Text style={[styles.selectSubtext, { color: palette.muter }]}>{customer.email}</Text>
                        </Pressable>
                      ))
                    ) : (
                      <Text style={[styles.emptySearchText, { color: palette.muter }]}>No matching customer</Text>
                    )}
                  </View>
                </Animated.View>
              </>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer name</Text>
                <TextInput value={manualName} onChangeText={setManualName} style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="Siti Nur Izzah" placeholderTextColor={palette.muter} />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer email</Text>
                <TextInput value={manualEmail} onChangeText={setManualEmail} style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="siti@example.my" keyboardType="email-address" placeholderTextColor={palette.muter} />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer phone</Text>
                <TextInput value={manualPhone} onChangeText={setManualPhone} style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="+60 12-345 6789" placeholderTextColor={palette.muter} />
              </>
            )}

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Package</Text>
            <View style={styles.selectWrap}>
              <Pressable
                onPress={() => {
                  setSelectedPackageId('');
                  setUsePackagePrice(false);
                  setDraftAmount('');
                }}
                style={[styles.selectOption, { backgroundColor: softInset, borderColor: softBorder }, !usePackagePrice && { backgroundColor: accentSoft, borderColor: palette.accent }]}>
                <Text style={[styles.selectText, { color: palette.text }]}>Custom amount</Text>
              </Pressable>
              {packages.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => handlePackageSelection(item.id)}
                  style={[styles.selectOption, { backgroundColor: softInset, borderColor: softBorder }, selectedPackageId === item.id && { backgroundColor: accentSoft, borderColor: palette.accent }]}>
                  <Text style={[styles.selectText, { color: palette.text }]}>
                    {item.name} · <Text style={styles.inlineCurrency}>{currencyFormatter.format(item.price)}</Text>
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Amount</Text>
            <TextInput
              value={draftAmount}
              onChangeText={setDraftAmount}
              keyboardType="numeric"
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }, usePackagePrice && selectedPackageId ? styles.inputDisabled : null]}
              placeholder="2500"
              placeholderTextColor={palette.muter}
              editable={!usePackagePrice || !selectedPackageId}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Due date</Text>
            <TextInput
              value={draftDueDate}
              onChangeText={setDraftDueDate}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.muter}
            />

            <Pressable style={[styles.submitButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} onPress={handleCreateInvoice}>
              <Text style={styles.submitButtonText}>Save invoice</Text>
            </Pressable>
            </ScrollView>
          </View>

          <KeyboardDoneButton />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  headerIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 6, height: 7 },
    elevation: 5,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    textTransform: 'uppercase',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 5,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.45,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  headerActionPressed: {
    opacity: 0.6,
  },
  utilityButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    width: 40,
  },
  trashBadge: {
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    position: 'absolute',
    right: 3,
    top: 7,
    width: 10,
  },
  trashBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    flexDirection: 'row',
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 12,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 4, height: 7 },
    elevation: 5,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 6,
  },
  list: {
    paddingBottom: 116,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '92%',
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 14,
  },
  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 10,
  },
  modalScrollContent: {
    paddingBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  modalEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.65,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modeButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
  selectWrap: {
    gap: 8,
    marginBottom: 12,
  },
  selectOption: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 12,
  },
  dropdownText: {
    fontWeight: '600',
    flex: 1,
  },
  dropdownPanel: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 18,
    marginBottom: 12,
  },
  dropdownList: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    margin: 8,
  },
  selectText: {
    fontWeight: '600',
  },
  inlineCurrency: {
    fontSize: 12,
  },
  selectSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  emptySearchText: {
    fontSize: 12,
    paddingVertical: 10,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    fontSize: 14,
  },
  inputDisabled: {
    opacity: 0.62,
  },
  submitButton: {
    marginTop: 18,
    borderRadius: 17,
    paddingVertical: 15,
    alignItems: 'center',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 4, height: 7 },
    elevation: 5,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
});
