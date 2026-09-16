import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { Ionicons } from '@expo/vector-icons';

import { SettingsDetailScreen, SettingsInfoRow } from '@/components/settings/SettingsDetailScreen';
import { SettingsRow, SettingsSection } from '@/components/settings/SettingsList';
import { useAuth } from '@/context/auth-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { useTranslation } from '@/lib/use-translation';

type IconName = ComponentProps<typeof Ionicons>['name'];

const PROVIDER_ICONS: Record<string, IconName> = {
  apple: 'logo-apple',
  google: 'logo-google',
};

function providerName(provider: string) {
  if (provider === 'apple') return 'Apple';
  if (provider === 'google') return 'Google';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** How this account signs in, straight from Clerk. Password changes are only offered when one exists. */
export default function SignInMethodsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const { signInMethods } = useAuth();

  const email = signInMethods?.email || t('sub.personal.notSet');
  const providers = signInMethods?.providers ?? [];
  const hasPassword = Boolean(signInMethods?.hasPassword);
  const providerList = providers.map(providerName).join(', ');

  return (
    <SettingsDetailScreen
      eyebrow={t('security.eyebrow')}
      title={t('security.signIn.title')}
      description={t('signIn.description')}>
      <SettingsInfoRow label={t('signIn.email')} value={email} />

      <SettingsSection title={t('signIn.methods')}>
        {hasPassword ? (
          <SettingsRow
            icon="mail-outline"
            title={t('signIn.emailPassword')}
            value={t('signIn.passwordSet')}
            showChevron={false}
          />
        ) : null}
        {providers.map((provider) => (
          <SettingsRow
            key={provider}
            icon={PROVIDER_ICONS[provider] ?? 'link-outline'}
            title={providerName(provider)}
            value={t('signIn.connected')}
            showChevron={false}
          />
        ))}
        {!hasPassword && providers.length === 0 ? (
          <SettingsRow icon="mail-outline" title={t('signIn.emailOnly')} showChevron={false} />
        ) : null}
      </SettingsSection>

      {hasPassword ? (
        <SettingsSection title={t('signIn.password')}>
          <SettingsRow
            icon="lock-closed-outline"
            title={t('signIn.changePassword')}
            subtitle={t('signIn.changePassword.subtitle')}
            onPress={() => router.push('/settings/change-password')}
          />
        </SettingsSection>
      ) : (
        <Text style={[styles.note, { color: palette.muter }]}>
          {providers.length
            ? t('signIn.noPassword.provider', { providers: providerList })
            : t('signIn.noPassword.generic')}
        </Text>
      )}
    </SettingsDetailScreen>
  );
}

const styles = StyleSheet.create({
  note: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
    paddingHorizontal: 4,
  },
});
