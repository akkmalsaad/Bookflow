import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

export default function FinanceScreen() {
  const { isDarkMode } = useTheme();
  const { financeEntries, currency } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);

  const totalIncome = financeEntries
    .filter((entry) => entry.type === 'income')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const totalExpenses = financeEntries
    .filter((entry) => entry.type === 'expense')
    .reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.eyebrow, { color: palette.accent }]}>Finance</Text>
          <Text style={[styles.title, { color: palette.text }]}>Cash flow</Text>
        </View>
        <Pressable style={styles.primaryButton}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: isDarkMode ? '#142B3E' : '#EAFBF2' }]}>
          <Text style={[styles.statLabel, { color: isDarkMode ? '#B8D4FF' : '#4B5563' }]}>Income</Text>
          <Text style={[styles.statValue, { color: isDarkMode ? '#E2E8F0' : '#111827' }]}>{currencyFormatter.format(totalIncome)}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: isDarkMode ? '#2B1A1A' : '#FDECEC', marginRight: 0 }]}>
          <Text style={[styles.statLabel, { color: isDarkMode ? '#FDB8A8' : '#4B5563' }]}>Expense</Text>
          <Text style={[styles.statValue, { color: isDarkMode ? '#F8FAFC' : '#111827' }]}>{currencyFormatter.format(totalExpenses)}</Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: palette.text }]}>Recent entries</Text>
      <FlatList
        data={financeEntries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.entryCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.entryLeft}>
              <View style={[styles.iconBadge, item.type === 'income' ? styles.greenBadge : styles.redBadge]}>
                <Ionicons name={item.type === 'income' ? 'trending-up' : 'trending-down'} size={16} color="#fff" />
              </View>
              <View>
                <Text style={[styles.entryCategory, { color: palette.text }]}>{item.category}</Text>
                <Text style={[styles.entryDescription, { color: palette.muter }]}>{item.description}</Text>
              </View>
            </View>
            <View style={styles.entryRight}>
              <Text style={[styles.amount, item.type === 'income' ? styles.positive : styles.negative]}>
                {item.type === 'income' ? '+' : '-'}
                {currencyFormatter.format(item.amount)}
              </Text>
              <Text style={[styles.date, { color: palette.muter }]}>{item.date}</Text>
            </View>
          </View>
        )}
      />
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
    flexDirection: 'row',
    alignItems: 'center',
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    padding: 16,
    marginRight: 12,
  },
  greenCard: {
    backgroundColor: '#EAFBF2',
  },
  redCard: {
    backgroundColor: '#FDECEC',
    marginRight: 0,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#4B5563',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  list: {
    paddingBottom: 100,
  },
  entryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#101828',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  entryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  greenBadge: {
    backgroundColor: '#1DAA72',
  },
  redBadge: {
    backgroundColor: '#E11D48',
  },
  entryCategory: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  entryDescription: {
    fontSize: 12,
  },
  entryRight: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  positive: {
    color: '#117A4C',
  },
  negative: {
    color: '#B42318',
  },
  date: {
    fontSize: 12,
    color: '#6B7280',
  },
});
