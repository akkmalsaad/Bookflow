import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Alert, Animated, FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusPill } from '@/components/StatusPill';
import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

export default function InvoicesScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { customers, invoices, packages, addCustomer, addInvoice, invoiceDraft, setInvoiceDraft, updateInvoiceStatus, currency } = useAppData();
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
  const dropdownAnim = useRef(new Animated.Value(0)).current;

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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.eyebrow, { color: palette.accent }]}>Invoices</Text>
          <Text style={[styles.title, { color: palette.text }]}>Client billing</Text>
        </View>
        <Pressable
          style={styles.primaryButton}
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
          const tone =
            item.status === 'Paid' ? 'green' : item.status === 'Accepted' ? 'blue' : item.status === 'Overdue' ? 'amber' : item.status === 'Declined' ? 'red' : 'gray';

          return (
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open invoice ${item.id}`}
                onPress={() => router.push({ pathname: '/invoice/[invoiceId]', params: { invoiceId: item.id } })}
                style={({ pressed }) => pressed && styles.cardPressed}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={[styles.cardTitle, { color: palette.text }]}>{item.id}</Text>
                    <Text style={[styles.customer, { color: palette.muter }]}>{customer?.name ?? 'Unknown customer'}</Text>
                  </View>
                  <StatusPill label={item.status} tone={tone} />
                </View>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: palette.muter }]}>Due date</Text>
                  <Text style={[styles.metaValue, { color: palette.text }]}>{item.dueDate}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: palette.muter }]}>Sent</Text>
                  <Text style={[styles.metaValue, { color: palette.text }]}>{item.sentAt}</Text>
                </View>
                <Text style={[styles.amount, { color: palette.text }]}>{currencyFormatter.format(item.amount)}</Text>
              </Pressable>

              {item.status !== 'Paid' && (
                <View style={styles.actionRow}>
                  <Pressable style={styles.linkButton} onPress={() => handleShareInvoice(item)}>
                    <Ionicons name="logo-whatsapp" size={17} color="#fff" />
                    <Text style={styles.linkButtonText}>Send invoice</Text>
                  </Pressable>
                  {item.status === 'Accepted' ? (
                    <Pressable style={styles.paymentButton} onPress={() => updateInvoiceStatus(item.id, 'Paid')}>
                      <Text style={styles.paymentButtonText}>Payment done</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.acceptButton} onPress={() => updateInvoiceStatus(item.id, 'Accepted')}>
                      <Text style={styles.acceptButtonText}>Accept</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          );
        }}
      />

      <Modal visible={showComposer} transparent animationType="slide" onRequestClose={() => setShowComposer(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>New invoice</Text>
              <Pressable onPress={() => {
                setInvoiceDraft(null);
                setSelectedPackageId(packages[0]?.id ?? '');
                setUsePackagePrice(Boolean(packages.length));
                setDraftAmount(packages[0] ? String(packages[0].price) : '');
                setShowComposer(false);
              }}>
                <Ionicons name="close" size={24} color={palette.text} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer source</Text>
            <View style={styles.modeRow}>
              <Pressable
                onPress={() => setCustomerMode('existing')}
                style={[styles.modeButton, customerMode === 'existing' && styles.modeButtonActive]}>
                <Text style={[styles.modeButtonText, customerMode === 'existing' && styles.modeButtonTextActive]}>Existing customer</Text>
              </Pressable>
              <Pressable
                onPress={() => setCustomerMode('manual')}
                style={[styles.modeButton, customerMode === 'manual' && styles.modeButtonActive]}>
                <Text style={[styles.modeButtonText, customerMode === 'manual' && styles.modeButtonTextActive]}>Manual entry</Text>
              </Pressable>
            </View>

            {customerMode === 'existing' ? (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Select customer</Text>
                <Pressable
                  onPress={() => setShowCustomerDropdown((current) => !current)}
                  style={[styles.dropdownButton, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }, showCustomerDropdown && { borderColor: palette.accent, backgroundColor: palette.iconWrap }]}>
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
                      backgroundColor: palette.surfaceAlt,
                      borderColor: palette.border,
                    },
                  ]}>
                  <TextInput
                    value={customerQuery}
                    onChangeText={setCustomerQuery}
                    placeholder="Search customer"
                    placeholderTextColor={palette.muter}
                    style={[styles.searchInput, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
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
                          style={[styles.selectOption, { backgroundColor: palette.surface, borderColor: palette.border }, selectedCustomerId === customer.id && { backgroundColor: palette.iconWrap, borderColor: palette.accent }]}>
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
                <TextInput value={manualName} onChangeText={setManualName} style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]} placeholder="Jane Smith" placeholderTextColor={palette.muter} />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer email</Text>
                <TextInput value={manualEmail} onChangeText={setManualEmail} style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]} placeholder="jane@example.com" keyboardType="email-address" placeholderTextColor={palette.muter} />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer phone</Text>
                <TextInput value={manualPhone} onChangeText={setManualPhone} style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]} placeholder="+1 (555) 123-4567" placeholderTextColor={palette.muter} />
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
                style={[styles.selectOption, { backgroundColor: palette.surface, borderColor: palette.border }, !usePackagePrice && { backgroundColor: palette.iconWrap, borderColor: palette.accent }]}>
                <Text style={[styles.selectText, { color: palette.text }]}>Custom amount</Text>
              </Pressable>
              {packages.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => handlePackageSelection(item.id)}
                  style={[styles.selectOption, { backgroundColor: palette.surface, borderColor: palette.border }, selectedPackageId === item.id && { backgroundColor: palette.iconWrap, borderColor: palette.accent }]}>
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
              style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }, usePackagePrice && selectedPackageId ? styles.inputDisabled : null]}
              placeholder="2500"
              placeholderTextColor={palette.muter}
              editable={!usePackagePrice || !selectedPackageId}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Due date</Text>
            <TextInput
              value={draftDueDate}
              onChangeText={setDraftDueDate}
              style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.muter}
            />

            <Pressable style={styles.submitButton} onPress={handleCreateInvoice}>
              <Text style={styles.submitButtonText}>Save invoice</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  eyebrow: {
    textTransform: 'uppercase',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 6,
  },
  list: {
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  customer: {
    color: '#6B7280',
    fontSize: 13,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metaLabel: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
  },
  metaValue: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
  },
  amount: {
    marginTop: 10,
    fontSize: 22,
    color: '#111827',
    fontWeight: '800',
  },
  actionRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  linkButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
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
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#111827',
  },
  acceptButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  paymentButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#117A4C',
  },
  paymentButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  fieldLabel: {
    color: '#4B5563',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  modeButtonActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#A5B4FC',
  },
  modeButtonText: {
    color: '#374151',
    fontWeight: '700',
  },
  modeButtonTextActive: {
    color: '#312E81',
  },
  selectWrap: {
    gap: 8,
    marginBottom: 12,
  },
  selectOption: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectOptionSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#A5B4FC',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  dropdownButtonActive: {
    borderColor: '#A5B4FC',
    backgroundColor: '#EEF2FF',
  },
  dropdownText: {
    color: '#111827',
    fontWeight: '600',
    flex: 1,
  },
  dropdownPanel: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    marginBottom: 12,
  },
  dropdownList: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    margin: 8,
    backgroundColor: '#fff',
    color: '#111827',
  },
  selectText: {
    color: '#111827',
    fontWeight: '600',
  },
  inlineCurrency: {
    fontSize: 12,
  },
  selectSubtext: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  emptySearchText: {
    color: '#6B7280',
    fontSize: 12,
    paddingVertical: 10,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    color: '#111827',
    fontSize: 14,
  },
  inputDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
  },
  submitButton: {
    marginTop: 8,
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
});
