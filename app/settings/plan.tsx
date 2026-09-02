import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Store } from 'react-native-purchases';

import {
  SettingsDetailScreen,
  SettingsInfoRow,
  SettingsNotice,
  settingsDetailStyles,
} from '@/components/settings/SettingsDetailScreen';
import { getSoftTokens } from '@/components/settings/tokens';
import { useSubscription } from '@/context/subscription-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { describePackage, isExpoGo, yearlySavingsPercent } from '@/lib/revenuecat';

/** Store ids are for logs; customers recognise the brand name they were charged by. */
const STORE_LABELS: Partial<Record<Store, string>> = {
  APP_STORE: 'Apple',
  MAC_APP_STORE: 'Apple',
  PLAY_STORE: 'Google Play',
  AMAZON: 'Amazon Appstore',
  GALAXY: 'Galaxy Store',
  STRIPE: 'Stripe',
  RC_BILLING: 'Web',
  PADDLE: 'Paddle',
  PROMOTIONAL: 'Complimentary',
  TEST_STORE: 'Test store',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PlanScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    canPurchase,
    entitlement,
    environment,
    error,
    isLoadingSubscription,
    isPro,
    isRestoring,
    monthlyPackage,
    openCustomerCenter,
    refreshSubscription,
    restore,
    yearlyPackage,
  } = useSubscription();

  const handleRestore = useCallback(async () => {
    const outcome = await restore();

    if (outcome.status === 'error') {
      Alert.alert('Restore failed', outcome.message);
      return;
    }
    if (outcome.status === 'purchased') {
      const restored = outcome.isPro;
      Alert.alert(
        restored ? 'Subscription restored' : 'Nothing to restore',
        restored
          ? 'Bookflow Pro is active on this account again.'
          : 'We could not find an active subscription for this store account.',
      );
    }
  }, [restore]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshSubscription();
    setIsRefreshing(false);
  }, [refreshSubscription]);

  // Billing needs the native SDK. Expo Go only ships RevenueCat's Preview API mock, so a purchase
  // there is never real whichever store is configured — including the Test Store. Everything else,
  // development build included, falls through to the real plan flow.
  if (!canPurchase) {
    return (
      <SettingsDetailScreen eyebrow="Account" title="Bookflow plan" description="Your current plan and what it includes.">
        <SettingsInfoRow label="Current plan" value={isPro ? 'Bookflow Pro' : 'Free'} />
        <SettingsNotice
          title="Subscriptions need the full app"
          body={
            isExpoGo
              ? 'In-app purchases are not available in Expo Go. Run a development build to buy, restore or manage a subscription — the RevenueCat Test Store works there without an Apple Developer account.'
              : 'In-app purchases are only available in the iOS and Android apps.'
          }
        />
      </SettingsDetailScreen>
    );
  }

  if (isLoadingSubscription) {
    return (
      <SettingsDetailScreen eyebrow="Account" title="Bookflow plan">
        <View style={styles.loading}>
          <ActivityIndicator color={palette.accent} />
          <Text style={[styles.loadingText, { color: palette.muter }]}>Checking your subscription…</Text>
        </View>
      </SettingsDetailScreen>
    );
  }

  const savings = yearlySavingsPercent(monthlyPackage, yearlyPackage);
  const renewalLabel = entitlement?.willRenew ? 'Renews' : 'Access ends';

  return (
    <SettingsDetailScreen
      eyebrow="Account"
      title="Bookflow plan"
      description={
        isPro
          ? 'You are on Bookflow Pro. Manage or cancel your subscription at any time.'
          : 'Upgrade to Bookflow Pro to unlock the full workspace.'
      }
      footer={
        <Pressable
          accessibilityRole="button"
          onPress={isPro ? openCustomerCenter : () => router.push('/paywall')}
          style={({ pressed }) => [
            settingsDetailStyles.primaryButton,
            { backgroundColor: palette.accent, shadowColor: palette.accent, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Text style={settingsDetailStyles.primaryButtonText}>
            {isPro ? 'Manage subscription' : 'Upgrade to Pro'}
          </Text>
        </Pressable>
      }>
      <SettingsInfoRow label="Current plan" value={isPro ? 'Bookflow Pro' : 'Free'} />

      {/* Development-only: makes it unmistakable that a purchase here is simulated. Never renders
          in a release build, where the Test Store cannot be configured at all. */}
      {__DEV__ && environment === 'test-store' ? (
        <SettingsNotice
          title="RevenueCat Test Store"
          body="Purchases on this build are simulated by RevenueCat and cost nothing. No Apple Developer account or App Store product is involved. Release builds use the App Store."
        />
      ) : null}

      {isPro && entitlement ? (
        <>
          <SettingsInfoRow label={renewalLabel} value={formatDate(entitlement.expirationDate)} />
          <SettingsInfoRow
            label="Billed through"
            value={STORE_LABELS[entitlement.store] ?? 'Your store'}
          />
          {entitlement.billingIssueDetectedAt ? (
            <SettingsNotice
              title="There is a problem with your payment"
              body="Your store could not take the last payment. Open Manage subscription to update your payment method before access ends."
            />
          ) : null}
          {!entitlement.willRenew && !entitlement.billingIssueDetectedAt ? (
            <SettingsNotice
              title="Auto-renew is off"
              body={`Bookflow Pro stays active until ${formatDate(entitlement.expirationDate)}, then this account returns to the free plan.`}
            />
          ) : null}
        </>
      ) : (
        <>
          <SettingsInfoRow label="Cost" value="No charge" />

          <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>Bookflow Pro</Text>
          <View style={[styles.priceCard, { backgroundColor: soft.surface, borderColor: soft.border }]}>
            <View style={styles.priceRow}>
              <Text style={[styles.priceLabel, { color: palette.text }]}>Monthly</Text>
              <Text style={[styles.priceValue, { color: palette.text }]}>{describePackage(monthlyPackage)}</Text>
            </View>
            <View style={[styles.priceDivider, { backgroundColor: soft.divider }]} />
            <View style={styles.priceRow}>
              <View style={styles.priceLabelGroup}>
                <Text style={[styles.priceLabel, { color: palette.text }]}>Yearly</Text>
                {savings ? (
                  <View style={[styles.badge, { backgroundColor: soft.accentSoft }]}>
                    <Text style={[styles.badgeText, { color: palette.accent }]}>Save {savings}%</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.priceValue, { color: palette.text }]}>{describePackage(yearlyPackage)}</Text>
            </View>
          </View>

          {!monthlyPackage && !yearlyPackage ? (
            <SettingsNotice
              title="Plans are still loading"
              body="We could not reach the store for pricing. Check your connection and pull the prices again."
            />
          ) : null}
        </>
      )}

      {error ? (
        <View style={[styles.errorCard, { backgroundColor: soft.dangerSoft }]}>
          <Ionicons name="alert-circle-outline" size={17} color={palette.danger} />
          <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.secondaryActions}>
        <Pressable
          accessibilityRole="button"
          disabled={isRestoring}
          onPress={handleRestore}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={[styles.secondaryText, { color: palette.accent }]}>
            {isRestoring ? 'Restoring…' : 'Restore purchases'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={isRefreshing}
          onPress={handleRefresh}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={[styles.secondaryText, { color: palette.muter }]}>
            {isRefreshing ? 'Refreshing…' : 'Refresh status'}
          </Text>
        </Pressable>
      </View>
    </SettingsDetailScreen>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 48,
  },
  loadingText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  priceCard: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  priceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 15,
  },
  priceLabelGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  priceLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  priceDivider: {
    height: StyleSheet.hairlineWidth,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  errorCard: {
    alignItems: 'flex-start',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 9,
    marginTop: 14,
    padding: 14,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  secondaryActions: {
    alignItems: 'center',
    gap: 4,
    marginTop: 22,
  },
  secondaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
