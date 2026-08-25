import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/InitialsAvatar';
import { StatusPill } from '@/components/StatusPill';
import { UpdatePaymentModal } from '@/components/UpdatePaymentModal';
import {
  getCompactCurrencyFormatter,
  getCurrencyFormatter,
  useAppData,
  type Booking,
} from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import {
  getBookingPaymentState,
  getBookingScheduleBadge,
  getCustomerMetrics,
  groupCustomerBookings,
  toDateKey,
  toWhatsAppNumber,
  type BookingPaymentState,
} from '@/lib/customer-metrics';
import { shareInvoiceOnWhatsApp } from '@/lib/invoice-sharing';

function formatEventDate(date?: string) {
  if (!date) return 'Not specified';

  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return date;

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsedDate);
}

function getProfileValue(value: string) {
  return value.trim() || 'Not provided';
}

export default function CustomerProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ customerId?: string }>();
  const { isDarkMode } = useTheme();
  const {
    customers,
    bookings,
    invoices,
    packages,
    payments,
    currency,
    updateCustomer,
    deleteCustomer,
    setInvoiceDraft,
    recordInvoicePayment,
    createInvoiceShareLink,
  } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const customer = customers.find((item) => item.id === params.customerId);
  const [showMenu, setShowMenu] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState('');
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);

  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';
  const accentSoft = isDarkMode ? '#29284B' : '#E9E8FF';

  const compactCurrency = useMemo(() => getCompactCurrencyFormatter(currency), [currency]);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const todayKey = toDateKey(new Date());
  const customerId = customer?.id ?? '';
  const metrics = useMemo(
    () => getCustomerMetrics(customerId, bookings, invoices, payments),
    [bookings, customerId, invoices, payments],
  );
  const customerBookings = useMemo(
    () => bookings.filter((item) => item.customerId === customerId),
    [bookings, customerId],
  );
  const { upcoming, past } = useMemo(
    () => groupCustomerBookings(customerBookings, todayKey),
    [customerBookings, todayKey],
  );

  const phone = customer?.phone.trim() ?? '';
  const email = customer?.email.trim() ?? '';

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/customers');
  };

  const openExternalLink = async (url: string, unavailableMessage: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Not available', unavailableMessage);
    }
  };

  const openEditor = () => {
    if (!customer) return;

    setEditName(customer.name);
    setEditEmail(customer.email);
    setEditPhone(customer.phone);
    setEditLocation(customer.location);
    setEditNotes(customer.notes);
    setEditError('');
    setShowMenu(false);
    setShowEditor(true);
  };

  const handleSaveCustomer = () => {
    if (!customer) return;

    const saved = updateCustomer(customer.id, {
      name: editName,
      email: editEmail,
      phone: editPhone,
      location: editLocation,
      notes: editNotes,
    });

    if (!saved) {
      setEditError('Add a customer name before saving.');
      return;
    }

    setShowEditor(false);
  };

  const handleCreateBooking = () => {
    if (!customer) return;

    setShowMenu(false);
    router.push({ pathname: '/(tabs)/bookings', params: { composeForCustomerId: customer.id } });
  };

  const handleCreateInvoice = () => {
    if (!customer) return;

    const latestBooking = [...customerBookings].sort((first, second) => second.date.localeCompare(first.date))[0];
    const amount = latestBooking?.price ?? packages[0]?.price ?? 0;

    setInvoiceDraft({
      customerId: customer.id,
      amount,
      dueDate: latestBooking?.date ?? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      bookingId: latestBooking?.id,
      serviceName: latestBooking?.packageName,
    });
    setShowMenu(false);
    router.push('/(tabs)/invoices');
  };

  const handleDeleteCustomer = () => {
    if (!customer) return;

    const relatedInvoices = invoices.filter((invoice) => invoice.customerId === customer.id).length;
    const relatedRecords = [
      customerBookings.length ? `${customerBookings.length} booking${customerBookings.length === 1 ? '' : 's'}` : '',
      relatedInvoices ? `${relatedInvoices} invoice${relatedInvoices === 1 ? '' : 's'}` : '',
    ].filter(Boolean);

    setShowMenu(false);
    Alert.alert(
      'Delete customer',
      relatedRecords.length
        ? `${customer.name} will be removed from your client list. Their ${relatedRecords.join(' and ')} stay in your records.`
        : `${customer.name} will be removed from your client list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteCustomer(customer.id);
            router.replace('/(tabs)/customers');
          },
        },
      ],
    );
  };

  const handleSendInvoice = async (booking: Booking, payment: BookingPaymentState) => {
    if (!customer || busyBookingId) return;

    // Already invoiced: send the existing invoice. Otherwise open the invoice composer prefilled.
    if (payment.invoice) {
      setBusyBookingId(booking.id);
      try {
        await shareInvoiceOnWhatsApp({
          invoice: payment.invoice,
          customer,
          currencyFormatter,
          createShareLink: createInvoiceShareLink,
        });
      } finally {
        setBusyBookingId(null);
      }
      return;
    }

    setInvoiceDraft({
      customerId: customer.id,
      amount: payment.outstanding > 0 ? payment.outstanding : payment.totalAmount,
      dueDate: booking.date,
      bookingId: booking.id,
      serviceName: booking.packageName,
    });
    router.push('/(tabs)/invoices');
  };

  const openPaymentModal = (payment: BookingPaymentState) => {
    if (!payment.invoice) return;

    setPaymentInvoiceId(payment.invoice.id);
  };

  const handleMarkDepositPaid = (booking: Booking, payment: BookingPaymentState) => {
    if (!payment.invoice || !payment.depositAmount || payment.isDepositPaid || busyBookingId) return;

    // Only the part of the deposit that has not been received yet is recorded.
    const depositDue = Math.max(0, payment.depositAmount - payment.amountPaid);
    const invoiceId = payment.invoice.id;

    Alert.alert(
      'Record deposit',
      `Mark the ${currencyFormatter.format(depositDue)} deposit for ${booking.packageName} as paid?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record',
          onPress: () => {
            if (busyBookingId) return;

            setBusyBookingId(booking.id);
            const result = recordInvoicePayment({
              invoiceId,
              amount: depositDue,
              method: 'Deposit',
              date: toDateKey(new Date()),
              kind: 'deposit',
            });
            setBusyBookingId(null);

            if (!result.ok) {
              Alert.alert('Deposit not recorded', result.error ?? 'The deposit could not be recorded for this invoice.');
              return;
            }

            Alert.alert('Deposit recorded', `${currencyFormatter.format(depositDue)} added to this booking.`);
          },
        },
      ],
    );
  };

  if (!customer) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
        <View style={styles.notFoundWrap}>
          <Text style={[styles.title, { color: palette.text }]}>Customer not found</Text>
          <Pressable style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const cardStyle = [
    styles.card,
    { backgroundColor: palette.surface, borderColor: palette.border, shadowColor: isDarkMode ? '#020617' : '#101828' },
  ];

  const renderBookingCard = (booking: Booking) => {
    const scheduleBadge = getBookingScheduleBadge(booking, todayKey);
    const payment = getBookingPaymentState(booking, invoices, packages, payments);
    const isBusy = busyBookingId === booking.id;
    const isSettled = payment.outstanding <= 0 && payment.amountPaid > 0;
    const canUpdatePayment = Boolean(payment.invoice) && payment.outstanding > 0;
    const showDepositAction = Boolean(payment.invoice && payment.depositAmount);

    return (
      <View key={booking.id} style={[...cardStyle, styles.bookingCard]}>
        <View style={styles.bookingHeader}>
          <Text style={[styles.bookingTitle, { color: palette.text }]} numberOfLines={1}>{booking.packageName}</Text>
          <StatusPill label={scheduleBadge.label} tone={scheduleBadge.tone} />
        </View>

        <View style={styles.bookingMetaRow}>
          <Ionicons name="calendar-outline" size={15} color={palette.muter} />
          <Text style={[styles.bookingMeta, { color: palette.muter }]}>{formatEventDate(booking.date)}</Text>
          <StatusPill label={payment.status} tone={payment.tone} />
        </View>

        <View style={styles.bookingMetaRow}>
          <Ionicons name="location-outline" size={15} color={palette.muter} />
          <Text style={[styles.bookingMeta, { color: palette.muter }]} numberOfLines={1}>
            {getProfileValue(booking.location)}
          </Text>
        </View>

        {payment.outstanding > 0 ? (
          <Text style={[styles.balanceLine, { color: palette.warning }]}>
            Outstanding: {compactCurrency.format(payment.outstanding)}
          </Text>
        ) : isSettled ? (
          <Text style={[styles.balanceLine, { color: palette.success }]}>
            Paid in full · {compactCurrency.format(payment.amountPaid)}
          </Text>
        ) : null}

        <View style={[styles.bookingDivider, { backgroundColor: palette.border }]} />

        <View style={styles.bookingActionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={payment.invoice ? `Send invoice ${payment.invoice.id}` : 'Create an invoice for this booking'}
            accessibilityState={{ disabled: isBusy }}
            disabled={isBusy}
            onPress={() => handleSendInvoice(booking, payment)}
            style={({ pressed }) => [
              styles.bookingAction,
              { backgroundColor: softInset, borderColor: softBorder },
              isBusy && styles.actionDisabled,
              pressed && styles.pressed,
            ]}>
            <Ionicons name="receipt-outline" size={16} color={palette.accent} />
            <Text style={[styles.bookingActionText, { color: palette.text }]}>Send Invoice</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Update payment for this booking"
            accessibilityState={{ disabled: !canUpdatePayment || isBusy }}
            disabled={!canUpdatePayment || isBusy}
            onPress={() => openPaymentModal(payment)}
            style={({ pressed }) => [
              styles.bookingAction,
              { backgroundColor: softInset, borderColor: softBorder },
              (!canUpdatePayment || isBusy) && styles.actionDisabled,
              pressed && styles.pressed,
            ]}>
            <Ionicons name="wallet-outline" size={16} color={canUpdatePayment ? palette.accent : palette.muter} />
            <Text style={[styles.bookingActionText, { color: canUpdatePayment ? palette.text : palette.muter }]}>
              Update Payment
            </Text>
          </Pressable>
        </View>

        {showDepositAction && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              payment.isDepositPaid
                ? 'Deposit already recorded'
                : `Record the ${compactCurrency.format(payment.depositAmount ?? 0)} deposit as paid`
            }
            accessibilityState={{ disabled: payment.isDepositPaid || isBusy }}
            disabled={payment.isDepositPaid || isBusy}
            onPress={() => handleMarkDepositPaid(booking, payment)}
            style={({ pressed }) => [
              styles.depositAction,
              payment.isDepositPaid
                ? { backgroundColor: isDarkMode ? '#173A35' : '#DFF7EF', borderColor: isDarkMode ? '#215F4C' : '#BCEBD6' }
                : { backgroundColor: softInset, borderColor: softBorder },
              isBusy && styles.actionDisabled,
              pressed && styles.pressed,
            ]}>
            <Ionicons
              name={payment.isDepositPaid ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={16}
              color={payment.isDepositPaid ? palette.success : palette.accent}
            />
            <Text
              style={[
                styles.bookingActionText,
                { color: payment.isDepositPaid ? palette.success : palette.text },
              ]}>
              {payment.isDepositPaid
                ? 'Deposit Paid'
                : `Deposit Paid · ${compactCurrency.format(payment.depositAmount ?? 0)}`}
            </Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to customers"
          onPress={handleBack}
          style={({ pressed }) => [styles.navigationBackButton, pressed && styles.navigationBackButtonPressed]}>
          <Ionicons name="chevron-back" size={21} color={palette.accent} />
          <Text style={[styles.navigationBackText, { color: palette.accent }]}>Back</Text>
        </Pressable>

        <View style={styles.header}>
          <InitialsAvatar
            name={customer.name}
            size={56}
            backgroundColor={palette.iconWrap}
            color={palette.accent}
            style={styles.avatar}
          />
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>Customer profile</Text>
            <Text style={[styles.title, { color: palette.text }]}>{customer.name}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Customer actions"
            onPress={() => setShowMenu(true)}
            style={({ pressed }) => [
              styles.menuButton,
              { backgroundColor: softInset, borderColor: softBorder },
              pressed && styles.pressed,
            ]}>
            <Ionicons name="ellipsis-horizontal" size={19} color={palette.text} />
          </Pressable>
        </View>

        <View style={[...cardStyle, styles.summaryCard]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: palette.text }]}>{metrics.bookingCount}</Text>
            <Text style={[styles.summaryLabel, { color: palette.muter }]}>Bookings</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: palette.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: palette.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {compactCurrency.format(metrics.revenue)}
            </Text>
            <Text style={[styles.summaryLabel, { color: palette.muter }]}>Revenue</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: palette.border }]} />
          <View style={styles.summaryItem}>
            <Text
              style={[styles.summaryValue, { color: metrics.outstanding > 0 ? palette.warning : palette.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit>
              {compactCurrency.format(metrics.outstanding)}
            </Text>
            <Text style={[styles.summaryLabel, { color: palette.muter }]}>Outstanding</Text>
          </View>
        </View>

        <View style={cardStyle}>
          <Text style={[styles.sectionLabel, { color: palette.muter }]}>Contact details</Text>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Name</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{getProfileValue(customer.name)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Phone</Text>
            {phone ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Call ${customer.name}`}
                onPress={() => openExternalLink(`tel:${phone}`, 'This device cannot start a phone call.')}
                style={({ pressed }) => [styles.detailValueWrap, pressed && styles.pressed]}>
                <Text style={[styles.detailValue, styles.detailLink, { color: palette.accent }]}>{phone}</Text>
              </Pressable>
            ) : (
              <Text style={[styles.detailValue, { color: palette.text }]}>Not provided</Text>
            )}
          </View>
          <View style={[styles.detailRow, styles.lastDetailRow]}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Email</Text>
            {email ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Email ${customer.name}`}
                onPress={() => openExternalLink(`mailto:${email}`, 'This device has no email app set up.')}
                style={({ pressed }) => [styles.detailValueWrap, pressed && styles.pressed]}>
                <Text style={[styles.detailValue, styles.detailLink, { color: palette.accent }]}>{email}</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add an email address for this customer"
                onPress={openEditor}
                style={({ pressed }) => [styles.detailValueWrap, pressed && styles.pressed]}>
                <Text style={[styles.detailValue, styles.detailLink, { color: palette.accent }]}>+ Add email</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.quickActionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Call ${customer.name}`}
              disabled={!phone}
              onPress={() => openExternalLink(`tel:${phone}`, 'This device cannot start a phone call.')}
              style={({ pressed }) => [
                styles.quickAction,
                { backgroundColor: softInset, borderColor: softBorder },
                !phone && styles.quickActionDisabled,
                pressed && styles.pressed,
              ]}>
              <Ionicons name="call-outline" size={16} color={phone ? palette.accent : palette.muter} />
              <Text style={[styles.quickActionText, { color: phone ? palette.text : palette.muter }]}>Call</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Message ${customer.name} on WhatsApp`}
              disabled={!phone}
              onPress={() =>
                openExternalLink(
                  `https://wa.me/${toWhatsAppNumber(phone)}`,
                  'WhatsApp could not be opened on this device.',
                )
              }
              style={({ pressed }) => [
                styles.quickAction,
                { backgroundColor: softInset, borderColor: softBorder },
                !phone && styles.quickActionDisabled,
                pressed && styles.pressed,
              ]}>
              <Ionicons name="logo-whatsapp" size={16} color={phone ? palette.accent : palette.muter} />
              <Text style={[styles.quickActionText, { color: phone ? palette.text : palette.muter }]}>WhatsApp</Text>
            </Pressable>
            {email ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Email ${customer.name}`}
                onPress={() => openExternalLink(`mailto:${email}`, 'This device has no email app set up.')}
                style={({ pressed }) => [
                  styles.quickAction,
                  { backgroundColor: softInset, borderColor: softBorder },
                  pressed && styles.pressed,
                ]}>
                <Ionicons name="mail-outline" size={16} color={palette.accent} />
                <Text style={[styles.quickActionText, { color: palette.text }]}>Email</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.bookingsHeader}>
          <Text style={[styles.sectionLabel, styles.bookingsHeading, { color: palette.muter }]}>
            Bookings · {customerBookings.length}
          </Text>
        </View>

        {customerBookings.length > 0 ? (
          <>
            {upcoming.length > 0 && (
              <>
                {past.length > 0 && (
                  <Text style={[styles.groupLabel, { color: palette.muter }]}>Upcoming</Text>
                )}
                {upcoming.map(renderBookingCard)}
              </>
            )}
            {past.length > 0 && (
              <>
                {upcoming.length > 0 && <Text style={[styles.groupLabel, { color: palette.muter }]}>Past</Text>}
                {past.map(renderBookingCard)}
              </>
            )}
          </>
        ) : (
          <View style={[...cardStyle, styles.emptyCard]}>
            <Ionicons name="calendar-outline" size={22} color={palette.muter} />
            <Text style={[styles.emptyText, { color: palette.muter }]}>No bookings yet for this customer.</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowMenu(false)}>
          <Pressable
            style={[styles.menuSheet, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}
            onPress={(event) => event.stopPropagation()}>
            <View style={[styles.modalHandle, { backgroundColor: palette.border }]} />
            <Pressable
              accessibilityRole="button"
              onPress={openEditor}
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: accentSoft }]}>
              <Ionicons name="create-outline" size={18} color={palette.accent} />
              <Text style={[styles.menuItemText, { color: palette.text }]}>Edit customer</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={handleCreateBooking}
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: accentSoft }]}>
              <Ionicons name="calendar-outline" size={18} color={palette.accent} />
              <Text style={[styles.menuItemText, { color: palette.text }]}>Create booking</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={handleCreateInvoice}
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: accentSoft }]}>
              <Ionicons name="document-text-outline" size={18} color={palette.accent} />
              <Text style={[styles.menuItemText, { color: palette.text }]}>Create invoice</Text>
            </Pressable>
            <View style={[styles.menuDivider, { backgroundColor: palette.border }]} />
            <Pressable
              accessibilityRole="button"
              onPress={handleDeleteCustomer}
              style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
              <Ionicons name="trash-outline" size={18} color={palette.danger} />
              <Text style={[styles.menuItemText, { color: palette.danger }]}>Delete customer</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <UpdatePaymentModal
        invoiceId={paymentInvoiceId}
        onClose={() => setPaymentInvoiceId(null)}
        onSaved={(amount) =>
          Alert.alert('Payment recorded', `${currencyFormatter.format(amount)} recorded for ${customer.name}.`)
        }
      />

      <Modal visible={showEditor} transparent animationType="slide" onRequestClose={() => setShowEditor(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.editorCard, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <View style={[styles.modalHandle, { backgroundColor: palette.border }]} />
            <View style={styles.editorHeader}>
              <View>
                <Text style={[styles.modalEyebrow, { color: palette.accent }]}>Edit</Text>
                <Text style={[styles.modalTitle, { color: palette.text }]}>Customer details</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close editor"
                onPress={() => setShowEditor(false)}
                style={[styles.closeButton, { backgroundColor: softInset }]}>
                <Ionicons name="close" size={24} color={palette.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.fieldLabel, { color: palette.muter }]}>Name</Text>
              <TextInput
                value={editName}
                onChangeText={(value) => {
                  setEditName(value);
                  setEditError('');
                }}
                style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                placeholder="Nur Aisyah Rahman"
                placeholderTextColor={palette.muter}
              />

              <Text style={[styles.fieldLabel, { color: palette.muter }]}>Email</Text>
              <TextInput
                value={editEmail}
                onChangeText={setEditEmail}
                style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                placeholder="aisyah@example.my"
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={palette.muter}
              />

              <Text style={[styles.fieldLabel, { color: palette.muter }]}>Phone</Text>
              <TextInput
                value={editPhone}
                onChangeText={setEditPhone}
                style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                placeholder="+60 12-345 6789"
                keyboardType="phone-pad"
                placeholderTextColor={palette.muter}
              />

              <Text style={[styles.fieldLabel, { color: palette.muter }]}>Location</Text>
              <TextInput
                value={editLocation}
                onChangeText={setEditLocation}
                style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                placeholder="Shah Alam, Selangor"
                placeholderTextColor={palette.muter}
              />

              <Text style={[styles.fieldLabel, { color: palette.muter }]}>Notes</Text>
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                style={[styles.input, styles.notesInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                placeholder="Wedding client, prefers WhatsApp updates"
                placeholderTextColor={palette.muter}
                multiline
              />

              {editError ? <Text style={[styles.errorText, { color: palette.danger }]}>{editError}</Text> : null}

              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.submitButton,
                  { backgroundColor: palette.accent, shadowColor: palette.accent },
                  pressed && styles.pressed,
                ]}
                onPress={handleSaveCustomer}>
                <Text style={styles.submitButtonText}>Save changes</Text>
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
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  pressed: {
    opacity: 0.72,
  },
  notFoundWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  navigationBackButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    marginBottom: 16,
    minHeight: 32,
    paddingRight: 10,
  },
  navigationBackButtonPressed: {
    opacity: 0.55,
  },
  navigationBackText: {
    fontSize: 15,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    marginRight: 14,
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
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    marginBottom: 16,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  summaryDivider: {
    width: 1,
    height: 30,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 11,
  },
  lastDetailRow: {
    marginBottom: 0,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginRight: 16,
  },
  detailValueWrap: {
    flex: 1,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  detailLink: {
    textAlign: 'right',
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  quickAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
  },
  quickActionDisabled: {
    opacity: 0.45,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bookingsHeader: {
    marginTop: 4,
  },
  bookingsHeading: {
    marginBottom: 12,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  bookingCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  bookingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  bookingTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  bookingMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  bookingMeta: {
    fontSize: 12.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  balanceLine: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  bookingDivider: {
    height: 1,
    marginTop: 4,
  },
  bookingActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bookingAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  bookingActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  depositAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  actionDisabled: {
    opacity: 0.45,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 28,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    justifyContent: 'flex-end',
  },
  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 10,
  },
  menuSheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 14,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '700',
  },
  menuDivider: {
    height: 1,
    marginVertical: 6,
    marginHorizontal: 14,
  },
  editorCard: {
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
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
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
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.65,
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    fontSize: 14,
  },
  notesInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  submitButton: {
    marginTop: 12,
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
  backButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 16,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
});
