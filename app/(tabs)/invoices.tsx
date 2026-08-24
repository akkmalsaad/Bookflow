import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Alert, Animated, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusPill } from '@/components/StatusPill';
import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

export default function InvoicesScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { customers, invoices, packages, addCustomer, addInvoice, invoiceDraft, setInvoiceDraft, updateInvoiceDeposit, updateInvoiceStatus, currency } = useAppData();
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
  const [depositAmount, setDepositAmount] = useState('');
  const [depositError, setDepositError] = useState('');
  const dropdownAnim = useRef(new Animated.Value(0)).current;
  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';
  const accentSoft = isDarkMode ? '#29284B' : '#E9E8FF';

  const selectedPackage = packages.find((item) => item.id === selectedPackageId) ?? null;
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const depositInvoice = invoices.find((item) => item.id === depositInvoiceId) ?? null;
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

  const handlePackageSelection = (packageId: string) => {
    const chosenPackage = packages.find((item) => item.id === packageId);
    setSelectedPackageId(packageId);
    setUsePackagePrice(true);
    setDraftAmount(String(chosenPackage?.price ?? 0));
  };

  const handleShareInvoice = async (invoice: (typeof invoices)[number]) => {
    const customer = customerMap.get(invoice.customerId);
    const rawPhone = customer?.phone.trim() ?? '';
    const phoneNumber = rawPhone.replace(/\D/g, '');

    if (!customer || !phoneNumber || phoneNumber.startsWith('0')) {
      Alert.alert(
        'WhatsApp number required',
        'Add the customer phone number with its country code, for example +60 12-345 6789.',
      );
      return;
    }

    const invoiceUrl = Linking.createURL(`invoice/${invoice.id}`, {
      queryParams: { accept: 'true' },
    });
    const message = [
      `Hi ${customer.name},`,
      '',
      `Here is invoice ${invoice.id} for ${currencyFormatter.format(invoice.amount)}.`,
      `Due date: ${invoice.dueDate}`,
      '',
      `Open this link to review and accept your invoice: ${invoiceUrl}`,
      'You can also save a PDF copy from the invoice page for future reference.',
    ].join('\n');
    const encodedMessage = encodeURIComponent(message);
    const whatsappAppUrl = `whatsapp://send?phone=${phoneNumber}&text=${encodedMessage}`;
    const whatsappWebUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;

    try {
      await Linking.openURL(Platform.OS === 'web' ? whatsappWebUrl : whatsappAppUrl);
    } catch {
      try {
        await Linking.openURL(whatsappWebUrl);
      } catch {
        Alert.alert('Unable to open WhatsApp', 'Install WhatsApp or WhatsApp Business, then try again.');
      }
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

  const openDepositModal = (invoice: (typeof invoices)[number]) => {
    setDepositInvoiceId(invoice.id);
    setDepositAmount(invoice.depositPaid ? String(invoice.depositPaid) : '');
    setDepositError('');
  };

  const closeDepositModal = () => {
    setDepositInvoiceId(null);
    setDepositAmount('');
    setDepositError('');
  };

  const handleSaveDeposit = () => {
    if (!depositInvoice) return;

    const parsedAmount = Number(depositAmount.replace(/,/g, ''));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setDepositError('Enter a deposit amount greater than zero.');
      return;
    }
    if (parsedAmount > depositInvoice.amount) {
      setDepositError(`Deposit cannot exceed ${currencyFormatter.format(depositInvoice.amount)}.`);
      return;
    }

    if (updateInvoiceDeposit(depositInvoice.id, parsedAmount)) {
      closeDepositModal();
    }
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
        <Pressable
          style={[styles.primaryButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]}
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

      <FlatList
        data={invoices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const customer = customerMap.get(item.customerId);
          const depositPaid = item.depositPaid ?? 0;
          const remainingBalance = item.status === 'Paid' ? 0 : Math.max(0, item.amount - depositPaid);
          const tone =
            item.status === 'Paid' ? 'green' : item.status === 'Accepted' ? 'blue' : item.status === 'Overdue' ? 'amber' : item.status === 'Declined' ? 'red' : 'gray';

          return (
            <View style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
              <View style={[styles.cardAccent, { backgroundColor: palette.accent }]} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open invoice ${item.id}`}
                onPress={() => router.push({ pathname: '/invoice/[invoiceId]', params: { invoiceId: item.id } })}
                style={({ pressed }) => pressed && styles.cardPressed}>
                <View style={styles.cardHeader}>
                  <View style={[styles.invoiceIcon, { backgroundColor: accentSoft }]}>
                    <Ionicons name="document-text-outline" size={20} color={palette.accent} />
                  </View>
                  <View style={styles.cardHeaderCopy}>
                    <Text style={[styles.cardTitle, { color: palette.text }]}>{item.id}</Text>
                    <Text style={[styles.customer, { color: palette.muter }]} numberOfLines={1}>{customer?.name ?? 'Unknown customer'}</Text>
                  </View>
                  <StatusPill label={item.status} tone={tone} />
                </View>

                <View style={[styles.metaPanel, { backgroundColor: softInset }]}>
                  <View style={styles.metaRow}>
                    <View style={[styles.metaIcon, { backgroundColor: softSurface }]}>
                      <Ionicons name="calendar-outline" size={16} color={palette.accent} />
                    </View>
                    <View style={styles.metaCopy}>
                      <Text style={[styles.metaLabel, { color: palette.muter }]}>Due date</Text>
                      <Text style={[styles.metaValue, { color: palette.text }]}>{item.dueDate}</Text>
                    </View>
                  </View>
                  <View style={[styles.metaRow, styles.metaRowLast]}>
                    <View style={[styles.metaIcon, { backgroundColor: softSurface }]}>
                      <Ionicons name="paper-plane-outline" size={16} color={palette.accent} />
                    </View>
                    <View style={styles.metaCopy}>
                      <Text style={[styles.metaLabel, { color: palette.muter }]}>Sent</Text>
                      <Text style={[styles.metaValue, { color: palette.text }]}>{item.sentAt}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.amountRow}>
                  <View>
                    <Text style={[styles.amountLabel, { color: palette.muter }]}>Invoice total</Text>
                    <Text style={[styles.amount, { color: palette.text }]}>{currencyFormatter.format(item.amount)}</Text>
                  </View>
                  <View style={[styles.detailArrow, { backgroundColor: accentSoft }]}>
                    <Ionicons name="chevron-forward" size={18} color={palette.accent} />
                  </View>
                </View>

                {depositPaid > 0 ? (
                  <View style={[styles.paymentSummary, { backgroundColor: softInset, borderColor: softBorder }]}>
                    <View style={styles.paymentSummaryItem}>
                      <Text style={[styles.paymentSummaryLabel, { color: palette.muter }]}>Deposit paid</Text>
                      <Text style={[styles.paymentSummaryValue, { color: palette.success }]}>{currencyFormatter.format(depositPaid)}</Text>
                    </View>
                    <View style={[styles.paymentSummaryDivider, { backgroundColor: palette.border }]} />
                    <View style={[styles.paymentSummaryItem, styles.paymentSummaryItemRight]}>
                      <Text style={[styles.paymentSummaryLabel, { color: palette.muter }]}>Balance due</Text>
                      <Text style={[styles.paymentSummaryValue, { color: palette.text }]}>{currencyFormatter.format(remainingBalance)}</Text>
                    </View>
                  </View>
                ) : null}
              </Pressable>

              {item.status !== 'Paid' && item.status !== 'Cancelled' && item.status !== 'Declined' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openDepositModal(item)}
                  style={[styles.depositButton, { backgroundColor: accentSoft, borderColor: palette.accent }]}>
                  <View style={styles.depositButtonLabel}>
                    <Ionicons name="wallet-outline" size={18} color={palette.accent} />
                    <Text style={[styles.depositButtonText, { color: palette.accent }]}>{depositPaid > 0 ? 'Update deposit' : 'Deposit paid'}</Text>
                  </View>
                </Pressable>
              ) : null}

              {item.status !== 'Paid' && (
                <View style={styles.actionRow}>
                  <Pressable style={[styles.linkButton, styles.actionButtonShadow]} onPress={() => handleShareInvoice(item)}>
                    <Ionicons name="logo-whatsapp" size={17} color="#fff" />
                    <Text style={styles.linkButtonText}>Send invoice</Text>
                  </Pressable>
                  {item.status === 'Accepted' ? (
                    <Pressable style={[styles.paymentButton, styles.actionButtonShadow]} onPress={() => updateInvoiceStatus(item.id, 'Paid')}>
                      <Text style={styles.paymentButtonText}>Payment done</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={[styles.acceptButton, styles.actionButtonShadow, { backgroundColor: palette.accent }]} onPress={() => updateInvoiceStatus(item.id, 'Accepted')}>
                      <Text style={styles.acceptButtonText}>Accept</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          );
        }}
      />

      <Modal visible={depositInvoice !== null} transparent animationType="fade" onRequestClose={closeDepositModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.depositModalBackdrop}>
          <View style={[styles.depositModalCard, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalEyebrow, { color: palette.accent }]}>Payment received</Text>
                <Text style={[styles.modalTitle, { color: palette.text }]}>Record deposit</Text>
              </View>
              <Pressable onPress={closeDepositModal} style={[styles.closeButton, { backgroundColor: softInset }]} accessibilityLabel="Close deposit modal">
                <Ionicons name="close" size={22} color={palette.text} />
              </Pressable>
            </View>

            <Text style={[styles.depositModalCopy, { color: palette.muter }]}>Enter the amount received for {depositInvoice?.id}. The remaining customer balance updates automatically.</Text>

            <View style={[styles.depositTotalRow, { backgroundColor: softInset }]}>
              <Text style={[styles.depositTotalLabel, { color: palette.muter }]}>Invoice total</Text>
              <Text style={[styles.depositTotalValue, { color: palette.text }]}>{currencyFormatter.format(depositInvoice?.amount ?? 0)}</Text>
            </View>

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Deposit amount</Text>
            <View style={[styles.depositInputWrap, { backgroundColor: softInset, borderColor: depositError ? palette.danger : softBorder }]}>
              <Text style={[styles.currencyPrefix, { color: palette.muter }]}>{currency}</Text>
              <TextInput
                autoFocus
                keyboardType="decimal-pad"
                onChangeText={(value) => {
                  setDepositAmount(value.replace(/[^0-9.,]/g, ''));
                  setDepositError('');
                }}
                onSubmitEditing={handleSaveDeposit}
                placeholder="0.00"
                placeholderTextColor={palette.muter}
                returnKeyType="done"
                selectionColor={palette.accent}
                style={[styles.depositInput, { color: palette.text }]}
                value={depositAmount}
              />
            </View>
            {depositError ? <Text style={[styles.depositError, { color: palette.danger }]}>{depositError}</Text> : null}

            <View style={styles.depositPreviewRow}>
              <Text style={[styles.depositPreviewLabel, { color: palette.muter }]}>Remaining after deposit</Text>
              <Text style={[styles.depositPreviewValue, { color: palette.text }]}>
                {currencyFormatter.format(Math.max(0, (depositInvoice?.amount ?? 0) - (Number(depositAmount.replace(/,/g, '')) || 0)))}
              </Text>
            </View>

            <View style={styles.depositModalActions}>
              <Pressable onPress={closeDepositModal} style={[styles.depositCancelButton, { backgroundColor: softInset, borderColor: softBorder }]}>
                <Text style={[styles.depositCancelText, { color: palette.text }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSaveDeposit} style={[styles.depositSaveButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]}>
                <Text style={styles.depositSaveText}>Save deposit</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalScrollContent}>
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
  card: {
    position: 'relative',
    borderRadius: 26,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 8, height: 10 },
    elevation: 5,
  },
  cardAccent: {
    position: 'absolute',
    top: 23,
    left: 0,
    width: 4,
    height: 40,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  invoiceIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardHeaderCopy: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.25,
    marginBottom: 4,
  },
  customer: {
    fontSize: 12,
  },
  metaPanel: {
    borderRadius: 18,
    padding: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  metaRowLast: {
    marginBottom: 0,
  },
  metaIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  metaCopy: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  amountLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  amount: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.45,
  },
  detailArrow: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentSummary: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  paymentSummaryItem: {
    flex: 1,
  },
  paymentSummaryItemRight: {
    alignItems: 'flex-end',
  },
  paymentSummaryDivider: {
    height: 32,
    marginHorizontal: 12,
    width: StyleSheet.hairlineWidth,
  },
  paymentSummaryLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.55,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  paymentSummaryValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  depositButton: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  depositButtonLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  depositButtonText: {
    fontSize: 13,
    fontWeight: '900',
  },
  actionRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  actionButtonShadow: {
    shadowColor: '#020617',
    shadowOpacity: 0.14,
    shadowRadius: 9,
    shadowOffset: { width: 3, height: 5 },
    elevation: 3,
  },
  linkButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 15,
    backgroundColor: '#128C7E',
  },
  linkButtonText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 7,
  },
  acceptButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 15,
  },
  acceptButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  paymentButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 15,
    backgroundColor: '#117A4C',
  },
  paymentButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  depositModalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  depositModalCard: {
    borderRadius: 28,
    borderWidth: 1,
    elevation: 14,
    maxWidth: 520,
    padding: 20,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    width: '100%',
  },
  depositModalCopy: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
    marginBottom: 15,
  },
  depositTotalRow: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  depositTotalLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
  },
  depositTotalValue: {
    fontSize: 17,
    fontWeight: '900',
  },
  depositInputWrap: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: 15,
  },
  currencyPrefix: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginRight: 10,
  },
  depositInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
    minHeight: 52,
    paddingVertical: 0,
  },
  depositError: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 7,
  },
  depositPreviewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  depositPreviewLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  depositPreviewValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  depositModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  depositCancelButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  depositCancelText: {
    fontSize: 14,
    fontWeight: '800',
  },
  depositSaveButton: {
    alignItems: 'center',
    borderRadius: 16,
    elevation: 4,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    shadowOffset: { height: 6, width: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  depositSaveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
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
