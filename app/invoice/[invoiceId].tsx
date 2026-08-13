import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function InvoiceAcceptanceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ invoiceId?: string }>();
  const { isDarkMode } = useTheme();
  const { invoices, customers, updateInvoiceStatus } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const invoice = invoices.find((item) => item.id === params.invoiceId);
  const customer = invoice ? customers.find((person) => person.id === invoice.customerId) : undefined;

  if (!invoice || !customer) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}> 
        <Text style={[styles.title, { color: palette.text }]}>Invoice not found</Text>
      </SafeAreaView>
    );
  }

  const handleAction = (status: 'Accepted' | 'Declined') => {
    updateInvoiceStatus(invoice.id, status);
    router.back();
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}> 
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: palette.accent }]}>Invoice</Text>
        <Text style={[styles.title, { color: palette.text }]}>{invoice.id}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, shadowColor: isDarkMode ? '#020617' : '#101828' }]}> 
        <Text style={[styles.customerName, { color: palette.text }]}>{customer.name}</Text>
        <Text style={[styles.customerMeta, { color: palette.muter }]}>{customer.email}</Text>
        <Text style={[styles.amount, { color: palette.text }]}>{currency.format(invoice.amount)}</Text>
        <Text style={[styles.dueDate, { color: palette.muter }]}>Due: {invoice.dueDate}</Text>
      </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F7FB',
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  header: {
    marginBottom: 20,
  },
  eyebrow: {
    color: '#4F46E5',
    textTransform: 'uppercase',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: {
    color: '#111827',
    fontSize: 30,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 22,
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    marginBottom: 22,
  },
  customerName: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  customerMeta: {
    color: '#6B7280',
    fontSize: 14,
    marginBottom: 16,
  },
  amount: {
    color: '#111827',
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 8,
  },
  dueDate: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
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
});
