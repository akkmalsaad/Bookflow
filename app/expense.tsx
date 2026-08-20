import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FinanceEntry, getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

const CATEGORY_COLORS = ['#E11D48', '#F59E0B', '#8B5CF6', '#0EA5E9', '#EC4899', '#10B981', '#F97316', '#4F46E5'];
const ICON_RED = '#E11D48';
const AMOUNT_RED = '#B42318';
const GOOD_GREEN = '#1DAA72';

function getMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function shiftMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(new Date(year, month - 1, 1));
}

function formatEntryDate(dateKey: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${dateKey}T00:00:00`));
}

function softTone(isDarkMode: boolean) {
  return {
    surface: isDarkMode ? '#141E33' : '#EEF2FA',
    surfaceRaised: isDarkMode ? '#182444' : '#F5F8FD',
    shadowDark: isDarkMode ? '#03050A' : '#B6C2D6',
    shadowLight: isDarkMode ? '#26314D' : '#FFFFFF',
  };
}

// Two stacked shadow layers (dark, offset down-right; light, offset up-left) sit behind the
// content layer, which shares their exact bounds and hides their fill — only the soft glow shows.
function SoftCard({
  isDarkMode,
  style,
  contentStyle,
  children,
}: {
  isDarkMode: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const tone = softTone(isDarkMode);

  return (
    <View style={[styles.softWrapper, style]}>
      <View
        style={[
          styles.softShadowLayer,
          { backgroundColor: tone.surface, shadowColor: tone.shadowDark, shadowOffset: { width: 10, height: 12 } },
        ]}
      />
      <View
        style={[
          styles.softShadowLayer,
          { backgroundColor: tone.surface, shadowColor: tone.shadowLight, shadowOffset: { width: -8, height: -10 } },
        ]}
      />
      <View style={[styles.softContent, { backgroundColor: tone.surface }, contentStyle]}>{children}</View>
    </View>
  );
}

// Lighter single-shadow surface for repeated rows (transaction list), where a double-shadow
// stack per item would be wasteful — still reads as soft UI via matching tone + large radius.
function SoftRow({
  isDarkMode,
  style,
  children,
}: {
  isDarkMode: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const tone = softTone(isDarkMode);

  return (
    <View
      style={[
        styles.softRow,
        {
          backgroundColor: tone.surfaceRaised,
          shadowColor: tone.shadowDark,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export default function ExpenseScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { financeEntries, currency } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const tone = softTone(isDarkMode);

  const expenseEntries = useMemo(
    () =>
      financeEntries
        .filter((entry) => entry.type === 'expense')
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [financeEntries],
  );

  const totalExpense = expenseEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const averageExpense = expenseEntries.length ? totalExpense / expenseEntries.length : 0;

  const highestEntry = useMemo(
    () =>
      expenseEntries.reduce<FinanceEntry | null>(
        (max, entry) => (!max || entry.amount > max.amount ? entry : max),
        null,
      ),
    [expenseEntries],
  );

  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    expenseEntries.forEach((entry) => {
      totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.amount);
    });

    return Array.from(totals.entries())
      .map(([category, amount], index) => ({
        category,
        amount,
        percent: totalExpense > 0 ? amount / totalExpense : 0,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenseEntries, totalExpense]);

  const monthlyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    expenseEntries.forEach((entry) => {
      const monthKey = entry.date.slice(0, 7);
      totals.set(monthKey, (totals.get(monthKey) ?? 0) + entry.amount);
    });
    return totals;
  }, [expenseEntries]);

  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => shiftMonths(now, index - 5));
    const currentMonthKey = getMonthKey(now);
    const maxAmount = Math.max(...months.map((date) => monthlyTotals.get(getMonthKey(date)) ?? 0), 1);

    return months.map((date) => {
      const key = getMonthKey(date);
      const amount = monthlyTotals.get(key) ?? 0;
      return {
        month: key,
        amount,
        ratio: amount / maxAmount,
        isCurrent: key === currentMonthKey,
      };
    });
  }, [monthlyTotals]);

  const monthlyDelta = useMemo(() => {
    const now = new Date();
    const currentAmount = monthlyTotals.get(getMonthKey(now)) ?? 0;
    const previousAmount = monthlyTotals.get(getMonthKey(shiftMonths(now, -1))) ?? 0;

    if (previousAmount === 0) {
      return currentAmount > 0 ? { kind: 'new' as const } : null;
    }

    return { kind: 'change' as const, value: ((currentAmount - previousAmount) / previousAmount) * 100 };
  }, [monthlyTotals]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: tone.surfaceRaised, shadowColor: tone.shadowDark, opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Back to Finance">
          <Ionicons name="arrow-back" size={22} color={palette.text} />
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: palette.accent }]}>Finance</Text>
          <Text style={[styles.title, { color: palette.text }]}>Expense breakdown</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SoftCard isDarkMode={isDarkMode} style={styles.heroOuter}>
          <View style={styles.heroTopRow}>
            <Text style={[styles.heroLabel, { color: palette.muter }]}>Total expense</Text>
            {monthlyDelta ? (
              <View
                style={[
                  styles.deltaChip,
                  {
                    backgroundColor:
                      monthlyDelta.kind === 'new' || monthlyDelta.value >= 0
                        ? 'rgba(225, 29, 72, 0.14)'
                        : 'rgba(29, 170, 114, 0.16)',
                  },
                ]}>
                <Ionicons
                  name={monthlyDelta.kind === 'new' || monthlyDelta.value >= 0 ? 'arrow-up' : 'arrow-down'}
                  size={11}
                  color={monthlyDelta.kind === 'new' || monthlyDelta.value >= 0 ? ICON_RED : GOOD_GREEN}
                />
                <Text
                  style={[
                    styles.deltaChipText,
                    { color: monthlyDelta.kind === 'new' || monthlyDelta.value >= 0 ? ICON_RED : GOOD_GREEN },
                  ]}>
                  {monthlyDelta.kind === 'new' ? 'New this month' : `${Math.abs(Math.round(monthlyDelta.value))}% vs last month`}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.heroValue, { color: palette.text }]}>{currencyFormatter.format(totalExpense)}</Text>
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatLabel, { color: palette.muter }]}>Transactions</Text>
              <Text style={[styles.heroStatValue, { color: palette.text }]}>{expenseEntries.length}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatLabel, { color: palette.muter }]}>Average</Text>
              <Text style={[styles.heroStatValue, { color: palette.text }]}>{currencyFormatter.format(averageExpense)}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatLabel, { color: palette.muter }]}>Highest</Text>
              <Text style={[styles.heroStatValue, { color: palette.text }]} numberOfLines={1}>
                {highestEntry ? currencyFormatter.format(highestEntry.amount) : '—'}
              </Text>
            </View>
          </View>
        </SoftCard>

        {expenseEntries.length === 0 ? (
          <SoftCard isDarkMode={isDarkMode} contentStyle={styles.emptyContent}>
            <Ionicons name="trending-down-outline" size={30} color={palette.muter} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>No expenses recorded yet</Text>
            <Text style={[styles.emptyMessage, { color: palette.muter }]}>
              Expense transactions you add will appear here with a full breakdown.
            </Text>
          </SoftCard>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>By category</Text>
            <SoftCard isDarkMode={isDarkMode} style={styles.chartOuter}>
              <View style={[styles.stackedBarTrack, { backgroundColor: isDarkMode ? '#0E1729' : '#E4EAF5' }]}>
                <View style={styles.stackedBar}>
                  {categoryBreakdown.map((item) => (
                    <View
                      key={item.category}
                      style={{ flex: Math.max(item.percent, 0.01), backgroundColor: item.color }}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.legend}>
                {categoryBreakdown.map((item, index) => (
                  <View key={item.category} style={styles.legendRow}>
                    <View style={styles.legendLeft}>
                      <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                      <Text style={[styles.legendLabel, { color: palette.text }]} numberOfLines={1}>
                        {item.category}
                      </Text>
                      {index === 0 ? (
                        <View style={[styles.topBadge, { backgroundColor: 'rgba(225, 29, 72, 0.14)' }]}>
                          <Text style={[styles.topBadgeText, { color: ICON_RED }]}>Top</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.legendRight}>
                      <Text style={[styles.legendPercent, { color: palette.muter }]}>{Math.round(item.percent * 100)}%</Text>
                      <Text style={[styles.legendAmount, { color: palette.text }]}>{currencyFormatter.format(item.amount)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </SoftCard>

            <Text style={[styles.sectionTitle, { color: palette.text }]}>Monthly trend</Text>
            <SoftCard isDarkMode={isDarkMode} style={styles.chartOuter}>
              <View style={styles.barChart}>
                {monthlyTrend.map((item) => (
                  <View key={item.month} style={styles.barColumn}>
                    <Text style={[styles.barValue, { color: item.isCurrent ? palette.text : palette.muter }]} numberOfLines={1}>
                      {item.amount > 0 ? currencyFormatter.format(item.amount).replace(/\.00$/, '') : ''}
                    </Text>
                    <View style={[styles.barTrack, { backgroundColor: isDarkMode ? '#0E1729' : '#E4EAF5' }]}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: `${Math.max(item.ratio * 100, 4)}%`,
                            backgroundColor: item.isCurrent ? palette.danger : `${palette.danger}45`,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.barLabel,
                        { color: item.isCurrent ? palette.danger : palette.muter, fontWeight: item.isCurrent ? '800' : '700' },
                      ]}>
                      {formatMonthLabel(item.month)}
                    </Text>
                  </View>
                ))}
              </View>
            </SoftCard>

            <Text style={[styles.sectionTitle, { color: palette.text }]}>Transactions</Text>
            <View style={styles.list}>
              {expenseEntries.map((item) => (
                <SoftRow key={item.id} isDarkMode={isDarkMode} style={styles.entryCard}>
                  <View style={styles.entryLeft}>
                    <View style={[styles.iconBadge, { backgroundColor: isDarkMode ? 'rgba(225, 29, 72, 0.2)' : 'rgba(225, 29, 72, 0.12)' }]}>
                      <Ionicons name="trending-down" size={16} color={ICON_RED} />
                    </View>
                    <View style={styles.entryCopy}>
                      <Text style={[styles.entryCategory, { color: palette.text }]}>{item.category}</Text>
                      <Text style={[styles.entryDescription, { color: palette.muter }]} numberOfLines={1}>
                        {item.description}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.entryRight}>
                    <Text style={styles.amount}>-{currencyFormatter.format(item.amount)}</Text>
                    <Text style={[styles.date, { color: palette.muter }]}>{formatEntryDate(item.date)}</Text>
                  </View>
                </SoftRow>
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
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 4, height: 6 },
    elevation: 4,
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
  softWrapper: {
    position: 'relative',
    borderRadius: 28,
    marginBottom: 22,
  },
  softShadowLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  softContent: {
    borderRadius: 28,
    padding: 22,
  },
  softRow: {
    borderRadius: 22,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroOuter: {
    marginBottom: 22,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  deltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    gap: 4,
  },
  deltaChipText: {
    fontSize: 11,
    fontWeight: '800',
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
  chartOuter: {
    marginBottom: 22,
  },
  stackedBarTrack: {
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  stackedBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
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
  topBadge: {
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 8,
  },
  topBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
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
    borderRadius: 10,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 10,
  },
  barLabel: {
    fontSize: 11,
    marginTop: 8,
  },
  list: {
    gap: 12,
  },
  entryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  entryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
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
    color: AMOUNT_RED,
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
  },
  emptyContent: {
    alignItems: 'center',
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
