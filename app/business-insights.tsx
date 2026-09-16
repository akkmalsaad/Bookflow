import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SectionHeader } from '@/components/SectionHeader';
import BookFlowLoading from '@/components/feedback/BookFlowLoading';
import { useLoadingTransition } from '@/components/feedback/useLoadingTransition';
import {
  IncomeExpenseDonut,
  InsightsPeriodSelector,
  Sparkline,
} from '@/components/business-insights/BusinessInsightsVisuals';
import { InsightRow } from '@/components/business-insights/InsightRow';
import {
  getSoftTokens,
  SETTINGS_ICON_BACKGROUND_COLOR,
  SETTINGS_ICON_STROKE_COLOR,
} from '@/components/settings/tokens';
import { getCompactCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { useSubscription } from '@/context/subscription-context';
import { getThemePalette, useTheme, type AppPalette } from '@/context/theme-context';
import { useResponsive } from '@/lib/responsive';
import { useTranslation } from '@/lib/use-translation';
import {
  calculateBusinessInsights,
  type BusinessInsightsMetrics,
  type InsightsPeriod,
} from '@/lib/business-insights';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Colour on this screen is reserved for state, never for category.
 *
 * A metric is indigo because it is a Bookflow metric — not green because it is called "Revenue" or
 * red because it is called "Expenses". Green, red and amber appear only where the data itself is
 * positive, negative or asking for attention, and every one of those cases also says so in words so
 * the meaning never rests on colour alone.
 */
function changeTone(change: number | null | undefined, palette: AppPalette, inverse = false) {
  if (change == null || !Number.isFinite(change) || Math.abs(change) < 0.5) return palette.muter;
  return (inverse ? change < 0 : change > 0) ? palette.success : palette.danger;
}

export default function BusinessInsightsScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  // Metric cards and charts, so this screen gets the wider card column rather than the reading one.
  const { contentStyle } = useResponsive();
  const soft = getSoftTokens(isDarkMode);
  const { t } = useTranslation();
  const { isLoadingSubscription, isPro } = useSubscription();
  const {
    isLoading,
    loadError,
    reload,
    financeEntries,
    bookings,
    customers,
    invoices,
    payments,
    currency,
  } = useAppData();
  const [period, setPeriod] = useState<InsightsPeriod>('this-month');
  const loading = isLoadingSubscription || !isPro || isLoading;
  const loadingTransition = useLoadingTransition(loading);
  const currencyFormatter = useMemo(() => getCompactCurrencyFormatter(currency), [currency]);
  const metrics = useMemo(
    () =>
      calculateBusinessInsights({
        period,
        financeEntries,
        bookings,
        customers,
        invoices,
        payments,
        formatCurrency: currencyFormatter.format,
      }),
    [period, financeEntries, bookings, customers, invoices, payments, currencyFormatter],
  );

  useEffect(() => {
    if (isLoadingSubscription || isPro) return;
    router.replace({ pathname: '/paywall', params: { returnTo: '/business-insights' } });
  }, [isLoadingSubscription, isPro, router]);

  if (loadingTransition.visible) {
    return <BookFlowLoading key={loadingTransition.cycle} loading={loading} />;
  }

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/finance'));
  const viewAll = () => router.push({ pathname: '/bookflow-insights', params: { period } });

  const invoiceWord = metrics.outstandingInvoiceCount === 1 ? 'invoice' : 'invoices';
  // Amber is earned here: an overdue balance is a real attention state, and the word "overdue"
  // carries the same meaning for anyone who cannot see the colour.
  const hasOverdue = metrics.overdueInvoiceCount > 0;
  const outstandingFooter = hasOverdue
    ? `${invoiceWord} · ${t('insights.overdueSuffix', { count: metrics.overdueInvoiceCount })}`
    : invoiceWord;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={[styles.header, contentStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('insights.back')}
          hitSlop={8}
          onPress={goBack}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: SETTINGS_ICON_BACKGROUND_COLOR, borderColor: soft.border, shadowColor: soft.shadow },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="arrow-back" size={22} color={SETTINGS_ICON_STROKE_COLOR} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: palette.text }]}>{t('insights.card.title')}</Text>
          <Text style={[styles.subtitle, { color: palette.muter }]}>{t('insights.gate.subtitle')}</Text>
        </View>
      </View>

      <View style={[styles.periodRow, contentStyle]}>
        <InsightsPeriodSelector
          value={period}
          onChange={setPeriod}
          variant="flat"
          iconColor={SETTINGS_ICON_STROKE_COLOR}
        />
      </View>

      {loadError ? (
        <View style={[styles.errorCard, { backgroundColor: soft.surface, borderColor: soft.border }]}>
          <Ionicons name="cloud-offline-outline" size={26} color={SETTINGS_ICON_STROKE_COLOR} />
          <Text style={[styles.errorTitle, { color: palette.text }]}>{t('insights.loadFailed')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={reload}
            style={({ pressed }) => [styles.retryButton, { backgroundColor: palette.accent }, pressed && styles.pressed]}>
            <Text style={styles.retryText}>{t('app.tryAgain')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic">
          <SectionCard
            icon="pulse-outline"
            title={t('insights.health')}
            subtitle={t('insights.health.subtitle')}
            isDarkMode={isDarkMode}>
            <View style={styles.metricGrid}>
              <HealthMetric
                icon="cash-outline"
                label={t('insights.revenue')}
                value={currencyFormatter.format(metrics.revenue)}
                footer={changeLabel(metrics.revenueChange)}
                footerColor={changeTone(metrics.revenueChange, palette)}
                isDarkMode={isDarkMode}
              />
              <HealthMetric
                icon="trending-up-outline"
                label={t('insights.netProfit')}
                value={currencyFormatter.format(metrics.profit)}
                footer={changeLabel(metrics.profitChange)}
                footerColor={changeTone(metrics.profitChange, palette)}
                isDarkMode={isDarkMode}
              />
              <HealthMetric
                icon="receipt-outline"
                label={t('insights.outstanding')}
                value={currencyFormatter.format(metrics.outstanding)}
                footer={outstandingFooter}
                footerColor={hasOverdue ? palette.warning : palette.muter}
                isDarkMode={isDarkMode}
              />
              <HealthMetric
                icon="trending-down-outline"
                label={t('insights.expenses')}
                value={currencyFormatter.format(metrics.expenses)}
                footer={changeLabel(metrics.expenseChange)}
                // Spending climbing is the negative movement here, so the comparison inverts.
                footerColor={changeTone(metrics.expenseChange, palette, true)}
                isDarkMode={isDarkMode}
              />
            </View>
          </SectionCard>

          <InsightsCard metrics={metrics} isDarkMode={isDarkMode} onViewAll={viewAll} />

          <SectionCard icon="bar-chart-outline" title={t('insights.performanceOverview')} isDarkMode={isDarkMode}>
            <View style={styles.metricGrid}>
              <TrendMetric
                label={t('insights.incomeTrend')}
                value={currencyFormatter.format(metrics.revenue)}
                footer={changeLabel(metrics.revenueChange)}
                footerColor={changeTone(metrics.revenueChange, palette)}
                data={metrics.trends.income}
                color={palette.accent}
                isDarkMode={isDarkMode}
              />
              <TrendMetric
                label={t('insights.profitTrend')}
                value={currencyFormatter.format(metrics.profit)}
                footer={changeLabel(metrics.profitChange)}
                footerColor={changeTone(metrics.profitChange, palette)}
                data={metrics.trends.profit}
                color={palette.accent}
                isDarkMode={isDarkMode}
              />
              <TrendMetric
                label={t('insights.outstanding')}
                value={currencyFormatter.format(metrics.outstanding)}
                footer={`${metrics.outstandingInvoiceCount} ${invoiceWord}`}
                footerColor={palette.muter}
                data={metrics.trends.outstanding}
                color={palette.accent}
                isDarkMode={isDarkMode}
              />
              <TrendMetric
                label={t('insights.overdue')}
                value={currencyFormatter.format(metrics.overdue)}
                footer={`${metrics.overdueInvoiceCount} ${metrics.overdueInvoiceCount === 1 ? 'invoice' : 'invoices'}`}
                // The only trend that earns a colour, and only while something is actually overdue.
                footerColor={hasOverdue ? palette.danger : palette.muter}
                data={metrics.trends.overdue}
                color={hasOverdue ? palette.danger : palette.accent}
                isDarkMode={isDarkMode}
              />
            </View>
          </SectionCard>

          <SectionCard icon="swap-vertical-outline" title={t('insights.incomeVsExpenses')} isDarkMode={isDarkMode}>
            {metrics.revenue === 0 && metrics.expenses === 0 ? (
              <SmallEmpty label={t('insights.breakdown.empty')} isDarkMode={isDarkMode} />
            ) : (
              <View style={styles.donutRow}>
                <IncomeExpenseDonut
                  income={metrics.revenue}
                  expenses={metrics.expenses}
                  profitLabel={currencyFormatter.format(metrics.profit)}
                  incomeColor={palette.accent}
                  expenseColor={isDarkMode ? '#64748B' : '#B8C2D2'}
                />
                <View style={styles.legend}>
                  <LegendRow
                    color={palette.accent}
                    label={t('insights.income')}
                    value={currencyFormatter.format(metrics.revenue)}
                    isDarkMode={isDarkMode}
                  />
                  <LegendRow
                    color={isDarkMode ? '#64748B' : '#B8C2D2'}
                    label={t('insights.expenses')}
                    value={currencyFormatter.format(metrics.expenses)}
                    isDarkMode={isDarkMode}
                  />
                </View>
              </View>
            )}
          </SectionCard>

          <SectionCard
            icon="pricetags-outline"
            title={t('insights.topExpenses')}
            trailing={metrics.expenses ? currencyFormatter.format(metrics.expenses) : undefined}
            isDarkMode={isDarkMode}>
            {metrics.expenseCategories.length ? (
              metrics.expenseCategories.slice(0, 4).map((category, index, list) => (
                <ExpenseCategoryRow
                  key={category.category}
                  category={category.category}
                  amount={currencyFormatter.format(category.amount)}
                  share={category.share}
                  last={index === list.length - 1}
                  isDarkMode={isDarkMode}
                />
              ))
            ) : (
              <SmallEmpty label={t('insights.expenses.empty')} isDarkMode={isDarkMode} />
            )}
          </SectionCard>

          <SectionCard icon="speedometer-outline" title={t('insights.performance')} isDarkMode={isDarkMode}>
            <View style={styles.metricGrid}>
              <SimpleMetric
                icon="calendar-outline"
                label={t('insights.bookings')}
                value={String(metrics.bookings)}
                footer={changeLabel(metrics.bookingChange)}
                footerColor={changeTone(metrics.bookingChange, palette)}
                isDarkMode={isDarkMode}
              />
              <SimpleMetric
                icon="checkmark-circle-outline"
                label={t('insights.completedBookings')}
                value={String(metrics.completedBookings)}
                footer={
                  metrics.completionRate == null
                    ? 'No booking data'
                    : `${Math.round(metrics.completionRate)}% completion rate`
                }
                isDarkMode={isDarkMode}
              />
              <SimpleMetric
                icon="person-add-outline"
                label={t('insights.newClients')}
                value={String(metrics.newClients)}
                footer={changeLabel(metrics.newClientChange)}
                footerColor={changeTone(metrics.newClientChange, palette)}
                isDarkMode={isDarkMode}
              />
              <SimpleMetric
                icon="people-outline"
                label={t('insights.repeatRate')}
                value={metrics.repeatClientRate == null ? '—' : `${Math.round(metrics.repeatClientRate)}%`}
                footer={`${metrics.repeatClients} repeat ${metrics.repeatClients === 1 ? 'client' : 'clients'}`}
                isDarkMode={isDarkMode}
              />
            </View>
          </SectionCard>

          <SectionCard icon="bulb-outline" title={t('insights.highlights')} isDarkMode={isDarkMode}>
            <HighlightRow
              icon="pricetag-outline"
              label={t('insights.topService')}
              value={metrics.topService?.name ?? 'Not enough payment data'}
              supporting={metrics.topService ? `${currencyFormatter.format(metrics.topService.amount)} received` : undefined}
              isDarkMode={isDarkMode}
            />
            <HighlightRow
              icon="person-outline"
              label={t('insights.topClient')}
              value={metrics.topClient?.name ?? 'Not enough payment data'}
              supporting={metrics.topClient ? `${currencyFormatter.format(metrics.topClient.amount)} received` : undefined}
              isDarkMode={isDarkMode}
            />
            <HighlightRow
              icon="calculator-outline"
              label={t('insights.avgBooking')}
              value={
                metrics.averageBookingValue == null
                  ? 'Not enough payment data'
                  : currencyFormatter.format(metrics.averageBookingValue)
              }
              isDarkMode={isDarkMode}
              last
            />
          </SectionCard>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * One section surface. The heading is the app-wide `SectionHeader` — same 20pt outline glyph, same
 * muted colour, same type scale as the headings on Home, Bookings, Income and Expenses — so a
 * section here is indistinguishable from a section anywhere else in Bookflow.
 */
function SectionCard({
  icon,
  title,
  subtitle,
  trailing,
  tone,
  isDarkMode,
  children,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  trailing?: string;
  tone?: 'neutral' | 'accent';
  isDarkMode: boolean;
  children: ReactNode;
}) {
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <View style={[styles.sectionCard, { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow }]}>
      <View style={styles.sectionHeader}>
        <SectionHeader
          icon={icon}
          iconColor={SETTINGS_ICON_STROKE_COLOR}
          title={title}
          subtitle={subtitle}
          tone={tone}
          rightElement={
            trailing ? <Text style={[styles.sectionTrailing, { color: palette.muter }]}>{trailing}</Text> : undefined
          }
        />
      </View>
      {children}
    </View>
  );
}

/**
 * A Business Health figure. The amount is the card; the glyph is a quiet indigo marker that says
 * which figure it is, sized and tinted identically across all four so none of them shouts.
 */
function HealthMetric({
  icon,
  label,
  value,
  footer,
  footerColor,
  isDarkMode,
}: {
  icon: IconName;
  label: string;
  value: string;
  footer: string;
  footerColor: string;
  isDarkMode: boolean;
}) {
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}, ${footer}`}
      style={[styles.metricCard, { backgroundColor: soft.inset, borderColor: soft.border }]}>
      <View style={[styles.metricIcon, { backgroundColor: SETTINGS_ICON_BACKGROUND_COLOR }]}>
        <Ionicons name={icon} size={19} color={SETTINGS_ICON_STROKE_COLOR} />
      </View>
      <Text style={[styles.metricLabel, { color: palette.muter }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.metricValue, { color: palette.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={[styles.metricFooter, { color: footerColor }]} numberOfLines={2}>
        {footer}
      </Text>
    </View>
  );
}

function TrendMetric({
  label,
  value,
  footer,
  footerColor,
  data,
  color,
  isDarkMode,
}: {
  label: string;
  value: string;
  footer: string;
  footerColor: string;
  data: number[];
  color: string;
  isDarkMode: boolean;
}) {
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  // Measured rather than fixed, so the sparkline spans the card on a small iPhone instead of being
  // clipped by it.
  const [chartWidth, setChartWidth] = useState(0);

  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}, ${footer}`}
      style={[styles.metricCard, styles.trendCard, { backgroundColor: soft.inset, borderColor: soft.border }]}>
      <Text style={[styles.metricLabel, { color: palette.muter }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.metricValue, { color: palette.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={[styles.metricFooter, { color: footerColor }]} numberOfLines={1}>
        {footer}
      </Text>
      <View
        pointerEvents="none"
        style={styles.sparkline}
        onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}>
        {chartWidth > 0 ? <Sparkline data={data} color={color} width={chartWidth} height={40} /> : null}
      </View>
    </View>
  );
}

/**
 * The one branded surface on the screen: a barely-there indigo tint and an accent sparkle, and
 * nothing else. The title stays the same dark navy as every other section heading, so this reads as
 * a Bookflow section that happens to be special rather than a second design system.
 */
function InsightsCard({
  metrics,
  isDarkMode,
  onViewAll,
}: {
  metrics: BusinessInsightsMetrics;
  isDarkMode: boolean;
  onViewAll: () => void;
}) {
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const { t } = useTranslation();
  const visibleInsights = metrics.insights.slice(0, 5);

  return (
    <View
      style={[
        styles.sectionCard,
        {
          backgroundColor: isDarkMode ? '#161F35' : '#F6F7FE',
          borderColor: isDarkMode ? 'rgba(129, 140, 248, 0.16)' : '#E6E8F8',
          shadowColor: soft.shadow,
        },
      ]}>
      <View style={styles.sectionHeader}>
        <SectionHeader
          icon="sparkles-outline"
          iconColor={SETTINGS_ICON_STROKE_COLOR}
          title={t('insights.promo.title')}
          subtitle={t('insights.promo.subtitle')}
          tone="accent"
          rightElement={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('insights.viewAll')}
              hitSlop={10}
              onPress={onViewAll}
              style={({ pressed }) => [styles.viewAll, pressed && styles.pressed]}>
              <Text style={[styles.viewAllText, { color: palette.accent }]}>{t('insights.viewAllShort')}</Text>
              <Ionicons name="chevron-forward" size={15} color={SETTINGS_ICON_STROKE_COLOR} />
            </Pressable>
          }
        />
      </View>
      {visibleInsights.length ? (
        visibleInsights.map((insight, index) => (
          <InsightRow
            key={insight.id}
            insight={insight}
            isDarkMode={isDarkMode}
            last={index === visibleInsights.length - 1}
            onPress={onViewAll}
            variant="quiet"
            iconBackgroundColor={SETTINGS_ICON_BACKGROUND_COLOR}
            iconColor={SETTINGS_ICON_STROKE_COLOR}
          />
        ))
      ) : (
        <View style={styles.insightEmpty}>
          <View style={[styles.insightEmptyIcon, { backgroundColor: SETTINGS_ICON_BACKGROUND_COLOR }]}>
            <Ionicons name="sparkles-outline" size={19} color={SETTINGS_ICON_STROKE_COLOR} />
          </View>
          <View style={styles.insightEmptyCopy}>
            <Text style={[styles.insightEmptyTitle, { color: palette.text }]}>{t('insights.empty')}</Text>
            <Text style={[styles.insightEmptyText, { color: palette.muter }]}>
              Keep adding bookings, invoices, payments and expenses to unlock useful business insights.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function ExpenseCategoryRow({
  category,
  amount,
  share,
  last,
  isDarkMode,
}: {
  category: string;
  amount: string;
  share: number;
  last: boolean;
  isDarkMode: boolean;
}) {
  const palette = getThemePalette(isDarkMode);
  const icon: IconName = /transport|travel|fuel|car/i.test(category)
    ? 'car-outline'
    : /equipment|gear|camera/i.test(category)
      ? 'briefcase-outline'
      : /market|advert/i.test(category)
        ? 'megaphone-outline'
        : 'pricetag-outline';

  return (
    <View
      accessible
      accessibilityLabel={`${category}, ${amount}, ${Math.round(share)} percent of expenses`}
      style={[styles.categoryRow, last && styles.categoryRowLast]}>
      <View style={[styles.rowIcon, { backgroundColor: SETTINGS_ICON_BACKGROUND_COLOR }]}>
        <Ionicons name={icon} size={18} color={SETTINGS_ICON_STROKE_COLOR} />
      </View>
      <View style={styles.categoryMain}>
        <View style={styles.categoryCopy}>
          <Text style={[styles.categoryLabel, { color: palette.text }]} numberOfLines={1}>
            {category}
          </Text>
          <Text style={[styles.categoryAmount, { color: palette.muter }]}>
            {amount} · {Math.round(share)}%
          </Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: `${palette.muter}22` }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: palette.accent, width: `${Math.min(100, Math.max(0, share))}%` },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

function SimpleMetric({
  icon,
  label,
  value,
  footer,
  footerColor,
  isDarkMode,
}: {
  icon: IconName;
  label: string;
  value: string;
  footer: string;
  footerColor?: string;
  isDarkMode: boolean;
}) {
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}, ${footer}`}
      style={[styles.metricCard, { backgroundColor: soft.inset, borderColor: soft.border }]}>
      <View style={[styles.metricIcon, { backgroundColor: SETTINGS_ICON_BACKGROUND_COLOR }]}>
        <Ionicons name={icon} size={19} color={SETTINGS_ICON_STROKE_COLOR} />
      </View>
      <Text style={[styles.metricLabel, { color: palette.muter }]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.countValue, { color: palette.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.metricFooter, { color: footerColor ?? palette.muter }]} numberOfLines={2}>
        {footer}
      </Text>
    </View>
  );
}

function HighlightRow({
  icon,
  label,
  value,
  supporting,
  isDarkMode,
  last,
}: {
  icon: IconName;
  label: string;
  value: string;
  supporting?: string;
  isDarkMode: boolean;
  last?: boolean;
}) {
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <View
      accessible
      accessibilityLabel={[label, value, supporting].filter(Boolean).join(', ')}
      style={[styles.highlightRow, !last && { borderBottomColor: soft.divider, borderBottomWidth: 1 }]}>
      <View style={[styles.rowIcon, { backgroundColor: SETTINGS_ICON_BACKGROUND_COLOR }]}>
        <Ionicons name={icon} size={19} color={SETTINGS_ICON_STROKE_COLOR} />
      </View>
      <View style={styles.highlightCopy}>
        <Text style={[styles.highlightLabel, { color: palette.muter }]}>{label}</Text>
        <Text style={[styles.highlightValue, { color: palette.text }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {supporting ? <Text style={[styles.highlightSupporting, { color: palette.muter }]}>{supporting}</Text> : null}
    </View>
  );
}

function SmallEmpty({ label, isDarkMode }: { label: string; isDarkMode: boolean }) {
  const palette = getThemePalette(isDarkMode);

  return (
    <View style={styles.smallEmpty}>
      <Ionicons name="analytics-outline" size={20} color={SETTINGS_ICON_STROKE_COLOR} />
      <Text style={[styles.smallEmptyText, { color: palette.muter }]}>{label}</Text>
    </View>
  );
}

function LegendRow({
  color,
  label,
  value,
  isDarkMode,
}: {
  color: string;
  label: string;
  value: string;
  isDarkMode: boolean;
}) {
  const palette = getThemePalette(isDarkMode);

  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <View>
        <Text style={[styles.legendLabel, { color: palette.muter }]}>{label}</Text>
        <Text style={[styles.legendValue, { color: palette.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function changeLabel(change: number | null | undefined) {
  if (change == null || !Number.isFinite(change)) return 'No comparison';
  if (Math.abs(change) < 0.5) return 'No change';
  return `${change > 0 ? '↑' : '↓'} ${Math.abs(Math.round(change))}%`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  header: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 20, paddingTop: 12 },
  backButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    elevation: 1,
    height: 46,
    justifyContent: 'center',
    marginRight: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    width: 46,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 12.5, fontWeight: '500', marginTop: 3 },
  periodRow: { alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 16 },
  pressed: { opacity: 0.7 },

  content: { alignSelf: 'center', paddingBottom: 40, paddingHorizontal: 20, paddingTop: 20, width: '100%' },
  errorCard: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 22,
    borderWidth: 1,
    margin: 24,
    maxWidth: 420,
    padding: 24,
    width: '88%',
  },
  errorTitle: { fontSize: 15.5, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  retryButton: { borderRadius: 14, marginTop: 16, minHeight: 44, justifyContent: 'center', paddingHorizontal: 18 },
  retryText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '700' },

  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    elevation: 1,
    marginBottom: 16,
    padding: 16,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  sectionHeader: { marginBottom: 16 },
  sectionTrailing: { fontSize: 12.5, fontWeight: '700' },

  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: {
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: '46%',
    flexGrow: 1,
    // Tall enough that a two-line label or a wrapped comparison line does not change the card's
    // height, so all four read as one set rather than a ragged grid.
    minHeight: 158,
    minWidth: 132,
    padding: 14,
  },
  trendCard: { overflow: 'hidden' },
  metricIcon: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', marginBottom: 12, width: 38 },
  metricLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  metricValue: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, marginBottom: 6 },
  countValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.7, marginBottom: 6 },
  metricFooter: { fontSize: 11.5, fontWeight: '600', lineHeight: 16 },
  sparkline: { bottom: 8, left: 12, position: 'absolute', right: 12 },

  viewAll: { alignItems: 'center', flexDirection: 'row', gap: 2, minHeight: 32, paddingLeft: 8 },
  viewAllText: { fontSize: 13, fontWeight: '700' },
  insightEmpty: { alignItems: 'flex-start', flexDirection: 'row' },
  insightEmptyIcon: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', marginRight: 12, width: 38 },
  insightEmptyCopy: { flex: 1 },
  insightEmptyTitle: { fontSize: 13.5, fontWeight: '700', marginBottom: 4 },
  insightEmptyText: { fontSize: 12, fontWeight: '500', lineHeight: 17 },

  donutRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'space-around' },
  legend: { gap: 16 },
  legendRow: { alignItems: 'center', flexDirection: 'row' },
  legendDot: { borderRadius: 4, height: 8, marginRight: 9, width: 8 },
  legendLabel: { fontSize: 11.5, fontWeight: '600', marginBottom: 2 },
  legendValue: { fontSize: 13.5, fontWeight: '700' },

  categoryRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 14 },
  categoryRowLast: { marginBottom: 0 },
  rowIcon: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', marginRight: 12, width: 38 },
  categoryMain: { flex: 1 },
  categoryCopy: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  categoryLabel: { flex: 1, fontSize: 12.5, fontWeight: '600', marginRight: 8 },
  categoryAmount: { fontSize: 11.5, fontWeight: '600' },
  progressTrack: { borderRadius: 3, height: 5, overflow: 'hidden' },
  progressFill: { borderRadius: 3, height: '100%' },

  highlightRow: { alignItems: 'center', flexDirection: 'row', minHeight: 62, paddingVertical: 10 },
  highlightCopy: { flex: 1, minWidth: 0 },
  highlightLabel: { fontSize: 11.5, fontWeight: '600', marginBottom: 3 },
  highlightValue: { fontSize: 14, fontWeight: '700' },
  highlightSupporting: { fontSize: 11.5, fontWeight: '600', marginLeft: 10, maxWidth: 100, textAlign: 'right' },

  smallEmpty: { alignItems: 'flex-start', paddingVertical: 4 },
  smallEmptyText: { fontSize: 12, fontWeight: '500', lineHeight: 17, marginTop: 8 },
});
