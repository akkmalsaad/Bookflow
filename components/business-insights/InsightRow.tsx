import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette } from '@/context/theme-context';
import type { BusinessInsight } from '@/lib/business-insights';

const CONFIG: Record<
  BusinessInsight['tone'],
  {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    /** Outline twin of `icon`, for the quiet variant. */
    quietIcon: React.ComponentProps<typeof Ionicons>['name'];
    color: string;
    softLight: string;
    softDark: string;
    /** Whether the tone describes a real state, or is only a category label. */
    semantic: 'positive' | 'attention' | null;
  }
> = {
  positive: { icon: 'trending-up', quietIcon: 'trending-up-outline', color: '#20A950', softLight: '#E0F7E7', softDark: '#173A2C', semantic: 'positive' },
  attention: { icon: 'warning-outline', quietIcon: 'warning-outline', color: '#F97316', softLight: '#FFF0E6', softDark: '#452819', semantic: 'attention' },
  service: { icon: 'pie-chart-outline', quietIcon: 'pie-chart-outline', color: '#2684FF', softLight: '#E7F1FF', softDark: '#173354', semantic: null },
  client: { icon: 'people-outline', quietIcon: 'people-outline', color: '#6D28D9', softLight: '#EEE9FF', softDark: '#30235D', semantic: null },
  expense: { icon: 'analytics-outline', quietIcon: 'analytics-outline', color: '#F97316', softLight: '#FFF0E6', softDark: '#452819', semantic: 'attention' },
};

export function InsightRow({
  insight,
  isDarkMode,
  last,
  onPress,
  variant = 'tinted',
}: {
  insight: BusinessInsight;
  isDarkMode: boolean;
  last?: boolean;
  onPress?: () => void;
  /**
   * `tinted` is the original look: a soft per-tone colour block behind the glyph. `quiet` is the
   * Business Insights variant — a neutral container, an outline glyph, and colour only where the
   * tone names a real state rather than a category. Opt-in, so the All Insights screen keeps the
   * grouped, colour-coded treatment its section headers rely on.
   */
  variant?: 'tinted' | 'quiet';
}) {
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const item = CONFIG[insight.tone];
  const quiet = variant === 'quiet';
  const iconColor = quiet
    ? item.semantic === 'positive'
      ? palette.success
      : item.semantic === 'attention'
        ? palette.warning
        : palette.muter
    : item.color;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomColor: quiet ? soft.divider : `${palette.muter}18`, borderBottomWidth: 1 },
        pressed && styles.pressed,
      ]}>
      <View
        style={[
          quiet ? styles.quietIcon : styles.icon,
          { backgroundColor: quiet ? soft.inset : isDarkMode ? item.softDark : item.softLight },
        ]}>
        <Ionicons name={quiet ? item.quietIcon : item.icon} size={quiet ? 19 : 18} color={iconColor} />
      </View>
      <Text style={[styles.text, quiet && styles.quietText, { color: palette.text }]}>{insight.message}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={17} color={palette.muter} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', minHeight: 60, paddingVertical: 9 },
  icon: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', marginRight: 11, width: 36 },
  quietIcon: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', marginRight: 12, width: 38 },
  text: { flex: 1, fontSize: 12.5, fontWeight: '500', lineHeight: 18, marginRight: 8 },
  quietText: { fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.78 },
});
