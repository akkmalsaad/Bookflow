import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotificationPermissionPrompt } from '@/components/NotificationPermissionPrompt';
import { PriorityStack } from '@/components/PriorityStack';
import { StatCard } from '@/components/StatCard';
import { StatusPill } from '@/components/StatusPill';
import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { getNotificationPermissionStatus, syncTodayPriorityNotifications } from '@/lib/notifications';

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortDate(dateKey: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${dateKey}T00:00:00`));
}

export default function HomeScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { bookings, customers, financeEntries, invoices, reminders, notifications, currency, businessProfile } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const unreadNotificationCount = notifications.filter((notification) => !notification.isOpened).length;
  const hasUnreadNotifications = unreadNotificationCount > 0;
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const todayKey = getLocalDateKey(new Date());
  const currentMonthKey = todayKey.slice(0, 7);
  const todaysBookings = useMemo(() => bookings.filter((booking) => booking.date === todayKey), [bookings, todayKey]);
  const upcomingBookings = bookings.filter((booking) => booking.date >= todayKey && booking.status !== 'Cancelled');
  const nextBookingDate = upcomingBookings.reduce<string | null>(
    (soonest, booking) => (soonest === null || booking.date < soonest ? booking.date : soonest),
    null,
  );
  const upcomingDetail = nextBookingDate ? `Next: ${formatShortDate(nextBookingDate)}` : 'No bookings scheduled';
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));

  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const hasResolvedNotificationPromptRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (hasResolvedNotificationPromptRef.current) {
        syncTodayPriorityNotifications(todaysBookings).catch(() => {});
        return;
      }

      const status = await getNotificationPermissionStatus();
      if (cancelled) return;

      if (status === 'undetermined') {
        setShowNotificationPrompt(true);
      } else {
        hasResolvedNotificationPromptRef.current = true;
        syncTodayPriorityNotifications(todaysBookings).catch(() => {});
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [todaysBookings]);

  const handleAllowNotifications = () => {
    hasResolvedNotificationPromptRef.current = true;
    setShowNotificationPrompt(false);
    syncTodayPriorityNotifications(todaysBookings).catch(() => {});
  };

  const handleDismissNotificationPrompt = () => {
    hasResolvedNotificationPromptRef.current = true;
    setShowNotificationPrompt(false);
  };
  const currentMonthTransactions = financeEntries.filter((entry) => entry.date.startsWith(currentMonthKey));
  const totalRevenue = currentMonthTransactions
    .filter((entry) => entry.type === 'income')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const totalExpense = currentMonthTransactions
    .filter((entry) => entry.type === 'expense')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const totalIncome = totalRevenue - totalExpense;
  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView style={styles.screenScroll} contentContainerStyle={styles.content}>
      <View style={styles.topHeader}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.logoWrap,
              {
                backgroundColor: softSurface,
                borderColor: softBorder,
                shadowColor: softShadow,
              },
            ]}>
            <Image
              source={require('../../assets/images/bookflow-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>Dashboard</Text>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.65}
              numberOfLines={1}
              style={[styles.title, { color: palette.text }]}
            >
              Welcome {businessProfile.name}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => router.push('/notifications')}
          style={({ pressed }) => [
            styles.bellButton,
            {
              backgroundColor: softSurface,
              borderColor: softBorder,
              shadowColor: softShadow,
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
          {hasUnreadNotifications ? (
            <View style={[styles.notificationBadge, { backgroundColor: palette.danger, borderColor: softSurface }]}>
              <Text style={styles.notificationBadgeText}>{unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View
        style={[
          styles.panel,
          {
            backgroundColor: softSurface,
            borderColor: softBorder,
            shadowColor: softShadow,
          },
        ]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleGroup}>
            <View style={[styles.sectionIcon, { backgroundColor: isDarkMode ? '#29284B' : '#E9E8FF' }]}>
              <Ionicons name="flash" size={17} color={palette.accent} />
            </View>
            <View>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Today’s priority</Text>
            </View>
          </View>
          <Text style={[styles.link, { color: palette.accent }]}>View all</Text>
        </View>

        <PriorityStack bookings={todaysBookings} customerMap={customerMap} currencyFormatter={currencyFormatter} palette={palette} />
      </View>

      <View style={styles.snapshotHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Business snapshot</Text>
        </View>
        <View style={[styles.snapshotIcon, { backgroundColor: softInset }]}>
          <Ionicons name="analytics-outline" size={18} color={palette.accent} />
        </View>
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Revenue" value={currencyFormatter.format(totalRevenue)} detail="This month" tone="blue" isCurrency />
        <StatCard label="Upcoming" value={String(upcomingBookings.length)} detail={upcomingDetail} tone="green" />
        <StatCard label="Income" value={currencyFormatter.format(totalIncome)} detail="After expenses" tone="amber" isCurrency />
        <StatCard label="Expense" value={currencyFormatter.format(totalExpense)} detail="This month" tone="purple" isCurrency />
      </View>

      <View
        style={[
          styles.panel,
          {
            backgroundColor: softSurface,
            borderColor: softBorder,
            shadowColor: softShadow,
          },
        ]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleGroup}>
            <View style={[styles.sectionIcon, { backgroundColor: isDarkMode ? '#43341B' : '#FFF2D9' }]}>
              <Ionicons name="notifications-outline" size={18} color={palette.warning} />
            </View>
            <View>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Reminder queue</Text>
            </View>
          </View>
          <View style={[styles.softCountPill, { backgroundColor: softInset }]}>
            <Text style={[styles.link, { color: palette.accent }]}>{reminders.length} active</Text>
          </View>
        </View>

        <View style={styles.softList}>
          {reminders.slice(0, 2).map((reminder, index) => (
            <View
              key={reminder.id}
              style={[
                styles.reminderRow,
                { backgroundColor: softInset },
                index > 0 && styles.softRowSpacing,
              ]}>
              <View style={[styles.rowIcon, { backgroundColor: softSurface }]}>
                <Ionicons name="paper-plane-outline" size={17} color={palette.accent} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={[styles.reminderTitle, { color: palette.text }]}>{reminder.title}</Text>
                <Text style={[styles.reminderMeta, { color: palette.muter }]}>{reminder.dueDate} • {reminder.channel}</Text>
              </View>
              <StatusPill label={reminder.status} tone={reminder.status === 'sent' ? 'green' : reminder.status === 'failed' ? 'red' : 'amber'} />
            </View>
          ))}
        </View>
      </View>

      <View
        style={[
          styles.panel,
          {
            backgroundColor: softSurface,
            borderColor: softBorder,
            shadowColor: softShadow,
          },
        ]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleGroup}>
            <View style={[styles.sectionIcon, { backgroundColor: isDarkMode ? '#173A35' : '#DFF7EF' }]}>
              <Ionicons name="receipt-outline" size={18} color={palette.success} />
            </View>
            <View>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Recent invoices</Text>
            </View>
          </View>
          <Text style={[styles.link, { color: palette.accent }]}>Open</Text>
        </View>

        <View style={styles.softList}>
          {invoices.slice(0, 3).map((invoice, index) => {
            const customer = customerMap.get(invoice.customerId);
            const tone =
              invoice.status === 'Paid' ? 'green' : invoice.status === 'Accepted' ? 'blue' : invoice.status === 'Overdue' ? 'amber' : invoice.status === 'Declined' ? 'red' : 'gray';

            return (
              <View
                key={invoice.id}
                style={[
                  styles.invoiceRow,
                  { backgroundColor: softInset },
                  index > 0 && styles.softRowSpacing,
                ]}>
                <View style={[styles.rowIcon, { backgroundColor: softSurface }]}>
                  <Ionicons name="document-text-outline" size={17} color={palette.accent} />
                </View>
                <View style={styles.rowCopy}>
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
      </View>
      </ScrollView>
      <NotificationPermissionPrompt
        visible={showNotificationPrompt}
        onAllow={handleAllowNotifications}
        onDismiss={handleDismissNotificationPrompt}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
  },
  screenScroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 112,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  logoWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    marginRight: 14,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 6, height: 7 },
    elevation: 5,
  },
  logoImage: {
    width: 38,
    height: 38,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  bellButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 6, height: 7 },
    elevation: 5,
  },
  notificationBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginTop: 12,
    marginBottom: 10,
  },
  panel: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 20,
    marginBottom: 22,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 8, height: 10 },
    elevation: 5,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.25,
  },
  sectionSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  link: {
    fontWeight: '700',
    fontSize: 12,
  },
  snapshotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 2,
  },
  snapshotIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  softCountPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  softList: {
    width: '100%',
  },
  softRowSpacing: {
    marginTop: 10,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 66,
    padding: 11,
    borderRadius: 18,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
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
    alignItems: 'center',
    minHeight: 66,
    padding: 11,
    borderRadius: 18,
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
