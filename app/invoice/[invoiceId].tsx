import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusPill } from '@/components/StatusPill';
import { getCurrencyFormatter, Invoice, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

function getInvoiceTone(status: Invoice['status']) {
  if (status === 'Paid') return 'green';
  if (status === 'Accepted') return 'blue';
  if (status === 'Overdue') return 'amber';
  if (status === 'Declined' || status === 'Cancelled') return 'red';
  return 'gray';
}

function formatEventDate(date?: string) {
  if (!date) return 'Not specified';

  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return date;

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsedDate);
}

function getProfileValue(value: string) {
  return value.trim() || 'Not provided';
}

export default function InvoiceAcceptanceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ invoiceId?: string }>();
  const { isDarkMode } = useTheme();
  const { invoices, customers, bookings, packages, businessProfile, updateInvoiceStatus, currency } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const invoice = invoices.find((item) => item.id === params.invoiceId);
  const customer = invoice ? customers.find((person) => person.id === invoice.customerId) : undefined;
  const booking = invoice ? bookings.find((item) => item.id === invoice.bookingId) : undefined;
  const packageName = invoice?.serviceName ?? booking?.packageName;
  const packageOption = packages.find((item) => item.name === packageName)
    ?? packages.find((item) => item.price === invoice?.amount);
  const packageDetails = invoice?.packageDetails ?? packageOption?.details ?? 'No package description available.';
  const eventLocation = invoice?.eventLocation ?? booking?.location ?? 'Not specified';
  const eventDate = invoice?.eventDate ?? booking?.date;
  const eventStartTime = invoice?.eventStartTime ?? booking?.startTime ?? invoice?.eventTime ?? booking?.time ?? 'Not specified';
  const eventEndTime = invoice?.eventEndTime ?? booking?.endTime ?? 'Not specified';

  if (!invoice || !customer) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
        <View style={styles.notFoundWrap}>
          <Text style={[styles.title, { color: palette.text }]}>Invoice not found</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const handleAction = (status: 'Accepted' | 'Declined') => {
    updateInvoiceStatus(invoice.id, status);
    router.back();
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>Invoice details</Text>
            <Text style={[styles.title, { color: palette.text }]}>{invoice.id}</Text>
          </View>
          <StatusPill label={invoice.status} tone={getInvoiceTone(invoice.status)} />
        </View>

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, shadowColor: isDarkMode ? '#020617' : '#101828' }]}>
          <Text style={[styles.sectionLabel, { color: palette.muter }]}>Business details</Text>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Business name</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{getProfileValue(businessProfile.name)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Contact number</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{getProfileValue(businessProfile.phone)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Email</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{getProfileValue(businessProfile.email)}</Text>
          </View>
          <View style={[styles.detailRow, styles.lastDetailRow]}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Address</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{getProfileValue(businessProfile.address)}</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, shadowColor: isDarkMode ? '#020617' : '#101828' }]}>
          <Text style={[styles.sectionLabel, { color: palette.muter }]}>Bill to</Text>
          <Text style={[styles.customerName, { color: palette.text }]}>{customer.name}</Text>
          <Text style={[styles.customerMeta, { color: palette.muter }]}>{customer.email}</Text>
          {customer.phone ? <Text style={[styles.customerMeta, { color: palette.muter }]}>{customer.phone}</Text> : null}

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          <Text style={[styles.sectionLabel, { color: palette.muter }]}>Amount</Text>
          <Text style={[styles.amount, { color: palette.text }]}>{currencyFormatter.format(invoice.amount)}</Text>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Issued</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{formatEventDate(invoice.sentAt)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Due date</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{formatEventDate(invoice.dueDate)}</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, shadowColor: isDarkMode ? '#020617' : '#101828' }]}>
          <Text style={[styles.sectionLabel, { color: palette.muter }]}>Package</Text>
          <Text style={[styles.packageName, { color: palette.text }]}>{packageName ?? 'Custom service'}</Text>
          <Text style={[styles.packageDetails, { color: palette.muter }]}>{packageDetails}</Text>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          <Text style={[styles.sectionLabel, { color: palette.muter }]}>Event details</Text>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Location</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{eventLocation}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Date</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{formatEventDate(eventDate)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Start time</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{eventStartTime}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Finish time</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{eventEndTime}</Text>
          </View>

          {invoice.terms ? (
            <View style={[styles.termsBox, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
              <Text style={[styles.termsLabel, { color: palette.muter }]}>Information & terms</Text>
              <Text style={[styles.termsText, { color: palette.text }]}>{invoice.terms}</Text>
            </View>
          ) : null}
        </View>

        {invoice.status !== 'Accepted' && invoice.status !== 'Paid' && (
          <View style={styles.actions}>
            <Pressable style={styles.declineButton} onPress={() => handleAction('Declined')}>
              <Ionicons name="close-circle-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>Decline</Text>
            </Pressable>
            <Pressable style={styles.acceptButton} onPress={() => handleAction('Accepted')}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>Accept</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
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
  notFoundWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  eyebrow: {
    textTransform: 'uppercase',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  customerName: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  customerMeta: {
    fontSize: 14,
    marginBottom: 3,
  },
  divider: {
    height: 1,
    marginVertical: 18,
  },
  amount: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 16,
  },
  packageName: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 7,
  },
  packageDetails: {
    fontSize: 14,
    lineHeight: 21,
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
  detailValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  termsBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  termsLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  termsText: {
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#E11D48',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
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
