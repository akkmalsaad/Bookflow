import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSoftTokens } from '@/components/settings/tokens';
import { useSubscription } from '@/context/subscription-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import {
  describeMonthlyEquivalent,
  describePackage,
  isExpoGo,
  yearlySavingsPercent,
} from '@/lib/revenuecat';

type PlanId = 'monthly' | 'yearly';

const BENEFITS = [
  'Unlimited customers',
  'Unlimited bookings',
  'Business logo on invoices',
  'Advanced financial analytics',
  'Invoice customization',
  'More Pro features as they become available',
];

/**
 * The Bookflow Pro paywall. Custom-built rather than a RevenueCat-hosted template so it inherits
 * the app's Soft UI surfaces, palette and type scale — but every price on screen still comes from
 * the store via RevenueCat, and access is always decided by the `pro` entitlement, never by this
 * screen.
 */
export default function PaywallScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

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

  const [selectedPlan, setSelectedPlan] = useState<PlanId>('monthly');
  const proDestination = returnTo === '/business-insights' ? '/business-insights' : null;

  const close = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [router]);

  // Default to monthly, but never leave a plan selected that did not load.
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

  const savings = useMemo(() => yearlySavingsPercent(monthlyPackage, yearlyPackage), [monthlyPackage, yearlyPackage]);
  const monthlyEquivalent = useMemo(() => describeMonthlyEquivalent(yearlyPackage), [yearlyPackage]);

  const selectedPackage = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;
  const isBusy = isPurchasing || isRestoring;

  const handleUpgrade = useCallback(async () => {
    if (!selectedPackage || isBusy) return;

    const outcome = await purchase(selectedPackage);

    // Backing out of the store sheet is a decision, not a failure — drop the loading state and
    // leave the customer exactly where they were.
    if (outcome.status === 'cancelled') return;

    if (outcome.status === 'error') {
      Alert.alert('Purchase incomplete', outcome.message);
      return;
    }

    if (outcome.status === 'purchased' && !outcome.isPro) {
      // A completed transaction that did not grant the entitlement means the product is not
      // attached to `pro` in the dashboard, or the receipt is still being processed.
      Alert.alert(
        'Almost there',
        'Your purchase went through but Pro has not unlocked yet. It should appear shortly — try Restore Purchases if it does not.',
      );
    } else if (outcome.status === 'purchased') {
      // The purchase response already contains fresh CustomerInfo; this follow-up also reconciles
      // any store-side entitlement propagation before a gated destination replaces the paywall.
      await refreshSubscription();
    }
    // The `isPro` effect above closes the screen once the entitlement lands.
  }, [isBusy, purchase, refreshSubscription, selectedPackage]);

  const handleRestore = useCallback(async () => {
    if (isBusy) return;

    const outcome = await restore();

    if (outcome.status === 'error') {
      Alert.alert('Restore failed', outcome.message);
      return;
    }
    if (outcome.status === 'purchased' && !outcome.isPro) {
      Alert.alert(
        'Nothing to restore',
        'We could not find an active Bookflow Pro subscription for this store account.',
      );
    }
  }, [isBusy, restore]);

  // `canPurchase` comes from the subscription context, which knows which store is configured —
  // App Store, Play Store or the development Test Store. A development build purchases normally on
  // all three; only Expo Go's mocked Preview API is excluded.
  const canSubmitPurchase = Boolean(selectedPackage) && canPurchase && !isBusy;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          disabled={isBusy}
          hitSlop={8}
          onPress={close}
          style={({ pressed }) => [
            styles.closeButton,
            { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow },
            pressed && styles.pressed,
            isBusy && styles.disabled,
          ]}>
          <Ionicons name="close" size={21} color={palette.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* The app's existing logo asset — the same one the splash, sign-in and dashboard use. */}
        <Image
          source={require('@/assets/images/bookflow-logo.png')}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="Bookflow"
        />

        <Text style={[styles.title, { color: palette.text }]}>Bookflow Pro</Text>
        <Text style={[styles.subtitle, { color: palette.accent }]}>Run your business without limits</Text>
        <Text style={[styles.supporting, { color: palette.muter }]}>
          Unlock powerful tools built for independent professionals.
        </Text>

        <View style={[styles.benefits, { backgroundColor: soft.surface, borderColor: soft.border }]}>
          {BENEFITS.map((benefit) => (
            <View key={benefit} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={19} color={palette.accent} />
              <Text style={[styles.benefitText, { color: palette.text }]}>{benefit}</Text>
            </View>
          ))}
        </View>

        {isLoadingOfferings ? (
          <PlanSkeleton isDarkMode={isDarkMode} />
        ) : offeringError || (!monthlyPackage && !yearlyPackage) ? (
          <View style={[styles.errorCard, { backgroundColor: soft.surface, borderColor: soft.border }]}>
            <Ionicons name="cloud-offline-outline" size={22} color={palette.muter} />
            <Text style={[styles.errorText, { color: palette.muter }]}>
              Unable to load subscription options. Please try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={reloadOfferings}
              style={({ pressed }) => [
                styles.retryButton,
                { borderColor: palette.accent },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.retryText, { color: palette.accent }]}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.plans}>
            {monthlyPackage ? (
              <PlanCard
                isDarkMode={isDarkMode}
                label="Monthly"
                price={`${describePackage(monthlyPackage)} / month`}
                selected={selectedPlan === 'monthly'}
                onPress={() => setSelectedPlan('monthly')}
                disabled={isBusy}
              />
            ) : null}
            {yearlyPackage ? (
              <PlanCard
                isDarkMode={isDarkMode}
                label="Yearly"
                price={`${describePackage(yearlyPackage)} / year`}
                caption={monthlyEquivalent ? `About ${monthlyEquivalent}/month` : undefined}
                badge={savings ? `BEST VALUE · SAVE ${savings}%` : 'BEST VALUE'}
                selected={selectedPlan === 'yearly'}
                onPress={() => setSelectedPlan('yearly')}
                disabled={isBusy}
              />
            ) : null}
          </View>
        )}

        {!canPurchase ? (
          <Text style={[styles.envNotice, { color: palette.muter }]}>
            {isExpoGo
              ? 'Purchases are not available in Expo Go. Run a development build to subscribe.'
              : 'Purchases are only available in the iOS and Android apps.'}
          </Text>
        ) : null}

        {/* Development-only: says plainly that this purchase is simulated. */}
        {__DEV__ && environment === 'test-store' ? (
          <Text style={[styles.envNotice, { color: palette.muter }]}>
            RevenueCat Test Store — this purchase is simulated and costs nothing.
          </Text>
        ) : null}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={[styles.footer, { borderTopColor: soft.divider }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmitPurchase, busy: isPurchasing }}
          disabled={!canSubmitPurchase}
          onPress={handleUpgrade}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: palette.accent, shadowColor: palette.accent },
            pressed && styles.pressed,
            !canPurchase && styles.disabled,
          ]}>
          {isPurchasing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Upgrade to Pro</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy, busy: isRestoring }}
          disabled={isBusy}
          onPress={handleRestore}
          style={({ pressed }) => [styles.restoreButton, pressed && styles.pressed, isBusy && styles.disabled]}>
          <Text style={[styles.restoreText, { color: palette.muter }]}>
            {isRestoring ? 'Restoring…' : 'Restore Purchases'}
          </Text>
        </Pressable>

        <View style={styles.legal}>
          <Pressable accessibilityRole="link" hitSlop={6} onPress={() => router.push('/settings/terms')}>
            <Text style={[styles.legalText, { color: palette.muter }]}>Terms of Service</Text>
          </Pressable>
          <Text style={[styles.legalText, { color: palette.muter }]}> · </Text>
          <Pressable accessibilityRole="link" hitSlop={6} onPress={() => router.push('/settings/privacy')}>
            <Text style={[styles.legalText, { color: palette.muter }]}>Privacy Policy</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

