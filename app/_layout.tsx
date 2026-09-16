import { isPublicInvoiceBrowser } from '@/lib/public-invoice-browser';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Slot, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { LogBox, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BookFlowSplash from '@/components/feedback/BookFlowSplash';
import BookFlowLoading from '@/components/feedback/BookFlowLoading';
import { useLoadingTransition } from '@/components/feedback/useLoadingTransition';
import { SplashTargetContext, type SplashTarget } from '@/context/splash-target-context';
import { AppDataProvider, useAppData } from '@/context/app-data-context';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { SubscriptionProvider } from '@/context/subscription-context';
import { SnackbarProvider } from '@/context/snackbar-context';
import { getThemePalette, ThemeProvider as AppThemeProvider, useTheme } from '@/context/theme-context';
import { posthog } from '@/lib/posthog';
import { useResponsive } from '@/lib/responsive';
import * as Sentry from '@sentry/react-native';
import { PostHogProvider } from 'posthog-react-native';
import { useTranslation } from '@/lib/use-translation';

Sentry.init({
  enabled: !isPublicInvoiceBrowser(),
  beforeSend: event => isPublicInvoiceBrowser() ? null : event,
  beforeSendTransaction: event => isPublicInvoiceBrowser() ? null : event,
  beforeBreadcrumb: breadcrumb => isPublicInvoiceBrowser() ? null : breadcrumb,
  dsn: 'https://7a8195f3ba780f8e273bf72bf039ac08@o4512021511274496.ingest.de.sentry.io/4512021521825872',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: Platform.OS === 'web' ? 0 : 0.1,
  replaysOnErrorSampleRate: Platform.OS === 'web' ? 0 : 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

if (!publishableKey) {
  throw new Error("Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Add your key to .env.local.\nRun: 1) clerk auth login  2) clerk link  3) clerk env pull — then restart the dev server.");
}

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync().catch(() => {});

// expo-notifications auto-registers a push token listener on import, which logs this
// error in Expo Go on Android (remote push was removed from Expo Go in SDK 53+). This
// app only schedules local notifications, so the warning is a known false positive —
// see https://docs.expo.dev/develop/development-builds/introduction/.
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go',
]);

function AnalyticsProvider({ children }: { children: ReactNode }) {
  if (!posthog) {
    return children;
  }

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}

function AppShell() {
  const { t } = useTranslation();
  const { isDarkMode } = useTheme();
  const { isAuthenticated, isLoaded } = useAuth();
  const { isLoading: isDataLoading, loadError, reload, retrySync, syncError } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const { isPhone } = useResponsive();
  const loading = !isLoaded || (isAuthenticated && isDataLoading);
  const loadingTransition = useLoadingTransition(loading);

  if (loadingTransition.visible) {
    return <BookFlowLoading key={loadingTransition.cycle} loading={loading} />;
  }

  if (isAuthenticated && loadError) {
    return (
      <View style={[styles.dataGate, { backgroundColor: palette.background }]}>
        <Text style={[styles.dataGateTitle, { color: palette.text }]}>{t('app.loadFailed')}</Text>
        <Text style={[styles.dataGateMessage, { color: palette.muter }]}>{t('app.loadFailed.body')}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={reload}
          style={({ pressed }) => [styles.retryButton, { backgroundColor: palette.accent, opacity: pressed ? 0.82 : 1 }]}>
          <Text style={styles.retryButtonText}>{t('app.tryAgain')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ThemeProvider value={isDarkMode ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="income" />
          <Stack.Screen name="expense" />
          <Stack.Screen name="business-insights" />
          <Stack.Screen name="bookflow-insights" />
          <Stack.Screen name="invoice/[invoiceId]" />
          <Stack.Screen name="customer/[customerId]" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="paywall" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack.Protected>
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Screen name="invoice-public" />
        <Stack.Screen name="i" />
      </Stack>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      {syncError ? (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.syncBanner,
            // Left/right anchoring gives way to a centred, capped card once there is room to spare.
            !isPhone && styles.syncBannerCapped,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}>
          <Text style={[styles.syncBannerText, { color: palette.text }]}>{t('app.syncPending')}</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={retrySync}>
            <Text style={[styles.syncRetryText, { color: palette.accent }]}>{t('app.retry')}</Text>
          </Pressable>
        </View>
      ) : null}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  launchRoot: {
    flex: 1,
    backgroundColor: '#E9EDE6',
  },
  dataGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  dataGateTitle: {
    marginTop: 18,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  dataGateMessage: {
    marginTop: 10,
    maxWidth: 460,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 22,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  syncBanner: {
    position: 'absolute',
    right: 16,
    bottom: 88,
    left: 16,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  syncBannerCapped: {
    left: undefined,
    right: undefined,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
  },
  syncBannerText: {
    flex: 1,
    marginRight: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  syncRetryText: {
    fontSize: 14,
    fontWeight: '800',
  },
});

export default Sentry.wrap(function RootLayout() {
  const pathname = usePathname();
  const [fontsLoaded, fontError] = useFonts({
    'DMSans-Bold': require('@/assets/fonts/DMSans-Bold.ttf'),
  });
  const { width, height } = useWindowDimensions();
  const [measuredLogo, setMeasuredLogo] = useState<{ pathname: string; target: SplashTarget } | null>(null);
  const reportTarget = useCallback((logoPathname: string, target: SplashTarget) => {
    setMeasuredLogo(current => current?.pathname === logoPathname &&
      current.target.x === target.x && current.target.y === target.y && current.target.size === target.size
      ? current : { pathname: logoPathname, target });
  }, []);
  const isPublicInvoice = Platform.OS === 'web' && (pathname === '/i' || pathname === '/invoice-public');
  const [showSplash, setShowSplash] = useState(true);
  useEffect(() => {
    if (isPublicInvoice) void SplashScreen.hideAsync().catch(() => {});
  }, [isPublicInvoice]);

  const handleNativeReady = useCallback(async () => {
    if (fontsLoaded || fontError) await SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  // Public capability links must not wait for Clerk or private workspace loading.
  if (isPublicInvoice) {
    return <SafeAreaProvider><Slot /></SafeAreaProvider>;
  }

  if (!fontsLoaded && !fontError) return null;

  // Deep-linked screens may have no logo. Keep the mark centred on those routes
  // instead of flying to an invented header position.
  const target = measuredLogo?.pathname === pathname
    ? measuredLogo.target
    : { x: width / 2, y: height / 2 - 23, size: 180 };

  return (
    // Required by react-native-gesture-handler for GestureDetector to receive touches. It is a
    // plain flex:1 view, so nothing about the existing layout changes.
    <GestureHandlerRootView style={styles.launchRoot} onLayout={handleNativeReady}>
      {/* telemetry={false}: Clerk's own collector throws "Value is a number, expected an Object"
          while recording a hook event on this SDK version. Nothing else about Clerk changes. */}
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache} telemetry={false}>
        <SafeAreaProvider>
        <SplashTargetContext.Provider value={reportTarget}>
        <View style={styles.root} pointerEvents={showSplash ? 'none' : 'auto'}
          accessibilityElementsHidden={showSplash} importantForAccessibility={showSplash ? 'no-hide-descendants' : 'auto'}>
        <AnalyticsProvider>
        <AppThemeProvider>
          <AuthProvider>
            {/* Inside AuthProvider: the RevenueCat app user id is kept in step with the Clerk user. */}
            <SubscriptionProvider>
              <AppDataProvider>
                {/* Outside the router so a snackbar survives the navigation that follows it. */}
                <SnackbarProvider>
                  <AppShell />
                </SnackbarProvider>
              </AppDataProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </AppThemeProvider>
        </AnalyticsProvider>
        </View>
          {showSplash ? (
            // Run the one-shot brand handoff immediately. If private app data is
            // still loading, its loader remains underneath and appears afterward.
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <BookFlowSplash target={target} onDone={handleSplashFinish} />
            </View>
          ) : null}
        </SplashTargetContext.Provider>
        </SafeAreaProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
});
