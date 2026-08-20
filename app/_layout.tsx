import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash } from '@/components/AnimatedSplash';
import { Onboarding } from '@/components/Onboarding';
import { AppDataProvider } from '@/context/app-data-context';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/context/theme-context';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync().catch(() => {});

function AppShell() {
  const { isDarkMode } = useTheme();

  return (
    <ThemeProvider value={isDarkMode ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="income" options={{ headerShown: false }} />
        <Stack.Screen name="expense" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(true);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  const handleOnboardingFinish = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <AppDataProvider>
          <AppShell />
          {showOnboarding ? <Onboarding onFinish={handleOnboardingFinish} /> : null}
        </AppDataProvider>
      </AppThemeProvider>
      {showSplash ? <AnimatedSplash onFinish={handleSplashFinish} /> : null}
    </SafeAreaProvider>
  );
}
