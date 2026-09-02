import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/context/theme-context';

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  isCurrency?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * One Business Snapshot metric: label, value, context.
 *
 * The number is the card — no icon, and no per-metric accent colour. Four differently coloured
 * glyphs read as decoration rather than meaning, and they competed with the figure they sat above.
 * Hierarchy now comes from type size and weight alone.
 */
export function StatCard({
  label,
  value,
  detail,
  isCurrency = false,
  onPress,
  accessibilityLabel,
}: StatCardProps) {
  const { isDarkMode } = useTheme();
  const surface = isDarkMode ? '#172033' : '#F7F9FD';
  const border = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.92)';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `Open ${label}`}
      accessibilityHint={`${value}, ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: surface,
          borderColor: border,
          shadowColor: isDarkMode ? '#020617' : '#A7B4C8',
          shadowOpacity: isDarkMode ? 0.34 : 0.16,
        },
        pressed && styles.cardPressed,
      ]}>
      <View style={styles.copy}>
        <Text style={[styles.label, { color: isDarkMode ? '#AEBBD0' : '#667085' }]} numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={[styles.value, isCurrency && styles.currencyValue, { color: isDarkMode ? '#F8FAFC' : '#172033' }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}>
          {value}
        </Text>
        <Text style={[styles.detail, { color: isDarkMode ? '#8E9CB2' : '#8A94A6' }]} numberOfLines={1}>
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '44%',
    minWidth: 136,
    borderRadius: 24,
    borderWidth: 1,
    marginHorizontal: 6,
    marginBottom: 12,
    padding: 16,
    shadowRadius: 16,
    shadowOffset: { width: 7, height: 9 },
    elevation: 5,
  },
  copy: {
    // Held so the four cards keep a common height now that the icon no longer sets it.
    minHeight: 78,
    justifyContent: 'flex-start',
  },
  cardPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  value: {
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.9,
    marginBottom: 5,
  },
  currencyValue: {
    fontSize: 22,
    letterSpacing: -0.7,
  },
  detail: {
    fontSize: 12,
    fontWeight: '500',
  },
});
