import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PACKAGE_TYPE,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesEntitlementInfo,
  type PurchasesError,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

/**
 * Single source of truth for the RevenueCat wiring. Screens and the subscription context read
 * these constants instead of hard-coding identifiers, so renaming an entitlement or swapping an
 * offering is a one-line change here.
 */

/**
 * Entitlement configured in the RevenueCat dashboard. Everything paid hangs off this one id —
 * change it here and the whole app follows.
 *
 * Must match the dashboard's *Identifier* column exactly, not its display name, and it is
 * case-sensitive. Bookflow's project uses `bookflow_pro` (display name "Bookflow Pro").
 */
export const PRO_ENTITLEMENT_ID = 'bookflow_pro';

/**
 * Offering to load plans from. `null` means "whatever offering is marked Current in the
 * dashboard", which is what you want in production — it lets you swap offerings and run
 * experiments without shipping an app update.
 */
export const DEFAULT_OFFERING_ID: string | null = null;

/**
 * Fallback package identifiers, used only when an offering does not expose the typed
 * `monthly` / `annual` shortcuts. These are RevenueCat's predefined duration ids.
 */
export const PACKAGE_IDS = {
  monthly: '$rc_monthly',
  yearly: '$rc_annual',
} as const;

/**
 * Public SDK keys are platform-specific: an Apple key never authenticates a Play Store purchase.
 * Keep them in .env.local (EXPO_PUBLIC_* is inlined at build time) so a key rotation does not
 * require a code change.
 */
const API_KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '',
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '',
  /**
   * RevenueCat Test Store key. Routes purchases to RevenueCat's own simulated store instead of
   * StoreKit or Play Billing, so the whole purchase → entitlement → unlock path can be exercised
   * with no Apple Developer account and no store products.
   *
   * Development only. `resolveRevenueCatConfig` refuses to hand this to a release build.
   */
  test: process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY ?? '',
};

const TEST_KEY_PREFIX = 'test_';

/** Which backend the SDK will actually talk to, decided once and reported to the UI. */
export type RevenueCatEnvironment = 'test-store' | 'app-store' | 'play-store' | 'unsupported';

/** Expo Go ships a mock ("Preview API") build of the SDK and web has no store at all. */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const isPurchasesSupported = Platform.OS === 'ios' || Platform.OS === 'android';

export type RevenueCatConfig =
  | { ok: true; environment: Exclude<RevenueCatEnvironment, 'unsupported'>; apiKey: string }
  | { ok: false; environment: RevenueCatEnvironment; reason: string };

/**
 * Decides which key — and therefore which store — this build uses.
 *
 * The rules, in order:
 *
 * 1. Release builds never touch the Test Store. A `test_` key reaching production is treated as a
 *    misconfiguration and billing is disabled rather than silently pointed at simulated purchases.
 * 2. In development a `test_` key wins when present, which is what removes the Apple Developer
 *    account from the loop.
 * 3. Otherwise the platform key is used, and must carry its real prefix.
 *
 * Everything downstream — entitlements, gating, the paywall — is identical whichever branch runs.
 * Only the store behind the purchase differs.
 */
