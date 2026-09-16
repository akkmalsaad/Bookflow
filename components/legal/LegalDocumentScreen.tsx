import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';

import { LegalDocumentView } from '@/components/legal/LegalDocumentView';
import { SettingsDetailScreen } from '@/components/settings/SettingsDetailScreen';
import { useSubscription } from '@/context/subscription-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import type { LegalAction, LegalDocument } from '@/lib/legal/types';
import { useTranslation } from '@/lib/use-translation';
import { captureEvent } from '@/lib/analytics';

type Props = {
  document: LegalDocument;
  title: string;
  description: string;
  /** Sent once when the screen opens, with no properties. */
  openedEvent: string;
};

/**
 * The shared screen for BookFlow's legal documents: Legal header, last-updated date, an
 * English-only note when no reviewed translation exists, and the document itself. Each in-document
 * action is mapped to the app's existing screens here, so the content stays route-agnostic.
 */
export function LegalDocumentScreen({ document, title, description, openedEvent }: Props) {
  const { t, locale, intlLocale } = useTranslation();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const { isPro } = useSubscription();

  useEffect(() => {
    captureEvent(openedEvent);
  }, [openedEvent]);

  const lastUpdated = new Date(`${document.lastUpdated}T00:00:00`).toLocaleDateString(intlLocale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const handleAction = (action: LegalAction) => {
    switch (action) {
      case 'contactSupport':
        router.push('/settings/contact-support');
        return;
      case 'securityPrivacy':
        router.push('/settings/security');
        return;
      case 'privacyPolicy':
        router.push('/settings/privacy');
        return;
      case 'termsOfService':
        router.push('/settings/terms');
        return;
      case 'exportData':
        // Same destination and Pro gate as Settings > Export data & reports.
        if (isPro) router.push('/settings/export');
        else router.push({ pathname: '/paywall', params: { returnTo: '/settings/export' } });
        return;
    }
  };

  return (
    <SettingsDetailScreen eyebrow={t('legal.eyebrow')} title={title} description={description}>
      <Text style={[styles.updated, { color: palette.text }]}>{t('legal.lastUpdated', { date: lastUpdated })}</Text>
      {document.language !== locale ? (
        <Text style={[styles.languageNote, { color: palette.muter }]}>{t('legal.englishOnly')}</Text>
      ) : null}
      <LegalDocumentView document={document} onAction={handleAction} />
    </SettingsDetailScreen>
  );
}

const styles = StyleSheet.create({
  updated: { fontSize: 13.5, fontWeight: '700', marginBottom: 14, marginTop: -6 },
  languageNote: { fontSize: 13.5, fontStyle: 'italic', fontWeight: '500', lineHeight: 20, marginBottom: 14 },
});
