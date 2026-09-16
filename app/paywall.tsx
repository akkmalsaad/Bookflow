import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProBadge } from '@/components/ProBadge';
import { getSoftTokens } from '@/components/settings/tokens';
import { useSubscription } from '@/context/subscription-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { FREE_LIMITS, isLimitKind, LIMIT_COPY } from '@/lib/plan-limits';
import type { Translate } from '@/lib/i18n';
import { useTranslation } from '@/lib/use-translation';
import { describeMonthlyEquivalent, describePackage, isExpoGo, isPurchasesSupported, yearlySavingsPercent } from '@/lib/revenuecat';
import { captureEvent } from '@/lib/analytics';

type PlanId = 'monthly' | 'yearly';

/**
 * The Bookflow Pro paywall. Custom-built rather than a RevenueCat-hosted template so it inherits
 * the app's Soft UI surfaces, palette and type scale. Every price, saving and monthly equivalent
 * shown here comes from the store product RevenueCat returns, so what the customer sees is what
 * Apple or Google will charge, in their own currency. Nothing is shown until those products load.
 */
export default function PaywallScreen() {
  const router = useRouter();
  const { returnTo, reason } = useLocalSearchParams<{ returnTo?: string; reason?: string }>();
  // Keep the limit context visible below the shared headline.
  const limitCopy = isLimitKind(reason) ? LIMIT_COPY[reason] : null;
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const { fontScale, height } = useWindowDimensions();
  const [viewportHeight, setViewportHeight] = useState(height);
  const styles = useMemo(() => createStyles(viewportHeight), [viewportHeight]);
  const stackPlans = fontScale > 1.2;
  const soft = getSoftTokens(isDarkMode);
  const { t } = useTranslation();

  const {
    canPurchase,
    environment,
    isLoadingOfferings,
    isPro,
    isPurchasing,
    isRestoring,
    monthlyPackage,
    offeringError,
    purchase,
    refreshSubscription,
    reloadOfferings,
    restore,
    yearlyPackage,
  } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<PlanId>('yearly');
  const proDestination =
    returnTo === '/business-insights' || returnTo === '/settings/export' ? returnTo : null;

  const close = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [router]);

  // Prefer yearly, but never leave an unavailable plan selected.
  useEffect(() => {
    if (selectedPlan === 'monthly' && !monthlyPackage && yearlyPackage) setSelectedPlan('yearly');
    if (selectedPlan === 'yearly' && !yearlyPackage && monthlyPackage) setSelectedPlan('monthly');
  }, [monthlyPackage, selectedPlan, yearlyPackage]);

  // Entitlement is the source of truth: if it turns active for any reason — this purchase, a
  // restore, or a renewal syncing in from another device — the paywall has nothing left to sell.
  useEffect(() => {
    if (!isPro) return;
    if (proDestination) {
      router.replace(proDestination);
    } else {
      close();
    }
  }, [close, isPro, proDestination, router]);

  // Null unless yearly is genuinely cheaper than twelve monthly payments; a 0% rounds away too.
  const savings = yearlySavingsPercent(monthlyPackage, yearlyPackage);
  const monthlyEquivalent = describeMonthlyEquivalent(yearlyPackage);

  const selectedPackage = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;
  const isBusy = isPurchasing || isRestoring;

  const handleUpgrade = useCallback(async () => {
    if (!selectedPackage || isBusy) return;

    const outcome = await purchase(selectedPackage);

    // Backing out of the store sheet is a decision, not a failure — drop the loading state and
    // leave the customer exactly where they were.
    if (outcome.status === 'cancelled') return;

    if (outcome.status === 'error') {
      Alert.alert(t('paywall.incomplete'), outcome.message);
      return;
    }

    if (outcome.status === 'purchased') {
      captureEvent('subscription_purchased', {
        plan: selectedPlan,
        entitlement_granted: outcome.isPro,
      });
    }

    if (outcome.status === 'purchased' && !outcome.isPro) {
      // A completed transaction that did not grant the entitlement means the product is not
      // attached to `pro` in the dashboard, or the receipt is still being processed.
      Alert.alert(
        t('paywall.almost.title'),
        t('paywall.almost.body'),
      );
    } else if (outcome.status === 'purchased') {
      // The purchase response already contains fresh CustomerInfo; this follow-up also reconciles
      // any store-side entitlement propagation before a gated destination replaces the paywall.
      await refreshSubscription();
    }
    // The `isPro` effect above closes the screen once the entitlement lands.
  }, [isBusy, purchase, refreshSubscription, selectedPackage, selectedPlan, t]);

  const handleRestore = useCallback(async () => {
    if (isBusy) return;

    const outcome = await restore();

    if (outcome.status === 'error') {
      Alert.alert(t('paywall.restoreFailed'), outcome.message);
      return;
    }
    if (outcome.status === 'purchased') {
      captureEvent('subscription_restored', { entitlement_granted: outcome.isPro });
    }
    if (outcome.status === 'purchased' && !outcome.isPro) {
      Alert.alert(
        t('paywall.nothingToRestore'),
        t('paywall.nothingToRestore.body'),
      );
    }
  }, [isBusy, restore, t]);

  // `canPurchase` comes from the subscription context, which knows which store is configured —
  // App Store, Play Store or the development Test Store. A development build purchases normally on
  // all three; only Expo Go's mocked Preview API is excluded.
  const canSubmitPurchase = Boolean(selectedPackage) && canPurchase && !isBusy && !isLoadingOfferings && !offeringError;

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
        bounces={false} onLayout={({ nativeEvent }) => setViewportHeight(nativeEvent.layout.height)}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} disabled={isBusy}
              onPress={close} style={({ pressed }) => [styles.closeButton,
                { backgroundColor: soft.surface, borderColor: soft.border }, pressed && styles.pressed, isBusy && styles.disabled]}>
              <Ionicons name="close" size={21} color={palette.muter} />
            </Pressable>
            <View pointerEvents="none" style={styles.headerLogo}>
              <View style={[styles.logoFrame, { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow }]}>
                <Image source={require('@/assets/images/bookflow-logo.png')} style={styles.logo} contentFit="contain" accessibilityLabel="BookFlow" />
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: isBusy, busy: isRestoring }}
              disabled={isBusy} onPress={handleRestore}
              style={({ pressed }) => [styles.restoreButton, pressed && styles.pressed, isBusy && styles.disabled]}>
              {isRestoring ? <ActivityIndicator size="small" color={palette.accent} /> : null}
              <Text style={[styles.restoreText, { color: palette.muter }]}>
                {isRestoring ? t('paywall.restoring') : t('paywall.restore')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.brandRow}>
            <Text style={[styles.brandText, { color: palette.text }]}>BookFlow</Text>
            <ProBadge />
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>{t('paywall.heroTitle')}</Text>
          <Text style={[styles.supporting, { color: palette.muter }]}>{t('paywall.heroBody')}</Text>
          {limitCopy ? <Text style={[styles.limitNotice, { color: palette.muter }]}>{limitCopy.body}</Text> : null}

          <FeatureComparison isDarkMode={isDarkMode} t={t} styles={styles} />

          {isLoadingOfferings ? (
            <PlanSkeleton isDarkMode={isDarkMode} stack={stackPlans} styles={styles} />
          ) : offeringError || (!monthlyPackage && !yearlyPackage) ? (
            <View style={[styles.errorCard, { backgroundColor: soft.surface, borderColor: soft.border }]}>
              <Ionicons name="cloud-offline-outline" size={22} color={palette.muter} />
              <Text style={[styles.errorText, { color: palette.muter }]}>{t('paywall.loadError')}</Text>
              <Pressable accessibilityRole="button" onPress={reloadOfferings}
                style={({ pressed }) => [styles.retryButton, { borderColor: palette.accent }, pressed && styles.pressed]}>
                <Text style={[styles.retryText, { color: palette.accent }]}>{t('common.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.plans, stackPlans && styles.plansStacked]} accessibilityRole="radiogroup">
              {monthlyPackage ? <PlanCard isDarkMode={isDarkMode} stack={stackPlans} styles={styles} label={t('paywall.monthly')}
                price={describePackage(monthlyPackage)} caption={t('paywall.billedMonthly')}
                selected={selectedPlan === 'monthly'} onPress={() => setSelectedPlan('monthly')} disabled={isBusy} /> : null}
              {yearlyPackage ? <PlanCard isDarkMode={isDarkMode} stack={stackPlans} styles={styles} label={t('paywall.yearly')}
                price={describePackage(yearlyPackage)} caption={t('paywall.billedYearly')}
                badge={savings ? t('paywall.savePercent', { percent: savings }) : undefined}
                selected={selectedPlan === 'yearly'} onPress={() => setSelectedPlan('yearly')} disabled={isBusy} /> : null}
            </View>
          )}

          {!isLoadingOfferings && !offeringError && selectedPackage ? (
            <Text accessibilityLiveRegion="polite" style={[styles.equivalent, { color: palette.muter }]}>
              {selectedPlan === 'yearly' && monthlyEquivalent
                ? t('paywall.monthlyEquivalent', { price: monthlyEquivalent }) : t('paywall.flexibleBilling')}
            </Text>
          ) : null}

          {!canPurchase ? <Text style={[styles.envNotice, { color: palette.muter }]}>
            {/* A native build without billing is a configuration or store outage, not a platform limit. */}
            {isExpoGo ? t('paywall.expoGo') : isPurchasesSupported ? t('billing.unavailable') : t('paywall.storeOnly')}
          </Text> : null}
          {__DEV__ && environment === 'test-store' ? <Text style={[styles.envNotice, { color: palette.muter }]}>
            RevenueCat Test Store — this purchase is simulated and costs nothing.
          </Text> : null}

          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSubmitPurchase, busy: isPurchasing }}
            disabled={!canSubmitPurchase} onPress={handleUpgrade}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: palette.accent, shadowColor: palette.accent },
              pressed && styles.pressed, !canSubmitPurchase && styles.disabled]}>
            {isPurchasing ? <ActivityIndicator color="#FFFFFF" /> : <>
              <Text style={styles.primaryButtonText}>{t('paywall.continuePro')}</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </>}
          </Pressable>
          {!isLoadingOfferings && !offeringError && selectedPackage ? <Text style={[styles.renewal, { color: palette.muter }]}>
            {t(selectedPlan === 'yearly' ? 'paywall.renewalYearly' : 'paywall.renewalMonthly', { price: describePackage(selectedPackage) })}
          </Text> : null}
          <Pressable accessibilityRole="button" disabled={isBusy} onPress={close}
            style={({ pressed }) => [styles.stayButton, pressed && styles.pressed, isBusy && styles.disabled]}>
            <Text style={[styles.stayText, { color: palette.muter }]}>{t('paywall.stayFree')}</Text>
          </Pressable>
          <View style={[styles.legal, { borderTopColor: soft.divider }]}>
            <Pressable accessibilityRole="link" disabled={isBusy} style={styles.legalLink} onPress={() => router.push('/settings/terms')}>
              <Text style={[styles.legalText, { color: palette.muter }]}>{t('paywall.terms')}</Text>
            </Pressable>
            <Pressable accessibilityRole="link" disabled={isBusy} style={styles.legalLink} onPress={() => router.push('/settings/privacy')}>
              <Text style={[styles.legalText, { color: palette.muter }]}>{t('paywall.privacy')}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type PaywallStyles = ReturnType<typeof createStyles>;

