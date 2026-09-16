import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

/** 'system' follows the device appearance; the other two pin it regardless of the device. */
export type ThemePreference = 'system' | 'light' | 'dark';

export type AppPalette = {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muter: string;
  border: string;
  accent: string;
  iconWrap: string;
  cardSoft: string;
  elevated: string;
  danger: string;
  success: string;
  warning: string;
};

type ThemeContextValue = {
  isDarkMode: boolean;
  toggleTheme: () => void;
  setTheme: (darkMode: boolean) => void;
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_PREFERENCE_KEY = 'bookflow.themePreference';

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * The saved choice, read synchronously so the first frame already uses it — no light-to-dark flash
 * on launch. Uses expo-secure-store, which the app already ships for Clerk's token cache. Web (the
 * public invoice page) and any storage failure fall back to Light, the app's long-standing default.
 */
function readStoredPreference(): ThemePreference {
  if (Platform.OS === 'web') return 'light';
  try {
    const stored = SecureStore.getItem(THEME_PREFERENCE_KEY);
    return isThemePreference(stored) ? stored : 'light';
  } catch {
    return 'light';
  }
}

function storePreference(preference: ThemePreference) {
  if (Platform.OS === 'web') return;
  SecureStore.setItemAsync(THEME_PREFERENCE_KEY, preference).catch((error) => {
    if (__DEV__) console.warn('[theme] could not save the appearance preference', error);
  });
}

export function getThemePalette(isDarkMode: boolean): AppPalette {
  return isDarkMode
    ? {
        background: '#0F172A',
        surface: '#111827',
        surfaceAlt: '#1F2937',
        text: '#F9FAFB',
        muter: '#CBD5E1',
        border: '#334155',
        accent: '#818CF8',
        iconWrap: '#1E293B',
        cardSoft: '#0B1220',
        elevated: '#111827',
        danger: '#F87171',
        success: '#34D399',
        warning: '#FBBF24',
      }
    : {
        background: '#F5F7FB',
        surface: '#FFFFFF',
        surfaceAlt: '#F9FAFB',
        text: '#111827',
        muter: '#6B7280',
        border: '#E5E7EB',
        accent: '#4F46E5',
        iconWrap: '#EEF2FF',
        cardSoft: '#F9FAFB',
        elevated: '#FFFFFF',
        danger: '#E11D48',
        success: '#117A4C',
        warning: '#B45309',
      };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  // Light until the person chooses otherwise; their choice is saved on this device.
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(readStoredPreference);
  const setThemePreference = useCallback((preference: ThemePreference) => {
    setThemePreferenceState(preference);
    storePreference(preference);
  }, []);
  const isDarkMode = themePreference === 'system' ? systemScheme === 'dark' : themePreference === 'dark';

  const value = useMemo<ThemeContextValue>(
    () => ({
      isDarkMode,
      toggleTheme: () => setThemePreference(isDarkMode ? 'light' : 'dark'),
      setTheme: (darkMode: boolean) => setThemePreference(darkMode ? 'dark' : 'light'),
      themePreference,
      setThemePreference,
    }),
    [isDarkMode, setThemePreference, themePreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}
