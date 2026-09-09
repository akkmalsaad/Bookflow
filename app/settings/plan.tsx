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
import { useTranslation } from '@/lib/use-translation';

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
  const { t } = useTranslation();
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
      Alert.alert(t('paywall.restoreFailed'), outcome.message);
      return;
    }
    if (outcome.status === 'purchased') {
      const restored = outcome.isPro;
      Alert.alert(
        restored ? t('plan.restored') : t('paywall.nothingToRestore'),
        restored ? t('plan.restored.body') : t('plan.nothingToRestore.body'),
      );
    }
  }, [restore, t]);

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
      <SettingsDetailScreen eyebrow={t('sub.account')} title={t('plan.title')} description={t('plan.description')}>
        <SettingsInfoRow label={t('plan.current')} value={isPro ? t('plan.pro') : t('plan.free')} />
        <SettingsNotice
          title={t('plan.needsApp')}
          body={
            isExpoGo
              ? t('plan.expoGo')
              : t('plan.storeOnly')
          }
        />
      </SettingsDetailScreen>
    );
  }

  if (isLoadingSubscription) {
    return (
      <SettingsDetailScreen eyebrow={t('sub.account')} title={t('plan.title')}>
        <View style={styles.loading}>
          <ActivityIndicator color={palette.accent} />
          <Text style={[styles.loadingText, { color: palette.muter }]}>{t('plan.checking')}</Text>
        </View>
      </SettingsDetailScreen>
    );
  }

  const savings = yearlySavingsPercent(monthlyPackage, yearlyPackage);
  const renewalLabel = entitlement?.willRenew ? t('plan.renews') : t('plan.accessEnds');

  return (
    <SettingsDetailScreen
      eyebrow={t('sub.account')}
      title={t('plan.title')}
      description={
        isPro
          ? t('plan.proBody')
          : t('plan.freeBody')
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
            {isPro ? t('plan.manage') : t('plan.upgrade')}
          </Text>
        </Pressable>
      }>
      <SettingsInfoRow label={t('plan.current')} value={isPro ? t('plan.pro') : t('plan.free')} />

      {/* Development-only: makes it unmistakable that a purchase here is simulated. Never renders
          in a release build, where the Test Store cannot be configured at all. */}
      {__DEV__ && environment === 'test-store' ? (
        <SettingsNotice
          title={t('plan.testStore')}
          body={t('plan.testStore.body')}
        />
      ) : null}

      {isPro && entitlement ? (
        <>
          <SettingsInfoRow label={renewalLabel} value={formatDate(entitlement.expirationDate)} />
          <SettingsInfoRow
            label={t('plan.billedThrough')}
            value={STORE_LABELS[entitlement.store] ?? t('plan.yourStore')}
          />
          {entitlement.billingIssueDetectedAt ? (
            <SettingsNotice
              title={t('plan.paymentProblem')}
              body={t('plan.paymentProblem.body')}
            />
          ) : null}
          {!entitlement.willRenew && !entitlement.billingIssueDetectedAt ? (
            <SettingsNotice
              title={t('plan.autoRenewOff')}
              body={t('plan.autoRenewOff.body', { date: formatDate(entitlement.expirationDate) })}
            />
          ) : null}
        </>
      ) : (
        <>
          <SettingsInfoRow label={t('plan.cost')} value={t('plan.noCharge')} />

          <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>{t('plan.pro')}</Text>
          <View style={[styles.priceCard, { backgroundColor: soft.surface, borderColor: soft.border }]}>
            <View style={styles.priceRow}>
              <Text style={[styles.priceLabel, { color: palette.text }]}>{t('plan.monthly')}</Text>
              <Text style={[styles.priceValue, { color: palette.text }]}>{describePackage(monthlyPackage)}</Text>
            </View>
            <View style={[styles.priceDivider, { backgroundColor: soft.divider }]} />
            <View style={styles.priceRow}>
              <View style={styles.priceLabelGroup}>
                <Text style={[styles.priceLabel, { color: palette.text }]}>{t('plan.yearly')}</Text>
                {savings ? (
                  <View style={[styles.badge, { backgroundColor: soft.accentSoft }]}>
                    <Text style={[styles.badgeText, { color: palette.accent }]}>{t('plan.save', { percent: savings })}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.priceValue, { color: palette.text }]}>{describePackage(yearlyPackage)}</Text>
            </View>
          </View>

          {!monthlyPackage && !yearlyPackage ? (
            <SettingsNotice
              title={t('plan.loading')}
              body={t('plan.loading.body')}
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
