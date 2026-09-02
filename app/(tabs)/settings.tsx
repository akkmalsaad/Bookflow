import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DeleteAccountDialog, SignOutDialog } from '@/components/settings/AccountDialogs';
import { BusinessProfileModal } from '@/components/settings/BusinessProfileModal';
import { ServicesManagerModal } from '@/components/settings/ServicesManagerModal';
import { DangerActionRow, SettingsRow, SettingsSection } from '@/components/settings/SettingsList';
import { getSoftTokens } from '@/components/settings/tokens';
import { CURRENCY_OPTIONS, useAppData } from '@/context/app-data-context';
import { useAuth } from '@/context/auth-context';
import { useSubscription } from '@/context/subscription-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

const APPEARANCE_LABELS = { system: 'System', light: 'Light', dark: 'Dark' } as const;

export default function SettingsScreen() {
  const router = useRouter();
  const { isDarkMode, themePreference } = useTheme();
  const { signOut, user, verifyPassword, deleteAccount } = useAuth();
  const { packages, businessProfile, currency, deleteAllData, deleteWorkspace } = useAppData();
  const { isPro, isLoadingSubscription } = useSubscription();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showServicesManager, setShowServicesManager] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? 'Unknown';
  const buildNumber = Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode;
  const currencyLabel = CURRENCY_OPTIONS.find((option) => option.code === currency)?.code ?? currency;

  const closeDeleteAccount = () => {
    setShowDeleteAccount(false);
    setDeletePassword('');
    setDeletePasswordError('');
  };

  const handleDeleteAccount = async () => {
    if (isDeleting) return;

    setIsDeleting(true);
    const isValid = await verifyPassword(deletePassword);
    if (!isValid) {
      setDeletePasswordError('Incorrect password. Please try again.');
      setIsDeleting(false);
      return;
    }

    try {
      await deleteWorkspace();
      await deleteAccount();
    } catch (error) {
      setDeletePasswordError(error instanceof Error ? error.message : 'We could not delete your account. Please try again.');
      setIsDeleting(false);
      return;
    }

    setIsDeleting(false);
    closeDeleteAccount();
    deleteAllData();
    await signOut();
  };

  const handleRate = () => {
    Alert.alert(
      'Rate BookFlow',
      'BookFlow is not published to the App Store or Google Play yet. Once it is, this will open its store listing.',
    );
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <View style={[styles.headerIcon, { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow }]}>
            <Ionicons name="settings-outline" size={21} color={palette.accent} />
          </View>
          <Text style={[styles.headerTitle, { color: palette.text }]}>Settings</Text>
        </View>

        <SettingsSection title="Business">
          <SettingsRow
            icon="business-outline"
            title="Business profile"
            subtitle={[businessProfile.name, businessProfile.nature]
              .map((value) => value.trim())
              .filter(Boolean)
              .join(' · ') || undefined}
            onPress={() => setShowProfileEditor(true)}
          />
          <SettingsRow
            icon="cube-outline"
            title="Services & packages"
            subtitle={`${packages.length} ${packages.length === 1 ? 'service' : 'services'} available`}
            onPress={() => setShowServicesManager(true)}
          />
          <SettingsRow
            icon="calendar-outline"
            title="Booking defaults"
            subtitle="Duration, deposit & reminders"
            onPress={() => router.push('/settings/booking-defaults')}
          />
          <SettingsRow
            icon="receipt-outline"
            title="Invoice settings"
            subtitle="Numbers, notes & payment terms"
            onPress={() => router.push('/settings/invoice-settings')}
          />
          <SettingsRow
            icon="wallet-outline"
            title="Payment settings"
            subtitle="Deposit & payment methods"
            onPress={() => router.push('/settings/payment-settings')}
          />
        </SettingsSection>

        <SettingsSection title="Preferences">
          <SettingsRow
            icon={isDarkMode ? 'moon-outline' : 'sunny-outline'}
            title="Appearance"
            value={APPEARANCE_LABELS[themePreference]}
            onPress={() => router.push('/settings/appearance')}
          />
          <SettingsRow
            icon="notifications-outline"
            title="Notifications & reminders"
            subtitle="Bookings, payments & invoices"
            onPress={() => router.push('/settings/notifications')}
          />
          <SettingsRow icon="globe-outline" title="Language" value="English" onPress={() => router.push('/settings/language')} />
          <SettingsRow
            icon="cash-outline"
            title="Currency & region"
            value={`${currencyLabel} · Malaysia`}
            onPress={() => router.push('/settings/currency-region')}
          />
        </SettingsSection>

        <SettingsSection title="Data">
          <SettingsRow
            icon="download-outline"
            title="Export data & reports"
            subtitle="PDF, CSV & business reports"
            onPress={() => router.push('/settings/export')}
          />
          <SettingsRow
            icon="server-outline"
            title="Data management"
            subtitle="Manage your BookFlow records"
            onPress={() => router.push('/settings/data-management')}
          />
        </SettingsSection>

        <SettingsSection title="Account">
          <SettingsRow
            icon="person-outline"
            title="Personal information"
            subtitle={user?.email ?? user?.name ?? 'Signed in'}
            onPress={() => router.push('/settings/personal-information')}
          />
          <SettingsRow
            icon="star-outline"
            title="BookFlow plan"
            value={isLoadingSubscription ? '—' : isPro ? 'Pro' : 'Free plan'}
            onPress={() => router.push('/settings/plan')}
          />
          <SettingsRow icon="shield-outline" title="Security & privacy" onPress={() => router.push('/settings/security')} />
        </SettingsSection>

        <SettingsSection title="Support">
          <SettingsRow icon="help-circle-outline" title="Help & support" onPress={() => router.push('/settings/help')} />
          <SettingsRow icon="chatbubble-ellipses-outline" title="Send feedback" onPress={() => router.push('/settings/feedback')} />
          <SettingsRow icon="star-half-outline" title="Rate BookFlow" onPress={handleRate} />
        </SettingsSection>

        <SettingsSection title="About">
          <SettingsRow icon="lock-closed-outline" title="Privacy Policy" onPress={() => router.push('/settings/privacy')} />
          <SettingsRow icon="document-text-outline" title="Terms of Service" onPress={() => router.push('/settings/terms')} />
          <SettingsRow icon="information-circle-outline" title="About BookFlow" onPress={() => router.push('/settings/about')} />
        </SettingsSection>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => setShowSignOut(true)}
          style={({ pressed }) => [
            styles.signOutButton,
            { backgroundColor: soft.surface, borderColor: soft.border },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="log-out-outline" size={18} color={palette.danger} />
          <Text style={[styles.signOutText, { color: palette.danger }]}>Sign out</Text>
        </Pressable>

        <SettingsSection title="Danger zone">
          <DangerActionRow
            icon="trash-outline"
            title="Delete account"
            subtitle="Permanently removes your account and workspace"
            onPress={() => setShowDeleteAccount(true)}
          />
        </SettingsSection>

        <View style={styles.versionFooter}>
          <Text style={[styles.versionBrand, { color: palette.text }]}>BookFlow</Text>
          <Text style={[styles.versionText, { color: palette.muter }]}>
            Version {appVersion}
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
      <DeleteAccountDialog
        visible={showDeleteAccount}
        password={deletePassword}
        error={deletePasswordError}
        isDeleting={isDeleting}
        onChangePassword={(value) => {
          setDeletePassword(value);
          setDeletePasswordError('');
        }}
        onCancel={closeDeleteAccount}
        onConfirm={handleDeleteAccount}
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
  headerTitle: {
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.6,
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