export function resolveRevenueCatConfig(): RevenueCatConfig {
  if (!isPurchasesSupported) {
    return {
      ok: false,
      environment: 'unsupported',
      reason: 'In-app purchases are only available in the iOS and Android apps.',
    };
  }

  const platformKey = Platform.OS === 'ios' ? API_KEYS.ios : API_KEYS.android;
  const platformEnvironment: RevenueCatEnvironment = Platform.OS === 'ios' ? 'app-store' : 'play-store';
  const expectedPrefix = Platform.OS === 'ios' ? 'appl_' : 'goog_';

  if (!__DEV__) {
    // Belt and braces: refuse a test key even if one is inlined into a release bundle by mistake.
    if (platformKey.startsWith(TEST_KEY_PREFIX)) {
      return {
        ok: false,
        environment: platformEnvironment,
        reason: 'Billing is not configured correctly. Please contact support.',
      };
    }
    if (!platformKey || !platformKey.startsWith(expectedPrefix)) {
      return {
        ok: false,
        environment: platformEnvironment,
        reason: 'Billing is not configured correctly. Please contact support.',
      };
    }
    return { ok: true, environment: platformEnvironment, apiKey: platformKey };
  }

  // ---- development ----
  const testKey = API_KEYS.test || (platformKey.startsWith(TEST_KEY_PREFIX) ? platformKey : '');
  if (testKey.startsWith(TEST_KEY_PREFIX)) {
    return { ok: true, environment: 'test-store', apiKey: testKey };
  }

  if (!platformKey) {
    return {
      ok: false,
      environment: platformEnvironment,
      reason:
        'No RevenueCat key found. Add EXPO_PUBLIC_REVENUECAT_TEST_KEY to .env.local to use the Test Store, ' +
        `or EXPO_PUBLIC_REVENUECAT_${Platform.OS.toUpperCase()}_API_KEY for a real store build.`,
    };
  }

  if (!platformKey.startsWith(expectedPrefix)) {
    return {
      ok: false,
      environment: platformEnvironment,
      reason:
        `The RevenueCat ${Platform.OS} key is not a ${expectedPrefix} public SDK key. ` +
        'Use EXPO_PUBLIC_REVENUECAT_TEST_KEY for Test Store development.',
    };
  }

  return { ok: true, environment: platformEnvironment, apiKey: platformKey };
}

const ENVIRONMENT_LABELS: Record<RevenueCatEnvironment, string> = {
  'test-store': 'Test Store',
  'app-store': 'App Store',
  'play-store': 'Play Store',
  unsupported: 'Unsupported',
};

export function describeEnvironment(environment: RevenueCatEnvironment): string {
  return ENVIRONMENT_LABELS[environment];
}

/** Development diagnostics intentionally contain state only — never SDK keys or receipts. */
export function logRevenueCatDebug(message: string, details?: Record<string, unknown>): void {
  if (!__DEV__) return;

  if (details) {
    console.log(`[RevenueCat] ${message}`, details);
  } else {
    console.log(`[RevenueCat] ${message}`);
  }
}

export function logCustomerInfo(context: string, customerInfo: CustomerInfo): void {
  if (!__DEV__) return;

  const activeEntitlements = Object.keys(customerInfo.entitlements.active);
  const allEntitlements = Object.keys(customerInfo.entitlements.all);
  const purchasedProducts = customerInfo.allPurchasedProductIdentifiers ?? [];

  console.log(`[RevenueCat] ${context} — active entitlements:`, activeEntitlements);
  console.log(`[RevenueCat] ${context} — Bookflow resolved:`, hasProAccess(customerInfo) ? 'Pro' : 'Free');

  if (hasProAccess(customerInfo)) return;

  // Not Pro. Say why, precisely — the three causes look identical from the UI but need different
  // fixes in the dashboard, and guessing between them wastes a lot of time.
  const misnamed = allEntitlements.find((id) => id.toLowerCase() === PRO_ENTITLEMENT_ID.toLowerCase());

  if (misnamed && misnamed !== PRO_ENTITLEMENT_ID) {
    console.warn(
      `[RevenueCat] Entitlement id mismatch: the dashboard has "${misnamed}" but Bookflow expects ` +
        `"${PRO_ENTITLEMENT_ID}". Rename it in RevenueCat, or change PRO_ENTITLEMENT_ID in lib/revenuecat.ts. ` +
        'Entitlement ids are case-sensitive.',
    );
    return;
  }

  if (purchasedProducts.length > 0 && allEntitlements.length === 0) {
    console.warn(
      `[RevenueCat] Purchased ${JSON.stringify(purchasedProducts)} but this customer has no entitlements ` +
        `at all. Attach the product to the "${PRO_ENTITLEMENT_ID}" entitlement in RevenueCat ` +
        '(Product catalog > Entitlements > pro > Attach products), then Restore Purchases.',
    );
    return;
  }

  if (purchasedProducts.length > 0) {
    console.warn(
      `[RevenueCat] Purchased ${JSON.stringify(purchasedProducts)}, and entitlements ` +
        `${JSON.stringify(allEntitlements)} exist, but "${PRO_ENTITLEMENT_ID}" is not active. ` +
        'The purchased product is most likely attached to a different entitlement.',
    );
  }
}

/**
 * Module-scoped rather than a component ref: `Purchases.configure` talks to a native singleton, so
 * "already configured" must outlive any React remount (fast refresh, provider re-mount).
 */
