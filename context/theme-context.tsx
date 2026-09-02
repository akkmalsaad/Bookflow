import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

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
  // Defaults to Light, which is how the app has always started. Choosing System is opt-in, and the
  // preference lives for the session only — nothing about the theme is persisted yet.
  const [themePreference, setThemePreference] = useState<ThemePreference>('light');
  const isDarkMode = themePreference === 'system' ? systemScheme === 'dark' : themePreference === 'dark';

  const value = useMemo<ThemeContextValue>(
    () => ({
      isDarkMode,
      toggleTheme: () => setThemePreference(isDarkMode ? 'light' : 'dark'),
      setTheme: (darkMode: boolean) => setThemePreference(darkMode ? 'dark' : 'light'),
      themePreference,
      setThemePreference,
    }),
    [isDarkMode, themePreference],
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
