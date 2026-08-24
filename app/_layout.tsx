import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, LogBox, Pressable, StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash } from '@/components/AnimatedSplash';
import { AppDataProvider, useAppData } from '@/context/app-data-context';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { getThemePalette, ThemeProvider as AppThemeProvider, useTheme } from '@/context/theme-context';

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

function AppShell() {
  const { isDarkMode } = useTheme();
  const { isAuthenticated, isLoaded } = useAuth();
  const { isLoading: isDataLoading, loadError, reload, retrySync, syncError } = useAppData();
  const palette = getThemePalette(isDarkMode);

  if (!isLoaded) {
    return null;
  }

  if (isAuthenticated && isDataLoading) {
    return (
      <View style={[styles.dataGate, { backgroundColor: palette.background }]}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={[styles.dataGateTitle, { color: palette.text }]}>Loading your workspace…</Text>
      </View>
    );
  }

  if (isAuthenticated && loadError) {
    return (
      <View style={[styles.dataGate, { backgroundColor: palette.background }]}>
        <Text style={[styles.dataGateTitle, { color: palette.text }]}>Couldn’t load Bookflow</Text>
        <Text style={[styles.dataGateMessage, { color: palette.muter }]}>{loadError}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={reload}
          style={({ pressed }) => [styles.retryButton, { backgroundColor: palette.accent, opacity: pressed ? 0.82 : 1 }]}>
          <Text style={styles.retryButtonText}>Try again</Text>
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
          <Stack.Screen name="invoice/[invoiceId]" />
          <Stack.Screen name="customer/[customerId]" />
          <Stack.Screen name="modal" options={{ headerShown: true, presentation: 'modal', title: 'Modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      {syncError ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.syncBanner, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.syncBannerText, { color: palette.text }]}>Some changes haven’t synced.</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={retrySync}>
            <Text style={[styles.syncRetryText, { color: palette.accent }]}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
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

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <SafeAreaProvider>
        <AppThemeProvider>
          <AuthProvider>
            <AppDataProvider>
              <AppShell />
            </AppDataProvider>
          </AuthProvider>
        </AppThemeProvider>
        {showSplash ? <AnimatedSplash onFinish={handleSplashFinish} /> : null}
      </SafeAreaProvider>
    </ClerkProvider>
  );
}
