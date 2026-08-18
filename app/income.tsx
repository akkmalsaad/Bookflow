import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

const CATEGORY_COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6', '#EF4444'];

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(new Date(year, month - 1, 1));
}

export default function IncomeScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { financeEntries, currency } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);

  const incomeEntries = useMemo(
    () =>
      financeEntries
        .filter((entry) => entry.type === 'income')
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [financeEntries],
  );

  const totalIncome = incomeEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const averageIncome = incomeEntries.length ? totalIncome / incomeEntries.length : 0;

  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    incomeEntries.forEach((entry) => {
      totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.amount);
    });

    return Array.from(totals.entries())
      .map(([category, amount], index) => ({
        category,
        amount,
        percent: totalIncome > 0 ? amount / totalIncome : 0,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [incomeEntries, totalIncome]);

  const monthlyTrend = useMemo(() => {
    const totals = new Map<string, number>();
    incomeEntries.forEach((entry) => {
      const monthKey = entry.date.slice(0, 7);
      totals.set(monthKey, (totals.get(monthKey) ?? 0) + entry.amount);
    });

    const sortedKeys = Array.from(totals.keys()).sort();
    const recentKeys = sortedKeys.slice(-6);
    const maxAmount = Math.max(...recentKeys.map((key) => totals.get(key) ?? 0), 1);

    return recentKeys.map((key) => ({
      month: key,
      amount: totals.get(key) ?? 0,
      ratio: (totals.get(key) ?? 0) / maxAmount,
    }));
  }, [incomeEntries]);

  const topCategory = categoryBreakdown[0];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Back to Finance">
          <Ionicons name="arrow-back" size={22} color={palette.text} />
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: palette.accent }]}>Finance</Text>
          <Text style={[styles.title, { color: palette.text }]}>Income breakdown</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, { backgroundColor: isDarkMode ? '#142B3E' : '#EAFBF2' }]}>
          <Text style={[styles.heroLabel, { color: isDarkMode ? '#B8D4FF' : '#4B5563' }]}>Total income</Text>
          <Text style={[styles.heroValue, { color: isDarkMode ? '#E2E8F0' : '#111827' }]}>
            {currencyFormatter.format(totalIncome)}
          </Text>
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatLabel, { color: isDarkMode ? '#B8D4FF' : '#4B5563' }]}>Transactions</Text>
              <Text style={[styles.heroStatValue, { color: isDarkMode ? '#E2E8F0' : '#111827' }]}>{incomeEntries.length}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatLabel, { color: isDarkMode ? '#B8D4FF' : '#4B5563' }]}>Average</Text>
              <Text style={[styles.heroStatValue, { color: isDarkMode ? '#E2E8F0' : '#111827' }]}>
                {currencyFormatter.format(averageIncome)}
              </Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatLabel, { color: isDarkMode ? '#B8D4FF' : '#4B5563' }]}>Top source</Text>
              <Text style={[styles.heroStatValue, { color: isDarkMode ? '#E2E8F0' : '#111827' }]} numberOfLines={1}>
                {topCategory?.category ?? '—'}
              </Text>
            </View>
          </View>
        </View>

        {incomeEntries.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Ionicons name="trending-up-outline" size={30} color={palette.muter} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>No income recorded yet</Text>
            <Text style={[styles.emptyMessage, { color: palette.muter }]}>
              Income transactions you add will appear here with a full breakdown.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>By category</Text>
            <View style={[styles.chartCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <View style={styles.stackedBar}>
                {categoryBreakdown.map((item) => (
                  <View
                    key={item.category}
                    style={{ flex: Math.max(item.percent, 0.01), backgroundColor: item.color }}
                  />
                ))}
              </View>
              <View style={styles.legend}>
                {categoryBreakdown.map((item) => (
                  <View key={item.category} style={styles.legendRow}>
                    <View style={styles.legendLeft}>
                      <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                      <Text style={[styles.legendLabel, { color: palette.text }]} numberOfLines={1}>
                        {item.category}
                      </Text>
                    </View>
                    <View style={styles.legendRight}>
                      <Text style={[styles.legendPercent, { color: palette.muter }]}>{Math.round(item.percent * 100)}%</Text>
                      <Text style={[styles.legendAmount, { color: palette.text }]}>{currencyFormatter.format(item.amount)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: palette.text }]}>Monthly trend</Text>
            <View style={[styles.chartCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <View style={styles.barChart}>
                {monthlyTrend.map((item) => (
                  <View key={item.month} style={styles.barColumn}>
                    <Text style={[styles.barValue, { color: palette.muter }]} numberOfLines={1}>
                      {currencyFormatter.format(item.amount).replace(/\.00$/, '')}
                    </Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { height: `${Math.max(item.ratio * 100, 4)}%`, backgroundColor: palette.accent },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barLabel, { color: palette.muter }]}>{formatMonthLabel(item.month)}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: palette.text }]}>Transactions</Text>
            <View style={styles.list}>
              {incomeEntries.map((item) => (
                <View key={item.id} style={[styles.entryCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                  <View style={styles.entryLeft}>
                    <View style={styles.iconBadge}>
                      <Ionicons name="trending-up" size={16} color="#fff" />
                    </View>
                    <View style={styles.entryCopy}>
                      <Text style={[styles.entryCategory, { color: palette.text }]}>{item.category}</Text>
                      <Text style={[styles.entryDescription, { color: palette.muter }]} numberOfLines={1}>
                        {item.description}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.entryRight}>
                    <Text style={styles.amount}>+{currencyFormatter.format(item.amount)}</Text>
                    <Text style={[styles.date, { color: palette.muter }]}>{item.date}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    marginLeft: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 40,
  },
  heroCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 22,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroValue: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 18,
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroStat: {
    flex: 1,
  },
  heroStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroStatValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 12,
  },
  chartCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    marginBottom: 22,
  },
  stackedBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    marginBottom: 16,
  },
  legend: {
    gap: 12,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 9,
  },
  legendLabel: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  legendRight: {
    alignItems: 'flex-end',
  },
  legendPercent: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  legendAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 160,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barValue: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 6,
  },
  barTrack: {
    width: 22,
    height: 100,
    borderRadius: 8,
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 8,
  },
  barLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
  },
  list: {
    gap: 12,
  },
  entryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
  },
  entryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: '#1DAA72',
  },
  entryCopy: {
    flex: 1,
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
    color: '#117A4C',
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
  },
  emptyCard: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    padding: 28,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 12,
  },
  emptyMessage: {
    fontSize: 13,
    marginTop: 5,
    textAlign: 'center',
  },
});
