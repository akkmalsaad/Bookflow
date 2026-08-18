import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PriorityStack } from '@/components/PriorityStack';
import { StatCard } from '@/components/StatCard';
import { StatusPill } from '@/components/StatusPill';
import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { bookings, customers, invoices, reminders, notifications, currency } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const unreadNotificationCount = notifications.filter((notification) => !notification.isOpened).length;
  const hasUnreadNotifications = unreadNotificationCount > 0;
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const todayKey = getLocalDateKey(new Date());
  const todaysBookings = bookings.filter((booking) => booking.date === todayKey);
  const upcomingBookings = bookings.filter((booking) => booking.date >= todayKey && booking.status !== 'Cancelled');
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const totalRevenue = bookings.reduce((sum, booking) => sum + booking.price, 0);
  const totalIncome = invoices.filter((invoice) => invoice.status === 'Paid' || invoice.status === 'Accepted').reduce((sum, invoice) => sum + invoice.amount, 0);
  const totalExpense = invoices.filter((invoice) => invoice.status === 'Overdue' || invoice.status === 'Declined').reduce((sum, invoice) => sum + invoice.amount, 0);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView style={styles.screenScroll} contentContainerStyle={styles.content}>
      <View style={styles.topHeader}>
        <View style={styles.headerLeft}>
          <View style={[styles.logoWrap, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Image
              source={require('../../assets/images/bookflow-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <View>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>Dashboard</Text>
            <Text style={[styles.title, { color: palette.text }]}>Bookflow overview</Text>
          </View>
        </View>
        <Pressable
          onPress={() => router.push('/notifications')}
          style={({ pressed }) => [
            styles.bellButton,
            {
              backgroundColor: palette.surface,
              shadowColor: isDarkMode ? '#020617' : '#101828',
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={hasUnreadNotifications ? `Notifications, ${unreadNotificationCount} unread` : 'Notifications'}>
          <Ionicons
            name={hasUnreadNotifications ? 'notifications' : 'notifications-outline'}
            size={22}
            color={hasUnreadNotifications ? palette.danger : palette.text}
          />
        </Pressable>
      </View>

      <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Today’s priority</Text>
          <Text style={[styles.link, { color: palette.accent }]}>View all</Text>
        </View>

        <PriorityStack bookings={todaysBookings} customerMap={customerMap} currencyFormatter={currencyFormatter} palette={palette} />
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Revenue" value={currencyFormatter.format(totalRevenue)} detail="This month" tone="blue" isCurrency />
        <StatCard label="Upcoming" value={String(upcomingBookings.length)} detail="Bookings from today" tone="green" />
        <StatCard label="Income" value={currencyFormatter.format(totalIncome)} detail="Collected" tone="amber" isCurrency />
        <StatCard label="Expense" value={currencyFormatter.format(totalExpense)} detail="Outstanding" tone="purple" isCurrency />
      </View>

      <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Reminder queue</Text>
          <Text style={[styles.link, { color: palette.accent }]}>{reminders.length} active</Text>
        </View>

        {reminders.slice(0, 2).map((reminder) => (
          <View key={reminder.id} style={[styles.reminderRow, { borderBottomColor: palette.border }]}>
            <View>
              <Text style={[styles.reminderTitle, { color: palette.text }]}>{reminder.title}</Text>
              <Text style={[styles.reminderMeta, { color: palette.muter }]}>{reminder.dueDate} • {reminder.channel}</Text>
            </View>
            <StatusPill label={reminder.status} tone={reminder.status === 'sent' ? 'green' : reminder.status === 'failed' ? 'red' : 'amber'} />
          </View>
        ))}
      </View>

      <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Recent invoices</Text>
          <Text style={[styles.link, { color: palette.accent }]}>Open</Text>
        </View>

        {invoices.slice(0, 3).map((invoice) => {
          const customer = customerMap.get(invoice.customerId);
          const tone =
            invoice.status === 'Paid' ? 'green' : invoice.status === 'Accepted' ? 'blue' : invoice.status === 'Overdue' ? 'amber' : invoice.status === 'Declined' ? 'red' : 'gray';

          return (
            <View key={invoice.id} style={[styles.invoiceRow, { borderBottomColor: palette.border }]}>
              <View>
                <Text style={[styles.invoiceId, { color: palette.text }]}>{invoice.id}</Text>
                <Text style={[styles.invoiceCustomer, { color: palette.muter }]}>{customer?.name ?? 'Unknown customer'}</Text>
              </View>
              <View style={styles.invoiceMeta}>
                <Text style={[styles.amount, { color: palette.text }]}>{currencyFormatter.format(invoice.amount)}</Text>
                <StatusPill label={invoice.status} tone={tone} />
              </View>
            </View>
          );
        })}
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenScroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 90,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 34,
    height: 34,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
  },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 18,
    marginBottom: 18,
  },
  panel: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 18,
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  link: {
    fontWeight: '700',
    fontSize: 12,
  },
  reminderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  reminderTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  reminderMeta: {
    fontSize: 12,
  },
  invoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  invoiceId: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  invoiceCustomer: {
    fontSize: 12,
    color: '#6B7280',
  },
  invoiceMeta: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
});
