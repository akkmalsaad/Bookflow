import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesEntitlementInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';

import { useAuth } from '@/context/auth-context';
import {
  configurePurchases,
  describeEnvironment,
  getActiveEnvironment,
  DEFAULT_OFFERING_ID,
  describePurchasesError,
  getProEntitlement,
  hasProAccess,
  isExpoGo,
  isPurchasesSupported,
  isUserCancelled,
  logCustomerInfo,
  logRevenueCatDebug,
  logPurchasesError,
  readPackages,
  syncPurchasesIdentity,
  type RevenueCatEnvironment,
} from '@/lib/revenuecat';

export type PurchaseOutcome =
  | { status: 'purchased'; customerInfo: CustomerInfo; isPro: boolean }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

type SubscriptionContextValue = {
  /** True until the first customer info fetch settles. Screens use it to avoid flashing "Free". */
  isLoadingSubscription: boolean;
  /** Which store this build talks to. 'test-store' means simulated purchases in development. */
  environment: RevenueCatEnvironment;
  /**
   * Whether a purchase can actually be attempted here. Screens gate on this rather than on Expo Go
   * or the platform directly, so adding a store never means revisiting every screen.
   */
  canPurchase: boolean;
  /** The single gate for paid features. Derived from the entitlement, never from a product id. */
  isPro: boolean;
  entitlement: PurchasesEntitlementInfo | null;
  customerInfo: CustomerInfo | null;

  /** The current offering and the two packages the paywall renders. */
  offering: PurchasesOffering | null;
  availablePackages: PurchasesPackage[];
  monthlyPackage: PurchasesPackage | null;
  yearlyPackage: PurchasesPackage | null;
  isLoadingOfferings: boolean;
  /** Set when plans could not be loaded — drives the paywall's retry state. */
  offeringError: string | null;

  /** Set when billing is unavailable (web, Expo Go, missing key) or entitlement refresh failed. */
  error: string | null;
  isPurchasing: boolean;
  isRestoring: boolean;

  refreshSubscription: () => Promise<void>;
  reloadOfferings: () => Promise<void>;
  purchase: (pkg: PurchasesPackage) => Promise<PurchaseOutcome>;
  restore: () => Promise<PurchaseOutcome>;
  /** Opens the Customer Center: cancel, change plan, request a refund, restore. */
  openCustomerCenter: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

/**
 * Owns every conversation with RevenueCat. Screens never import `react-native-purchases`
 * directly — they read `isPro` and open `/paywall`, which keeps entitlement state in one place and
 * stops every Pro-gated feature making its own SDK calls.
 *
 * Must sit inside AuthProvider: the RevenueCat app user id is kept in step with the Clerk user so
 * a subscription follows the account across devices instead of being stranded on one install.
 */
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoaded: isAuthLoaded, user } = useAuth();

  // A new scope also distinguishes A -> signed out -> A from the original A session.
  const identity = useMemo(() => ({
    userId: !isAuthLoaded ? undefined : isAuthenticated ? user?.id : null,
  }), [isAuthLoaded, isAuthenticated, user?.id]);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const readyIdentity = useRef<typeof identity | null>(null);

  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [customer, setCustomer] = useState<{ identity: typeof identity; info: CustomerInfo } | null>(null);
  // Hide the previous account's entitlements during the render that observes an auth change,
  // before the asynchronous identity effect has had a chance to run.
  const customerInfo = identity.userId && customer?.identity === identity ? customer.info : null;
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [isLoadingOfferings, setIsLoadingOfferings] = useState(true);
  const [offeringError, setOfferingError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const [environment, setEnvironment] = useState<RevenueCatEnvironment>('unsupported');

  const isConfigured = useRef(false);
  const isMounted = useRef(true);
  const appState = useRef(AppState.currentState);

  const isIdentityReady = useCallback(() => (
    isMounted.current && currentIdentity.current === identity && readyIdentity.current === identity
  ), [identity]);

  const syncCustomerInfo = useCallback((context: string, info: CustomerInfo) => {
    if (!isIdentityReady()) return;
    logCustomerInfo(context, info);
    setCustomer({ identity, info });
  }, [identity, isIdentityReady]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  /**
   * Loads the current offering. Failures are isolated in `offeringError` rather than the general
   * `error`, because a missing offering only breaks the paywall — cached entitlements still work.
   */
  const reloadOfferings = useCallback(async () => {
    if (!isConfigured.current) {
      setIsLoadingOfferings(false);
      return;
    }

    setIsLoadingOfferings(true);
    setOfferingError(null);
    try {
      const offerings = await Purchases.getOfferings();
      const next = DEFAULT_OFFERING_ID ? offerings.all[DEFAULT_OFFERING_ID] ?? null : offerings.current;
      if (!isMounted.current) return;

      setOffering(next ?? null);
      if (next) {
        logRevenueCatDebug('Offering loaded', { identifier: next.identifier });
        next.availablePackages.forEach((pkg) => {
          logRevenueCatDebug('Package loaded', {
            package: pkg.identifier,
            product: pkg.product.identifier,
            price: pkg.product.priceString,
          });
        });
      }
      if (!next || next.availablePackages.length === 0) {
        logRevenueCatDebug('No current offering', {
          environment: describeEnvironment(getActiveEnvironment()),
          offeringsFound: Object.keys(offerings.all),
          hint: 'Mark an Offering as Current in the RevenueCat dashboard and attach a package to it.',
        });
        setOfferingError('Unable to load subscription options. Please try again.');
      }
    } catch (loadError) {
      logPurchasesError('getOfferings', loadError);
      if (isMounted.current) setOfferingError('Unable to load subscription options. Please try again.');
    } finally {
      if (isMounted.current) setIsLoadingOfferings(false);
    }
  }, []);

  // Configure once; customer info is loaded only after Clerk identity synchronization below.
  useEffect(() => {
    const result = configurePurchases();
    if (!result.ok) {
      setError(result.reason ?? 'Billing is unavailable.');
      setIsLoadingSubscription(false);
      setIsLoadingOfferings(false);
      return;
    }
    isConfigured.current = true;
    setEnvironment(getActiveEnvironment());

    void reloadOfferings();
  }, [reloadOfferings]);

  // Keep the RevenueCat app user id aligned with the signed-in Clerk user. Configuring anonymously
  // and identifying on sign-in leaves Clerk's own flow untouched. Billing waits for identity.
  useEffect(() => {
    if (!isConfigured.current || identity.userId === undefined) return;
    const userId = identity.userId;

    let cancelled = false;
    let listener: (() => void) | undefined;
    readyIdentity.current = null;
    setCustomer(null);
    setIsLoadingSubscription(true);
    setError(null);

    (async () => {
      try {
        const info = await syncPurchasesIdentity(userId);
        if (cancelled || currentIdentity.current !== identity) return;
        readyIdentity.current = identity;
        syncCustomerInfo('Clerk identity synchronized', info);

        // Re-read current SDK state rather than trusting a notification payload that could have
        // originated from an operation started under a previous account.
        listener = () => {
          if (!isIdentityReady()) return;
          void Purchases.getCustomerInfo().then((updated) => {
            if (!cancelled) syncCustomerInfo('CustomerInfo listener update', updated);
          }).catch((listenerError) => logPurchasesError('customer info listener', listenerError));
        };
        Purchases.addCustomerInfoUpdateListener(listener);
        await reloadOfferings();
      } catch (identityError) {
        logPurchasesError('identity sync', identityError);
        if (!cancelled && isMounted.current && currentIdentity.current === identity) {
          setError(describePurchasesError(identityError, 'Could not sync your subscription to this account.'));
        }
      } finally {
        if (!cancelled && isMounted.current && currentIdentity.current === identity) {
          setIsLoadingSubscription(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      readyIdentity.current = null;
      if (listener) Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [identity, isIdentityReady, reloadOfferings, syncCustomerInfo]);

  const refreshSubscription = useCallback(async (reason = 'Customer info refresh') => {
    if (!isConfigured.current || !isIdentityReady()) return;

    setError(null);
    try {
      const info = await Purchases.getCustomerInfo();
      syncCustomerInfo(reason, info);
    } catch (refreshError) {
      logPurchasesError('refresh customer info', refreshError);
      if (isIdentityReady()) setError(describePurchasesError(refreshError, 'Could not refresh your subscription.'));
    }
  }, [isIdentityReady, syncCustomerInfo]);

  // StoreKit state can change while Bookflow is backgrounded (sandbox renewal, cancellation,
  // billing retry, or a purchase managed in the App Store). Re-read CustomerInfo on foreground so
  // the global entitlement state updates without requiring a restart.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackgrounded = appState.current === 'background' || appState.current === 'inactive';
      appState.current = nextState;
      if (wasBackgrounded && nextState === 'active') {
        void refreshSubscription('App returned to foreground');
      }
    });

    return () => subscription.remove();
  }, [refreshSubscription]);

  const purchase = useCallback(async (pkg: PurchasesPackage): Promise<PurchaseOutcome> => {
    if (!isConfigured.current) {
      return { status: 'error', message: 'Billing is unavailable on this device.' };
    }
    if (!identity.userId || !isIdentityReady()) {
      return { status: 'error', message: 'Please wait for your account subscription to sync.' };
    }

    setIsPurchasing(true);
    try {
      logRevenueCatDebug('Purchase started', { package: pkg.identifier });
      const { customerInfo: purchaseInfo } = await Purchases.purchasePackage(pkg);
      if (!isIdentityReady()) return { status: 'error', message: 'Your account changed during the purchase.' };
      syncCustomerInfo('Purchase result', purchaseInfo);

      // A correctly attached product normally returns the active entitlement immediately. If it
      // does not, force one uncached verification before the paywall shows its configuration hint.
      let verifiedInfo = purchaseInfo;
      if (!hasProAccess(purchaseInfo)) {
        try {
          await Purchases.invalidateCustomerInfoCache();
          verifiedInfo = await Purchases.getCustomerInfo();
          syncCustomerInfo('Purchase verification refresh', verifiedInfo);
        } catch (verificationError) {
          logPurchasesError('purchase verification refresh', verificationError);
        }
      }
      if (!isIdentityReady()) return { status: 'error', message: 'Your account changed during the purchase.' };
      // The entitlement on the freshly returned customer info is the source of truth — the caller
      // never assumes a completed transaction means access was granted.
      if (hasProAccess(verifiedInfo)) {
        logRevenueCatDebug('Purchase completed');
        logRevenueCatDebug('Pro entitlement active');
      } else {
        logRevenueCatDebug('Purchase completed but the pro entitlement is not active', {
          hint: 'Attach the purchased product to the "pro" entitlement in the RevenueCat dashboard.',
        });
      }
      return { status: 'purchased', customerInfo: verifiedInfo, isPro: hasProAccess(verifiedInfo) };
    } catch (purchaseError) {
      if (isUserCancelled(purchaseError)) {
        logRevenueCatDebug('Purchase cancelled');
        return { status: 'cancelled' };
      }

      logPurchasesError('purchasePackage', purchaseError);
      return {
        status: 'error',
        message: describePurchasesError(purchaseError, "We couldn't complete the purchase. Please try again."),
      };
    } finally {
      if (isMounted.current) setIsPurchasing(false);
    }
  }, [identity, isIdentityReady, syncCustomerInfo]);

  /**
   * Required by both stores: a customer who reinstalls, or signs in on a second device, must be
   * able to get their subscription back without paying again.
   */
  const restore = useCallback(async (): Promise<PurchaseOutcome> => {
    if (!isConfigured.current) {
      return { status: 'error', message: 'Billing is unavailable on this device.' };
    }
    if (!identity.userId || !isIdentityReady()) {
      return { status: 'error', message: 'Please wait for your account subscription to sync.' };
    }

    setIsRestoring(true);
    try {
      const info = await Purchases.restorePurchases();
      if (!isIdentityReady()) return { status: 'error', message: 'Your account changed during the restore.' };
      logRevenueCatDebug('Restore completed', { pro: hasProAccess(info) });
      syncCustomerInfo('Restore result', info);
      return { status: 'purchased', customerInfo: info, isPro: hasProAccess(info) };
    } catch (restoreError) {
      logPurchasesError('restorePurchases', restoreError);
      return {
        status: 'error',
        message: describePurchasesError(restoreError, 'Could not restore your purchases. Please try again.'),
      };
    } finally {
      if (isMounted.current) setIsRestoring(false);
    }
  }, [identity, isIdentityReady, syncCustomerInfo]);

  const openCustomerCenter = useCallback(async () => {
    if (!isConfigured.current || !identity.userId || !isIdentityReady()) return;

    try {
      await RevenueCatUI.presentCustomerCenter({
        callbacks: {
          onRestoreCompleted: ({ customerInfo: info }) => {
            syncCustomerInfo('Customer Center restore result', info);
          },
          onRestoreFailed: ({ error: restoreError }) => {
            logPurchasesError('customer center restore', restoreError);
            if (isMounted.current) setError(describePurchasesError(restoreError, 'Could not restore your purchases.'));
          },
          // Cancelling happens in the store, so the entitlement does not change until the period
          // ends. Re-reading customer info picks up `willRenew: false` for the plan screen.
          onShowingManageSubscriptions: () => {
            void refreshSubscription();
          },
          onManagementOptionSelected: () => {
            void refreshSubscription();
          },
          onPromotionalOfferSucceeded: ({ customerInfo: info }) => {
            syncCustomerInfo('Promotional offer result', info);
          },
        },
      });
      await refreshSubscription();
    } catch (centerError) {
      logPurchasesError('presentCustomerCenter', centerError);
      if (isMounted.current) setError(describePurchasesError(centerError, 'Could not open subscription management.'));
    }
  }, [identity, isIdentityReady, refreshSubscription, syncCustomerInfo]);

  const { monthly, yearly } = useMemo(() => readPackages(offering), [offering]);
  // The one and only answer to "is this user Pro", in every build: the RevenueCat entitlement.
  // No development override — otherwise a Test Store purchase could never actually be verified.
  const effectiveIsPro = hasProAccess(customerInfo);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      isLoadingSubscription: isLoadingSubscription || (environment !== 'unsupported' && customer?.identity !== identity && !error),
      environment,
      // Expo Go's Preview API mocks the SDK, so a purchase there is never real regardless of key.
      canPurchase: environment !== 'unsupported' && !isExpoGo && Boolean(identity.userId) && isIdentityReady(),
      isPro: effectiveIsPro,
      entitlement: getProEntitlement(customerInfo),
      customerInfo,
      offering,
      availablePackages: offering?.availablePackages ?? [],
      monthlyPackage: monthly,
      yearlyPackage: yearly,
      isLoadingOfferings,
      offeringError,
      error,
      isPurchasing,
      isRestoring,
      refreshSubscription,
      reloadOfferings,
      purchase,
      restore,
      openCustomerCenter,
    }),
    [
      customer,
      identity,
      isIdentityReady,
      customerInfo,
      effectiveIsPro,
      environment,
      error,
      isLoadingOfferings,
      isLoadingSubscription,
      isPurchasing,
      isRestoring,
      monthly,
      offering,
      offeringError,
      openCustomerCenter,
      purchase,
      refreshSubscription,
      reloadOfferings,
      restore,
      yearly,
    ],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);

  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }

  return context;
}

/**
 * Gate for Pro-only features. Returns true when access is already granted; otherwise it opens the
 * paywall and returns false, so a caller reads as:
 *
 *   const requirePro = useRequirePro();
 *   if (!requirePro()) return;   // paywall opened, stop here
 *   attachBusinessLogo();
 */
export function useRequirePro(returnTo?: '/business-insights') {
  const { isPro } = useSubscription();
  const router = useRouter();

  return useCallback(() => {
    if (isPro) return true;
    // Destination-aware gates still show the existing paywall on unsupported platforms so the
    // user gets its clear device/build explanation instead of tapping a card that appears inert.
    // Existing no-destination gates keep their prior native-only behaviour.
    if (isPurchasesSupported || returnTo) {
      router.push(returnTo ? { pathname: '/paywall', params: { returnTo } } : '/paywall');
    }
    return false;
  }, [isPro, returnTo, router]);
}
