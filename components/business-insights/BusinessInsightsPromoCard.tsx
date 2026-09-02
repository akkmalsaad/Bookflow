import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { ProBadge, WalletIllustration } from './BusinessInsightsVisuals';

export function BusinessInsightsPromoCard({ onPress }: { onPress: () => void }) {
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="View Business Insights, Pro feature"
      accessibilityHint="Opens Business Insights if your Pro subscription is active"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isDarkMode ? '#1D1D3E' : '#F8F6FF',
          borderColor: isDarkMode ? 'rgba(167, 139, 250, 0.22)' : '#E8E0FF',
          shadowColor: soft.shadow,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>Business Insights</Text>
          <ProBadge />
        </View>
        <Text style={[styles.subtitle, compact && styles.subtitleCompact, { color: palette.muter }]}>Understand your business performance and growth</Text>
        <View style={[styles.cta, { backgroundColor: palette.accent, shadowColor: palette.accent }]}>
          <Text style={styles.ctaText}>View Insights</Text>
          <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
        </View>
      </View>

      <View pointerEvents="none" style={[styles.wallet, compact && styles.walletCompact]}>
        <WalletIllustration width={compact ? 104 : 126} height={compact ? 82 : 98} />
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
  wallet: { position: 'absolute', right: -2, top: 34 },
  walletCompact: { right: -8, top: 56 },
});
