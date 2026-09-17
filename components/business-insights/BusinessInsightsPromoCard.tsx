import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { ProBadge } from '@/components/ProBadge';
import { getSoftTokens, SETTINGS_ICON_BACKGROUND_COLOR, SETTINGS_ICON_STROKE_COLOR } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { useTranslation } from '@/lib/use-translation';

/**
 * The container is the same chip the Settings icons sit on — a fixed light ground carrying a fixed
 * dark ink — which is what lets `foreground` stay one colour in both themes without disappearing
 * into the card behind it. `color` now paints only the border, so the artwork keeps its tie to the
 * card's accent; `foreground` paints the three bars and the trend arrow.
 */
function InsightsGrowthArtwork({ compact, color, foreground }: { compact: boolean; color: string; foreground: string }) {
  return (
    <Svg width={compact ? 88 : 104} height={compact ? 88 : 104} viewBox="0 0 128 128" fill="none" accessible={false}>
      <Rect x={14} y={18} width={100} height={96} rx={24} fill={SETTINGS_ICON_BACKGROUND_COLOR} />
      <Rect x={14} y={18} width={100} height={96} rx={24} stroke={color} strokeOpacity={0.22} strokeWidth={3} />
      <Rect x={32} y={77} width={14} height={19} rx={5} fill={foreground} fillOpacity={0.28} />
      <Rect x={57} y={66} width={14} height={30} rx={5} fill={foreground} fillOpacity={0.5} />
      <Rect x={82} y={53} width={14} height={43} rx={5} fill={foreground} />
      <Path d="M33 59L54 43L69 49L95 29M79 29H95V45" stroke={foreground} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function BusinessInsightsPromoCard({ onPress }: { onPress: () => void }) {
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const { t } = useTranslation();
  const soft = getSoftTokens(isDarkMode);
  const cardBackground = isDarkMode ? '#1D1D3E' : '#F8F6FF';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('a11y.insightsCard')}
      accessibilityHint="Opens Business Insights if your Pro subscription is active"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: cardBackground,
          borderColor: isDarkMode ? 'rgba(167, 139, 250, 0.22)' : '#E8E0FF',
          shadowColor: soft.shadow,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{t('insights.card.title')}</Text>
          <ProBadge />
        </View>
        <Text style={[styles.subtitle, compact && styles.subtitleCompact, { color: palette.muter }]}>{t('insights.card.subtitle')}</Text>
        <View style={[styles.cta, { backgroundColor: '#142A3A', shadowColor: palette.accent }]}>
          <Text style={styles.ctaText}>{t('insights.card.cta')}</Text>
          <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
        </View>
      </View>

      <View pointerEvents="none" style={[styles.artwork, compact && styles.artworkCompact]}>
        <InsightsGrowthArtwork compact={compact} color={palette.accent} foreground={SETTINGS_ICON_STROKE_COLOR} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    elevation: 4,
    marginBottom: 24,
    minHeight: 162,
    overflow: 'hidden',
    padding: 18,
    shadowOffset: { width: 6, height: 9 },
    shadowOpacity: 0.15,
    shadowRadius: 17,
  },
  copy: { zIndex: 2 },
  titleRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 9 },
  title: { flexShrink: 1, fontSize: 15.5, fontWeight: '800', letterSpacing: -0.25, marginRight: 7 },
  subtitle: { fontSize: 12.5, fontWeight: '500', lineHeight: 18, marginBottom: 14, maxWidth: '66%' },
  subtitleCompact: { maxWidth: '60%' },
  cta: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 12,
    elevation: 3,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 10,
    shadowOffset: { width: 2, height: 5 },
    shadowOpacity: 0.24,
    shadowRadius: 9,
  },
  ctaText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },
  artwork: { position: 'absolute', right: 8, top: 40 },
  artworkCompact: { right: 4, top: 58 },
});