function FeatureComparison({ isDarkMode, t, styles }: { isDarkMode: boolean; t: Translate; styles: PaywallStyles }) {
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const unlimited = t('paywall.unlimited');
  const rows: { label: string; free: string | boolean; pro: string | boolean }[] = [
    { label: t('paywall.bookings'), free: t('paywall.perMonth', { count: FREE_LIMITS.bookingsPerMonth }), pro: unlimited },
    { label: t('paywall.clients'), free: String(FREE_LIMITS.customers), pro: unlimited },
    { label: t('paywall.invoices'), free: t('paywall.perMonth', { count: FREE_LIMITS.invoicesPerMonth }), pro: unlimited },
    { label: t('paywall.templates'), free: t('paywall.basic'), pro: t('paywall.allTemplates') },
    { label: t('paywall.payments'), free: true, pro: true },
    { label: t('paywall.invoiceLogo'), free: false, pro: true },
    { label: t('paywall.insights'), free: t('paywall.overview'), pro: t('paywall.advanced') },
    // Export is available to Free accounts too; only custom report branding is Pro-gated.
    { label: t('paywall.reports'), free: true, pro: true },
  ];
  const value = (entry: string | boolean, pro: boolean) => typeof entry === 'boolean'
    ? entry
      ? <View style={[styles.check, pro && { backgroundColor: soft.accentSoft }]}>
          <Ionicons name="checkmark" size={15} color={pro ? palette.accent : palette.muter} />
        </View>
      : <Text style={[styles.cellText, { color: palette.muter }]}>—</Text>
    : <Text style={[styles.cellText, { color: pro ? palette.accent : palette.muter }, pro && styles.proValue]}>{entry}</Text>;
  const spoken = (entry: string | boolean) => typeof entry === 'boolean' ? t(entry ? 'paywall.included' : 'paywall.notIncluded') : entry;
  return (
    <View style={[styles.comparison, { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow }]}>
      <View style={styles.comparisonRow}>
        <Text style={[styles.featureLabel, styles.comparisonTitle, { color: palette.text }]}>{t('paywall.toolkit')}</Text>
        <Text style={[styles.valueCell, styles.columnHeading, { color: palette.muter }]}>{t('paywall.free')}</Text>
        <Text style={[styles.valueCell, styles.columnHeading, styles.proValue, { color: palette.accent }]}>Pro</Text>
      </View>
      {rows.map((row) => (
        <View key={row.label} accessible accessibilityLabel={`${row.label}. ${t('paywall.free')}: ${spoken(row.free)}. Pro: ${spoken(row.pro)}.`}
          style={[styles.comparisonRow, styles.comparisonBodyRow, { borderTopColor: soft.divider }]}>
          <Text style={[styles.featureLabel, { color: palette.text }]}>{row.label}</Text>
          <View style={styles.valueCell}>{value(row.free, false)}</View>
          <View style={[styles.valueCell, styles.proCell, { backgroundColor: isDarkMode ? soft.accentSoft : palette.iconWrap }]}>{value(row.pro, true)}</View>
        </View>
      ))}
    </View>
  );
}