let configured = false;

let activeEnvironment: RevenueCatEnvironment = 'unsupported';

export function isPurchasesConfigured(): boolean {
  return configured;
}

/** The store this session is actually wired to. Meaningful only once configure has succeeded. */
export function getActiveEnvironment(): RevenueCatEnvironment {
  return activeEnvironment;
}

/** True when purchases run against RevenueCat's simulated store rather than a real one. */
export function isTestStore(): boolean {
  return activeEnvironment === 'test-store';
}

/**
 * Configures the SDK. Idempotent — repeat calls are a no-op rather than a reconfiguration, so a
 * fast refresh does not throw away cached customer info.
 *
 * We deliberately configure *anonymously* and call `logIn` once Clerk resolves the user, rather
 * than blocking startup on auth. RevenueCat aliases the anonymous id onto the real one, so a
 * purchase made in the seconds before sign-in is not lost.
 */
export function configurePurchases(): { ok: boolean; reason?: string } {
  if (configured) {
    logRevenueCatDebug('SDK already initialized');
    return { ok: true };
  }

  if (!isPurchasesSupported) {
    logRevenueCatDebug('Initialization skipped', { platform: Platform.OS, reason: 'unsupported platform' });
    return { ok: false, reason: 'In-app purchases are only available in the iOS and Android apps.' };
  }

  const config = resolveRevenueCatConfig();
  if (!config.ok) {
    logRevenueCatDebug('Initialization failed', { platform: Platform.OS, reason: config.reason });
    return { ok: false, reason: config.reason };
  }

  logRevenueCatDebug(`Environment: ${describeEnvironment(config.environment)}`, {
    platform: Platform.OS,
    // Prefix only — a full key never reaches the logs.
    keyPrefix: `${config.apiKey.slice(0, 5)}…`,
    runtime: isExpoGo ? 'Expo Go (Preview API — purchases are mocked)' : 'native build',
  });

  // VERBOSE in development surfaces the offering/entitlement mismatches that otherwise present as
  // a silently empty paywall. Never ship VERBOSE — it logs receipts.
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.ERROR).catch(() => {});

  try {
    Purchases.configure({
      apiKey: config.apiKey,
      // Store messages (billing issues, price-increase consent) are shown by the OS automatically.
      shouldShowInAppMessagesAutomatically: true,
    });
    configured = true;
    activeEnvironment = config.environment;
    logRevenueCatDebug('Configured', {
      platform: Platform.OS,
      environment: describeEnvironment(config.environment),
      entitlement: PRO_ENTITLEMENT_ID,
    });
  } catch (configurationError) {
    logPurchasesError('configure', configurationError);
    return { ok: false, reason: 'RevenueCat could not initialize. Check the development logs and public SDK key.' };
  }

  return { ok: true };
}

/** The Pro entitlement if it is currently active, else null. */
export function getProEntitlement(customerInfo: CustomerInfo | null): PurchasesEntitlementInfo | null {
  return customerInfo?.entitlements.active[PRO_ENTITLEMENT_ID] ?? null;
}

/**
 * The only question the app should ever ask about billing. Check the *entitlement*, never a
 * product id — that keeps grandfathered plans, promos and platform differences out of the UI.
 */
export function hasProAccess(customerInfo: CustomerInfo | null): boolean {
  return getProEntitlement(customerInfo) !== null;
}

/**
 * Picks the monthly and yearly packages out of an offering.
 *
 * Resolution order is deliberate: the offering's typed shortcuts first, then package *type*, and
 * only then a literal identifier. Product ids are never matched on — they differ between the App
 * Store and Play Store, so keying off them would silently break one platform.
 */
export function readPackages(offering: PurchasesOffering | null): {
  monthly: PurchasesPackage | null;
  yearly: PurchasesPackage | null;
} {
  if (!offering) return { monthly: null, yearly: null };

  const byType = (type: PACKAGE_TYPE) =>
    offering.availablePackages.find((pkg) => pkg.packageType === type) ?? null;
  const byId = (id: string) => offering.availablePackages.find((pkg) => pkg.identifier === id) ?? null;

  return {
    monthly: offering.monthly ?? byType(PACKAGE_TYPE.MONTHLY) ?? byId(PACKAGE_IDS.monthly),
    yearly: offering.annual ?? byType(PACKAGE_TYPE.ANNUAL) ?? byId(PACKAGE_IDS.yearly),
  };
}

