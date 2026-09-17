import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { SettingsDetailScreen, SettingsInfoRow } from '@/components/settings/SettingsDetailScreen';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { useTranslation } from '@/lib/use-translation';

/**
 * The wordmark, matched to the loading screen (components/feedback/BookFlowLoading.tsx) so the two
 * read as the same brand: DM Sans Bold at 29, tracked in by 0.7, with the sage square set against
 * the baseline. `WORD_SIZE` and the square's proportions are that screen's own values — the
 * tracking is absolute rather than relative, so the size has to come across with it.
 */
const WORD_SIZE = 29;
const DOT = WORD_SIZE * 0.52 * 0.22;
const DOT_COLOR = '#84948B';

export default function AboutScreen() {
  const { t } = useTranslation();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);

  const appVersion = Constants.expoConfig?.version ?? t('sub.unknown');
  const buildNumber = Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode;

  return (
    <SettingsDetailScreen eyebrow={t('sub.about')} title={t('sub.about.title')}>
      {/* One element to a screen reader: the bird and the word are a single mark, not two facts. */}
      <View accessible accessibilityRole="image" accessibilityLabel="BookFlow" style={styles.brand}>
        <Image
          source={require('@/assets/images/bookflow-logo.png')}
          style={styles.logo}
          contentFit="contain"
        />
        <View style={styles.wordRow}>
          {/* Themed rather than the loading screen's fixed ink, which sits on a fixed light ground. */}
          <Text style={[styles.word, { color: palette.text }]}>BookFlow</Text>
          <View style={styles.dot} />
        </View>
      </View>

      <Text style={[styles.description, { color: palette.muter }]}>{t('sub.about.description')}</Text>

      <SettingsInfoRow label={t('sub.about.version')} value={buildNumber ? `${appVersion} (${buildNumber})` : String(appVersion)} />
    </SettingsDetailScreen>
  );
}

const styles = StyleSheet.create({
  brand: {
    alignItems: 'center',
    marginBottom: 22,
    marginTop: 4,
  },
  logo: {
    height: 72,
    width: 72,
  },
  wordRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    marginTop: 10,
  },
  word: {
    fontFamily: 'DMSans-Bold',
    fontSize: WORD_SIZE,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  dot: {
    backgroundColor: DOT_COLOR,
    height: DOT,
    marginLeft: DOT * 0.28,
    width: DOT,
  },
  // Mirrors the description SettingsDetailScreen renders, which this screen now lays out itself so
  // the lockup can sit between the header and the copy.
  description: {
    fontSize: 13.5,
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 20,
  },
});
