import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

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

export default function CustomerProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ customerId?: string }>();
  const { isDarkMode } = useTheme();
  const { customers, bookings } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const customer = customers.find((item) => item.id === params.customerId);
  const customerBookings = customer ? bookings.filter((item) => item.customerId === customer.id) : [];

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/customers');
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
          <View style={[styles.avatar, { backgroundColor: palette.iconWrap }]}>
            <Text style={[styles.avatarText, { color: palette.accent }]}>{customer.name.charAt(0)}</Text>
          </View>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>Customer profile</Text>
            <Text style={[styles.title, { color: palette.text }]}>{customer.name}</Text>
          </View>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: palette.surface, borderColor: palette.border, shadowColor: isDarkMode ? '#020617' : '#101828' },
          ]}>
          <Text style={[styles.sectionLabel, { color: palette.muter }]}>Contact details</Text>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Name</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{getProfileValue(customer.name)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Phone</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{getProfileValue(customer.phone)}</Text>
          </View>
          <View style={[styles.detailRow, styles.lastDetailRow]}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Email</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{getProfileValue(customer.email)}</Text>
          </View>
        </View>

        {customerBookings.length > 0 ? (
          customerBookings.map((booking) => (
            <View
              key={booking.id}
              style={[
                styles.card,
                { backgroundColor: palette.surface, borderColor: palette.border, shadowColor: isDarkMode ? '#020617' : '#101828' },
              ]}>
              <Text style={[styles.sectionLabel, { color: palette.muter }]}>Package</Text>
              <Text style={[styles.packageName, { color: palette.text }]}>{booking.packageName}</Text>

              <View style={[styles.divider, { backgroundColor: palette.border }]} />

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: palette.muter }]}>Event date</Text>
                <Text style={[styles.detailValue, { color: palette.text }]}>{formatEventDate(booking.date)}</Text>
              </View>
              <View style={[styles.detailRow, styles.lastDetailRow]}>
                <Text style={[styles.detailLabel, { color: palette.muter }]}>Event location</Text>
                <Text style={[styles.detailValue, { color: palette.text }]}>{getProfileValue(booking.location)}</Text>
              </View>
            </View>
          ))
        ) : (
          <View
            style={[
              styles.card,
              styles.emptyCard,
              { backgroundColor: palette.surface, borderColor: palette.border, shadowColor: isDarkMode ? '#020617' : '#101828' },
            ]}>
            <Ionicons name="calendar-outline" size={22} color={palette.muter} />
            <Text style={[styles.emptyText, { color: palette.muter }]}>No bookings yet for this customer.</Text>
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
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontWeight: '800',
    fontSize: 22,
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
  packageName: {
    fontSize: 20,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    marginVertical: 18,
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