/** The store-localised price string ("RM19.90"), never a hard-coded one. */
export function describePackage(pkg: PurchasesPackage | null): string {
  return pkg ? pkg.product.priceString : '—';
}

/**
 * Localised monthly equivalent of a yearly plan ("RM16.58"). The SDK computes and formats this
 * for us; the manual fallback covers older store payloads where `pricePerMonthString` is null.
 */
export function describeMonthlyEquivalent(pkg: PurchasesPackage | null): string | null {
  if (!pkg) return null;

  const { pricePerMonthString, pricePerMonth, price, currencyCode } = pkg.product;
  if (pricePerMonthString) return pricePerMonthString;

  const perMonth = pricePerMonth ?? (price > 0 ? price / 12 : null);
  if (!perMonth) return null;

  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(perMonth);
  } catch {
    // An unrecognised currency code should cost us a subtitle, not the screen.
    return null;
  }
}

/**
 * Percentage saved by paying yearly instead of monthly, or null when either package is missing.
 * Both prices come from the store in the same currency, so the comparison is safe.
 */
export function yearlySavingsPercent(
  monthly: PurchasesPackage | null,
  yearly: PurchasesPackage | null,
): number | null {
  if (!monthly || !yearly || monthly.product.price <= 0) return null;

  const yearlyCostOfMonthly = monthly.product.price * 12;
  if (yearly.product.price >= yearlyCostOfMonthly) return null;

  return Math.round((1 - yearly.product.price / yearlyCostOfMonthly) * 100);
}

function isPurchasesError(error: unknown): error is PurchasesError {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}

/** True when the user backed out of the store sheet — not an error worth showing them. */
export function isUserCancelled(error: unknown): boolean {
  return isPurchasesError(error) && error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
}

/**
 * Development-only breadcrumb. Store errors carry codes and underlying messages that are useful in
 * a debug session and meaningless (or alarming) to a customer, so they never reach the UI.
 */
export function logPurchasesError(context: string, error: unknown): void {
  if (!__DEV__) return;

  if (isPurchasesError(error)) {
    console.warn(
      `[RevenueCat] ${context}: code=${error.code} (${error.userInfo?.readableErrorCode ?? 'n/a'}) ` +
        `message="${error.message}" underlying="${error.underlyingErrorMessage}"`,
    );
    return;
  }
  console.warn(`[RevenueCat] ${context}:`, error);
}

/**
 * Maps SDK error codes onto sentences a customer can act on. The raw `message` is developer-facing
 * ("There was a problem with the App Store."), so we only fall back to it for codes we have not
 * given a better wording.
 */
export function describePurchasesError(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (!isPurchasesError(error)) {
    return error instanceof Error ? error.message : fallback;
  }

  switch (error.code) {
    case PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR:
      return 'Purchase cancelled.';
    case PURCHASES_ERROR_CODE.NETWORK_ERROR:
    case PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR:
      return 'You appear to be offline. Check your connection and try again.';
    case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
      return `The ${Platform.OS === 'ios' ? 'App Store' : 'Play Store'} is not responding. Please try again in a moment.`;
    case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
      return 'Purchases are not allowed on this device. Check your device restrictions or payment method.';
    case PURCHASES_ERROR_CODE.PURCHASE_INVALID_ERROR:
      return 'Your payment method was declined. Please update it in your store account and try again.';
    case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
      return 'You already own this subscription. Try restoring your purchases.';
    case PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR:
    case PURCHASES_ERROR_CODE.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR:
      return 'This subscription is already attached to a different Bookflow account.';
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return 'Your payment is pending approval. Bookflow Pro unlocks as soon as it clears.';
    case PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
      return 'That plan is not available in your region yet.';
    case PURCHASES_ERROR_CODE.INELIGIBLE_ERROR:
      return 'You are not eligible for that offer.';
    case PURCHASES_ERROR_CODE.CONFIGURATION_ERROR:
    case PURCHASES_ERROR_CODE.INVALID_CREDENTIALS_ERROR:
      // Almost always a dashboard/build mismatch rather than anything the customer did.
      return 'Billing is not configured correctly. Please contact support.';
    default:
      return fallback;
  }
}