function PlanCard({ isDarkMode, stack, styles, label, price, caption, badge, selected, onPress, disabled }: {
  styles: PaywallStyles;
  isDarkMode: boolean; stack: boolean; label: string; price: string; caption: string; badge?: string;
  selected: boolean; onPress: () => void; disabled: boolean;
}) {
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  return (
    <Pressable accessibilityRole="radio" accessibilityLabel={`${label}, ${price}, ${caption}${badge ? `, ${badge}` : ''}`}
      accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.planCard, stack && styles.stackedPlanCard, { backgroundColor: selected ? soft.accentSoft : soft.surface,
        borderColor: selected ? palette.accent : palette.border }, pressed && styles.pressed, disabled && styles.disabled]}>
      {badge ? <View style={[styles.badge, { backgroundColor: palette.accent }]}><Text style={styles.badgeText}>{badge}</Text></View> : null}
      <View style={styles.planLabelRow}>
        <Text style={[styles.planLabel, { color: palette.text }]}>{label}</Text>
        <View style={[styles.radio, { borderColor: selected ? palette.accent : palette.border, borderWidth: selected ? 5 : 1.5 }]} />
      </View>
      <Text style={[styles.planPrice, { color: palette.text }]}>{price}</Text>
      <Text style={[styles.planCaption, { color: palette.muter }]}>{caption}</Text>
    </Pressable>
  );
}