/** Selectable plan card. Mirrors the selection idiom used by SettingsOptionRow. */
function PlanCard({
  isDarkMode,
  label,
  price,
  caption,
  badge,
  selected,
  onPress,
  disabled,
}: {
  isDarkMode: boolean;
  label: string;
  price: string;
  caption?: string;
  badge?: string;
  selected: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${label}, ${price}`}
      accessibilityHint={caption}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.planCard,
        {
          backgroundColor: selected ? soft.accentSoft : soft.surface,
          borderColor: selected ? palette.accent : soft.border,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <View style={styles.planCopy}>
        <View style={styles.planLabelRow}>
          <Text style={[styles.planLabel, { color: palette.text }]}>{label}</Text>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: palette.accent }]}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.planPrice, { color: palette.text }]}>{price}</Text>
        {caption ? <Text style={[styles.planCaption, { color: palette.muter }]}>{caption}</Text> : null}
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={selected ? palette.accent : palette.muter}
      />
    </Pressable>
  );
}

/** Static placeholders so prices fade in rather than replacing empty-looking cards. */
function PlanSkeleton({ isDarkMode }: { isDarkMode: boolean }) {
  const soft = getSoftTokens(isDarkMode);

  return (
    <View style={styles.plans}>
      {[0, 1].map((index) => (
        <View
          key={index}
          style={[styles.planCard, styles.skeletonCard, { backgroundColor: soft.surface, borderColor: soft.border }]}>
          <View style={styles.planCopy}>
            <View style={[styles.skeletonBar, { backgroundColor: soft.inset, width: '38%' }]} />
            <View style={[styles.skeletonBar, styles.skeletonBarWide, { backgroundColor: soft.inset }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    elevation: 4,
    height: 44,
    justifyContent: 'center',
    shadowOffset: { height: 6, width: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    width: 44,
  },
  content: {
    alignItems: 'center',
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  logo: {
    height: 72,
    width: 72,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: 14,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 6,
    textAlign: 'center',
  },
  supporting: {
    fontSize: 13.5,
    fontWeight: '500',
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 320,
    textAlign: 'center',
  },
  benefits: {
    alignSelf: 'stretch',
    borderRadius: 20,
    borderWidth: 1,
    gap: 11,
    marginTop: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  benefitRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  plans: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 18,
  },
  planCard: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1.5,
    flexDirection: 'row',
    minHeight: 78,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  planCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
    paddingRight: 12,
  },
  planLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  planLabel: {
    fontSize: 15,
    fontWeight: '800',
  },
  planPrice: {
    fontSize: 16,
    fontWeight: '800',
  },
  planCaption: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  badge: {
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  skeletonCard: {
    justifyContent: 'center',
  },
  skeletonBar: {
    borderRadius: 6,
    height: 12,
  },
  skeletonBarWide: {
    height: 16,
    width: '62%',
  },
  errorCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  errorText: {
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: 13,
    borderWidth: 1.5,
    marginTop: 2,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '800',
  },
  envNotice: {
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 16,
    maxWidth: 320,
    textAlign: 'center',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 17,
    elevation: 5,
    justifyContent: 'center',
    minHeight: 52,
    shadowOffset: { height: 7, width: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  restoreButton: {
    alignItems: 'center',
    marginTop: 4,
    paddingVertical: 11,
  },
  restoreText: {
    fontSize: 14,
    fontWeight: '700',
  },
  legal: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 6,
  },
  legalText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.55,
  },
});
