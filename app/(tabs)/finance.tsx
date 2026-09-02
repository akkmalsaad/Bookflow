import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddTransactionModal } from '@/components/AddTransactionModal';
import { SectionHeader } from '@/components/SectionHeader';
import { BusinessInsightsPromoCard } from '@/components/business-insights/BusinessInsightsPromoCard';
import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { useRequirePro } from '@/context/subscription-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { getFinancialMetrics } from '@/lib/financial-metrics';


export default function FinanceScreen() {
  const router = useRouter();
  const requireBusinessInsightsPro = useRequirePro('/business-insights');
  const { isDarkMode } = useTheme();
  const { financeEntries, invoices, payments, currency } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const [showComposer, setShowComposer] = useState(false);
  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';

  const financialMetrics = getFinancialMetrics({ financeEntries, invoices, payments });

  const openBusinessInsights = () => {
    if (requireBusinessInsightsPro()) router.push('/business-insights');
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleGroup}>
          <View style={[styles.headerIcon, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <Ionicons name="wallet-outline" size={23} color={palette.accent} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>Finance · All time</Text>
            <Text style={[styles.title, { color: palette.text }]}>Cash flow</Text>
          </View>
        </View>
        <Pressable
          style={[styles.primaryButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]}
          onPress={() => setShowComposer(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <Pressable
          onPress={() => router.push('/income')}
          style={({ pressed }) => [
            styles.statCard,
            { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="View income breakdown">
          <View style={styles.statLabelRow}>
            <Text style={[styles.statLabel, { color: palette.muter }]}>Income</Text>
            <Ionicons name="chevron-forward" size={15} color={palette.muter} />
          </View>
          <Text
            style={[styles.statValue, { color: palette.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}>
            {currencyFormatter.format(financialMetrics.revenue)}
          </Text>
          <Text style={[styles.statDetail, { color: palette.success }]} numberOfLines={1}>
            {financialMetrics.revenue > 0 ? 'Received' : 'Nothing received yet'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/expense')}
          style={({ pressed }) => [
            styles.statCard,
            { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow, marginRight: 0, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="View expense breakdown">
          <View style={styles.statLabelRow}>
            <Text style={[styles.statLabel, { color: palette.muter }]}>Expenses</Text>
            <Ionicons name="chevron-forward" size={15} color={palette.muter} />
          </View>
          <Text
            style={[styles.statValue, { color: palette.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}>
            {currencyFormatter.format(financialMetrics.expenses)}
          </Text>
          <Text
            style={[styles.statDetail, { color: financialMetrics.expenses > 0 ? palette.danger : palette.muter }]}
            numberOfLines={1}>
            {financialMetrics.expenses > 0 ? 'Recorded' : 'No expenses'}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={financeEntries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <BusinessInsightsPromoCard onPress={openBusinessInsights} />
            <View style={styles.sectionHeader}>
              <SectionHeader
                icon="swap-vertical-outline"
                title="Recent entries"
                rightElement={
                  <View style={[styles.entryCount, { backgroundColor: softInset }]}>
                    <Text style={[styles.entryCountText, { color: palette.accent }]}>{financeEntries.length}</Text>
                  </View>
                }
              />
            </View>
          </>
        }
        renderItem={({ item }) => (
          <View style={[styles.entryCard, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <View style={[styles.entryAccent, { backgroundColor: item.type === 'income' ? palette.success : palette.danger }]} />
            <View style={styles.entryCopy}>
              <Text style={[styles.entryCategory, { color: palette.text }]} numberOfLines={1}>{item.category}</Text>
              <Text style={[styles.entryDescription, { color: palette.muter }]} numberOfLines={2}>{item.description}</Text>
            </View>
            <View style={styles.entryRight}>
              <Text
                style={[styles.amount, item.type === 'income' ? styles.positive : styles.negative]}
                numberOfLines={1}>
                {item.type === 'income' ? '+' : '-'}
                {currencyFormatter.format(item.amount)}
              </Text>
              <Text style={[styles.date, { color: palette.muter }]} numberOfLines={1}>{item.date}</Text>
            </View>
          </View>
        )}
      />

      <AddTransactionModal visible={showComposer} onClose={() => setShowComposer(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  headerIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 6, height: 7 },
    elevation: 5,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    textTransform: 'uppercase',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 5,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.45,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 12,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 4, height: 7 },
    elevation: 5,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 6,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    marginRight: 12,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 7, height: 9 },
    elevation: 5,
  },
  statLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statLabel: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginBottom: 5,
  },
  statDetail: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeader: {
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  entryCount: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  entryCountText: {
    fontSize: 13,
    fontWeight: '800',
  },
  list: {
    paddingBottom: 116,
  },
  entryCard: {
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
    borderWidth: 1,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 4, height: 5 },
    elevation: 2,
  },
  entryAccent: {
    position: 'absolute',
    top: 14,
    bottom: 14,
    left: 0,
    width: 3,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  entryCopy: {
    flex: 1,
    minWidth: 0,
    // Clears the accent stripe now that no glyph badge sits between them.
    paddingLeft: 10,
  },
  entryCategory: {
    fontSize: 14.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  entryDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  entryRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  amount: {
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 3,
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
