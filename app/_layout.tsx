import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { LogBox } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash } from '@/components/AnimatedSplash';
import { AppDataProvider } from '@/context/app-data-context';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/context/theme-context';

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
  const { isAuthenticated } = useAuth();

  return (
    <ThemeProvider value={isDarkMode ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="income" />
          <Stack.Screen name="expense" />
          <Stack.Screen name="invoice/[invoiceId]" />
          <Stack.Screen name="modal" options={{ headerShown: true, presentation: 'modal', title: 'Modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  return (
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
  );
}
