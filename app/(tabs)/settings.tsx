import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SignOutDialog } from '@/components/settings/AccountDialogs';
import { BusinessProfileModal } from '@/components/settings/BusinessProfileModal';
import { ServicesManagerModal } from '@/components/settings/ServicesManagerModal';
import { SettingsRow, SettingsSection } from '@/components/settings/SettingsList';
import {
  getSoftTokens,
  SETTINGS_ICON_BACKGROUND_COLOR,
  SETTINGS_ICON_STROKE_COLOR,
} from '@/components/settings/tokens';
import { useAppData } from '@/context/app-data-context';
import { LOCALES } from '@/lib/i18n';
import { useAuth } from '@/context/auth-context';
import { useSubscription } from '@/context/subscription-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { useResponsive } from '@/lib/responsive';
import type { TranslationKey } from '@/lib/i18n';
import { useTranslation } from '@/lib/use-translation';

export default function SettingsScreen() {
  const router = useRouter();
  const { isDarkMode, themePreference } = useTheme();
  const { signOut, user } = useAuth();
  const { businessProfile, language } = useAppData();
  const { isPro, isLoadingSubscription } = useSubscription();
  const palette = getThemePalette(isDarkMode);
  const { readingStyle } = useResponsive();
  const { t } = useTranslation();
  const soft = getSoftTokens(isDarkMode);

  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showServicesManager, setShowServicesManager] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? 'Unknown';
  const buildNumber = Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode;
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, readingStyle]}>
        <View style={styles.headerRow}>
          <View style={[styles.headerIcon, { backgroundColor: SETTINGS_ICON_BACKGROUND_COLOR, borderColor: soft.border, shadowColor: soft.shadow }]}>
            <Ionicons name="settings-outline" size={21} color={SETTINGS_ICON_STROKE_COLOR} />
          </View>
          <View>
            <Text style={[styles.eyebrow, { color: '#142A3A' }]}>{t('settings.eyebrow')}</Text>
            <Text style={[styles.headerTitle, { color: palette.text }]}>{t('settings.title')}</Text>
          </View>
        </View>

        <SettingsSection title={t('settings.section.business')}>
          <SettingsRow
            icon="business-outline"
            title={t('settings.businessProfile')}
            subtitle={[businessProfile.name, businessProfile.nature]
              .map((value) => value.trim())
              .filter(Boolean)
              .join(' · ') || undefined}
            onPress={() => setShowProfileEditor(true)}
          />
          <SettingsRow
            icon="cube-outline"
            title={t('settings.services')}
            subtitle={t('settings.services.subtitle')}
            onPress={() => setShowServicesManager(true)}
          />
          <SettingsRow
            icon="receipt-outline"
            title={t('settings.invoiceSettings')}
            subtitle={t('settings.invoiceSettings.subtitle')}
            onPress={() => router.push('/settings/invoice-settings')}
          />
        </SettingsSection>

        <SettingsSection title={t('settings.section.preferences')}>
          <SettingsRow
            icon={isDarkMode ? 'moon-outline' : 'sunny-outline'}
            title={t('settings.appearance')}
            value={t(`settings.appearance.${themePreference}` as TranslationKey)}
            onPress={() => router.push('/settings/appearance')}
          />
          <SettingsRow
            icon="notifications-outline"
            title={t('settings.notifications')}
            subtitle={t('settings.notifications.subtitle')}
            onPress={() => router.push('/settings/notifications')}
          />
          <SettingsRow icon="globe-outline" title={t('settings.language')} value={LOCALES.find((option) => option.id === language)?.label ?? 'English'} onPress={() => router.push('/settings/language')} />
        </SettingsSection>

        <SettingsSection title={t('settings.section.data')}>
          <SettingsRow
            icon="download-outline"
            title={t('settings.export')}
            subtitle={t('settings.export.subtitle')}
            proBadge={!isLoadingSubscription && !isPro}
            // Free users go straight to the paywall, which opens the export screen once Pro is active.
            onPress={() =>
              isPro
                ? router.push('/settings/export')
                : router.push({ pathname: '/paywall', params: { returnTo: '/settings/export' } })
            }
          />
          <SettingsRow
            icon="server-outline"
            title={t('settings.dataManagement')}
            subtitle={t('settings.dataManagement.subtitle')}
            onPress={() => router.push('/settings/data-management')}
          />
        </SettingsSection>

        <SettingsSection title={t('settings.section.account')}>
          <SettingsRow
            icon="person-outline"
            title={t('settings.personalInfo')}
            subtitle={user?.email ?? user?.name ?? t('settings.signedIn')}
            onPress={() => router.push('/settings/personal-information')}
          />
          <SettingsRow
            icon="star-outline"
            title={t('settings.plan')}
            value={isLoadingSubscription ? '—' : isPro ? t('settings.plan.pro') : t('settings.plan.free')}
            onPress={() => router.push('/settings/plan')}
          />
          <SettingsRow icon="shield-outline" title={t('settings.security')} onPress={() => router.push('/settings/security')} />
        </SettingsSection>

        <SettingsSection title={t('settings.section.support')}>
          <SettingsRow icon="help-circle-outline" title={t('settings.help')} onPress={() => router.push('/settings/help')} />
          <SettingsRow icon="chatbubble-ellipses-outline" title={t('settings.feedback')} onPress={() => router.push('/settings/feedback')} />
        </SettingsSection>

        <SettingsSection title={t('settings.section.about')}>
          <SettingsRow icon="lock-closed-outline" title={t('settings.privacy')} onPress={() => router.push('/settings/privacy')} />
          <SettingsRow icon="document-text-outline" title={t('settings.terms')} onPress={() => router.push('/settings/terms')} />
          <SettingsRow icon="information-circle-outline" title={t('settings.about')} onPress={() => router.push('/settings/about')} />
        </SettingsSection>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.signOut')}
          onPress={() => setShowSignOut(true)}
          style={({ pressed }) => [
            styles.signOutButton,
            { backgroundColor: soft.surface, borderColor: soft.border },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="log-out-outline" size={18} color={palette.danger} />
          <Text style={[styles.signOutText, { color: palette.danger }]}>{t('settings.signOut')}</Text>
        </Pressable>

        <View style={styles.versionFooter}>
          <Text style={[styles.versionBrand, { color: palette.text }]}>BookFlow</Text>
          <Text style={[styles.versionText, { color: palette.muter }]}>
            {t('settings.version', { version: appVersion })}
            {buildNumber ? ` (${buildNumber})` : ''}
          </Text>
        </View>
      </ScrollView>

      <BusinessProfileModal visible={showProfileEditor} onClose={() => setShowProfileEditor(false)} />
      <ServicesManagerModal visible={showServicesManager} onClose={() => setShowServicesManager(false)} />
      <SignOutDialog
        visible={showSignOut}
        onCancel={() => setShowSignOut(false)}
        onConfirm={() => {
          setShowSignOut(false);
          signOut();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
  },
  scrollContent: {
    paddingBottom: 130,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 22,
  },
  headerIcon: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    elevation: 4,
    height: 46,
    justifyContent: 'center',
    marginRight: 13,
    shadowOffset: { height: 7, width: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 11,
    width: 46,
  },
  // Same values as the Dashboard, Bookings, Customers, Invoices and Finance headers.
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  signOutButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 26,
    minHeight: 52,
  },
  signOutText: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  versionFooter: {
    alignItems: 'center',
    marginTop: 4,
  },
  versionBrand: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  pressed: {
    opacity: 0.8,
  },
});