function PlanSkeleton({ isDarkMode, stack, styles }: { isDarkMode: boolean; stack: boolean; styles: PaywallStyles }) {
  const soft = getSoftTokens(isDarkMode);
  return <View style={[styles.plans, stack && styles.plansStacked]}>
    {[0, 1].map(index => <View key={index} style={[styles.planCard, stack && styles.stackedPlanCard, { backgroundColor: soft.surface, borderColor: soft.border }]}>
      <View style={[styles.skeletonBar, { backgroundColor: soft.inset, width: '40%' }]} />
      <View style={[styles.skeletonBar, { backgroundColor: soft.inset, width: '80%', height: 24 }]} />
      <View style={[styles.skeletonBar, { backgroundColor: soft.inset, width: '60%' }]} />
    </View>)}
  </View>;
}

// Use the measured modal viewport: an iOS sheet is shorter than the device window.
const createStyles = (viewportHeight: number) => {
  const compact = viewportHeight < 740;
  const short = viewportHeight < 680;
  // Spread spare height through the layout without crowding shorter sheets.
  const breathingRoom = Math.min(1, Math.max(0, (viewportHeight - 780) / 100));
  const logoSize = 44 + 28 * breathingRoom;
  return StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingTop: 12, paddingBottom: 4 },
  content: { width: '100%', maxWidth: 480, alignSelf: 'center', alignItems: 'center', paddingHorizontal: short ? 16 : 20 },
  header: { alignSelf: 'stretch', minHeight: logoSize + 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 40, gap: 12 },
  headerLogo: { position: 'absolute', top: 44, left: 0, right: 0, alignItems: 'center' },
  closeButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  restoreButton: { minHeight: 44, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  restoreText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  logoFrame: { width: logoSize, height: logoSize, borderRadius: 13 + 7 * breathingRoom, borderWidth: 1, overflow: 'hidden', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 12 },
  logo: { width: '100%', height: '100%' },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: short ? 0 : 4 + 10 * breathingRoom },
  brandText: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: short ? 19 : compact ? 21 : 24, lineHeight: short ? 22 : compact ? 25 : 28, fontWeight: '800', letterSpacing: -0.7, textAlign: 'center', marginTop: short ? 3 : 6 + 12 * breathingRoom },
  supporting: { fontSize: 12, lineHeight: 16, fontWeight: '500', textAlign: 'center', maxWidth: 350, marginTop: 4 + 10 * breathingRoom },
  limitNotice: { fontSize: 11, lineHeight: 14, textAlign: 'center', marginTop: 4 },
  comparison: { alignSelf: 'stretch', borderRadius: 16, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, marginTop: compact ? 8 : 12 + 14 * breathingRoom,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14 },
  comparisonRow: { flexDirection: 'row', alignItems: 'stretch', minHeight: short ? 21 : compact ? 25 : 29 },
  comparisonBodyRow: { borderTopWidth: StyleSheet.hairlineWidth },
  featureLabel: { width: '46%', fontSize: 11, lineHeight: 13, fontWeight: '500', paddingVertical: short ? 2 : 4, paddingRight: 5, alignSelf: 'center' },
  comparisonTitle: { fontWeight: '700' },
  valueCell: { width: '27%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, paddingVertical: short ? 1 : 3 },
  columnHeading: { fontSize: 11, lineHeight: 13, fontWeight: '600', textAlign: 'center', alignSelf: 'center' },
  proCell: { borderRadius: 6 },
  cellText: { fontSize: 10, lineHeight: 12, textAlign: 'center', fontWeight: '500' },
  proValue: { fontWeight: '700' },
  check: { width: short ? 16 : 18, height: short ? 16 : 18, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  plans: { alignSelf: 'stretch', flexDirection: 'row', gap: 10, marginTop: 16 + 10 * breathingRoom },
  plansStacked: { flexDirection: 'column', gap: 18 },
  planCard: { flex: 1, minWidth: 0, borderRadius: 15, borderWidth: 1.5, paddingHorizontal: 12, paddingTop: short ? 9 : 12, paddingBottom: short ? 5 : 8, gap: short ? 2 : 3 },
  stackedPlanCard: { flex: 0 },
  planLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  planLabel: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  radio: { width: 17, height: 17, borderRadius: 9 },
  planPrice: { fontSize: short ? 18 : compact ? 20 : 22, fontWeight: '800', letterSpacing: -0.7, marginTop: 1, flexShrink: 1 },
  planCaption: { fontSize: 11, fontWeight: '500' },
  badge: { position: 'absolute', left: 13, top: -12, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, maxWidth: '95%' },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.4 },
  equivalent: { marginTop: short ? 3 : 5, fontSize: 11, lineHeight: 15, textAlign: 'center' },
  skeletonBar: { height: 12, borderRadius: 6, marginVertical: 4 },
  errorCard: { alignItems: 'center', alignSelf: 'stretch', borderRadius: 16, borderWidth: 1, gap: 4, marginTop: 10, padding: 8 },
  errorText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  retryButton: { minHeight: 44, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 22, justifyContent: 'center' },
  retryText: { fontSize: 14, fontWeight: '700' },
  envNotice: { fontSize: 11, lineHeight: 14, marginTop: 4, textAlign: 'center' },
  primaryButton: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    borderRadius: 15, minHeight: 46, padding: 10, marginTop: short ? 4 : 8 + 8 * breathingRoom, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  renewal: { fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 4 },
  stayButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  stayText: { fontSize: 12, fontWeight: '600' },
  legal: { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 18, borderTopWidth: StyleSheet.hairlineWidth },
  legalLink: { minHeight: 32 + 8 * breathingRoom, justifyContent: 'center' },
  legalText: { fontSize: 11, fontWeight: '500' },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.55 },
  });
};
