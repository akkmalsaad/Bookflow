import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InsightRow } from '@/components/business-insights/InsightRow';
import { InsightsPeriodSelector, ProBadge } from '@/components/business-insights/BusinessInsightsVisuals';
import { getSoftTokens } from '@/components/settings/tokens';
import { getCompactCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { useSubscription } from '@/context/subscription-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import {
  calculateBusinessInsights,
  INSIGHTS_PERIODS,
  type BusinessInsight,
  type InsightsPeriod,
} from '@/lib/business-insights';

function isInsightsPeriod(value: string | undefined): value is InsightsPeriod {
  return INSIGHTS_PERIODS.some((period) => period.id === value);
}

export default function BookflowInsightsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ period?: string }>();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const { isLoadingSubscription, isPro } = useSubscription();
  const { financeEntries, bookings, customers, invoices, payments, currency } = useAppData();
  const [period, setPeriod] = useState<InsightsPeriod>(isInsightsPeriod(params.period) ? params.period : 'this-month');
  const formatter = useMemo(() => getCompactCurrencyFormatter(currency), [currency]);
  const metrics = useMemo(
    () => calculateBusinessInsights({
      period,
      financeEntries,
      bookings,
      customers,
      invoices,
      payments,
      formatCurrency: formatter.format,
    }),
    [period, financeEntries, bookings, customers, invoices, payments, formatter],
  );

  useEffect(() => {
    if (isLoadingSubscription || isPro) return;
    router.replace({ pathname: '/paywall', params: { returnTo: '/business-insights' } });
  }, [isLoadingSubscription, isPro, router]);

  if (isLoadingSubscription || !isPro) {
    return (
      <SafeAreaView style={[styles.gate, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.accent} />
      </SafeAreaView>
    );
  }

  const attention = metrics.insights.filter((insight) => insight.tone === 'attention' || insight.tone === 'expense');
  const doingWell = metrics.insights.filter((insight) =>
    insight.tone === 'positive' || insight.tone === 'service' || insight.tone === 'client',
  );
  const opportunities: BusinessInsight[] = [];
  if (metrics.topService) {
    opportunities.push({
      id: 'feature-top-service',
      tone: 'service',
      message: `Feature ${metrics.topService.name} in your next promotion—it leads your booking-linked revenue.`,
    });
  }
  if (metrics.bookings > 0 && (metrics.repeatClientRate ?? 0) < 30) {
    opportunities.push({
      id: 'client-follow-up',
      tone: 'client',
      message: 'Follow up after completed bookings to encourage more repeat clients.',
    });
  }
  if (metrics.outstanding > 0 && metrics.overdue === 0) {
    opportunities.push({
      id: 'upcoming-invoices',
      tone: 'positive',
      message: `${formatter.format(metrics.outstanding)} is still outstanding, with no overdue balance in this period.`,
    });
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Business Insights"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/business-insights'))}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="arrow-back" size={22} color={palette.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: palette.text }]}>All Insights</Text>
            <ProBadge />
          </View>
          <Text style={[styles.subtitle, { color: palette.muter }]}>Insights based on your business data</Text>
        </View>
      </View>

      <View style={styles.periodRow}>
        <Text style={[styles.periodHint, { color: palette.muter }]}>Showing the same period across every insight</Text>
        <InsightsPeriodSelector value={period} onChange={setPeriod} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <InsightGroup
          title="Needs Attention"
          subtitle="Time-sensitive changes and payment issues"
          icon="warning-outline"
          color="#F97316"
          insights={attention}
          empty="Nothing needs your attention for this period."
          isDarkMode={isDarkMode}
        />
        <InsightGroup
          title="Doing Well"
          subtitle="Positive movement worth building on"
          icon="trending-up"
          color="#20A950"
          insights={doingWell}
          empty="Positive trends will appear once there is enough comparison data."
          isDarkMode={isDarkMode}
        />
        <InsightGroup
          title="Business Opportunities"
          subtitle="Practical next steps from your records"
          icon="bulb-outline"
          color="#6D28D9"
          insights={opportunities}
          empty="Keep recording bookings and payments to reveal opportunities."
          isDarkMode={isDarkMode}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function InsightGroup({
  title,
  subtitle,
  icon,
  color,
  insights,
  empty,
  isDarkMode,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  insights: BusinessInsight[];
  empty: string;
  isDarkMode: boolean;
}) {
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  return (
    <View style={[styles.group, { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow }]}>
      <View style={styles.groupHeader}>
        <View style={[styles.groupIcon, { backgroundColor: `${color}18` }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <View style={styles.groupCopy}>
          <Text style={[styles.groupTitle, { color: palette.text }]}>{title}</Text>
          <Text style={[styles.groupSubtitle, { color: palette.muter }]}>{subtitle}</Text>
        </View>
      </View>
      {insights.length ? (
        insights.map((insight, index) => (
          <InsightRow key={insight.id} insight={insight} isDarkMode={isDarkMode} last={index === insights.length - 1} />
        ))
      ) : (
        <View style={[styles.empty, { backgroundColor: soft.inset }]}>
          <Ionicons name="checkmark-circle-outline" size={21} color={palette.muter} />
          <Text style={[styles.emptyText, { color: palette.muter }]}>{empty}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  gate: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  header: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 20, paddingTop: 10 },
  backButton: { alignItems: 'center', borderRadius: 15, borderWidth: 1, elevation: 3, height: 46, justifyContent: 'center', marginRight: 12, shadowOffset: { width: 3, height: 5 }, shadowOpacity: 0.14, shadowRadius: 9, width: 46 },
  pressed: { opacity: 0.78 },
  headerCopy: { flex: 1 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  title: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 11.5, fontWeight: '500', marginTop: 4 },
  periodRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  periodHint: { flex: 1, fontSize: 11, lineHeight: 15, marginRight: 12 },
  content: { paddingBottom: 42, paddingHorizontal: 16 },
  group: { borderRadius: 23, borderWidth: 1, elevation: 3, marginBottom: 14, overflow: 'hidden', padding: 14, shadowOffset: { width: 4, height: 7 }, shadowOpacity: 0.12, shadowRadius: 13 },
  groupHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: 8 },
  groupIcon: { alignItems: 'center', borderRadius: 15, height: 42, justifyContent: 'center', marginRight: 11, width: 42 },
  groupCopy: { flex: 1 },
  groupTitle: { fontSize: 15, fontWeight: '900' },
  groupSubtitle: { fontSize: 10.5, lineHeight: 15, marginTop: 2 },
  empty: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', marginTop: 7, minHeight: 58, paddingHorizontal: 14 },
  emptyText: { flex: 1, fontSize: 11.5, lineHeight: 16, marginLeft: 10 },
});
