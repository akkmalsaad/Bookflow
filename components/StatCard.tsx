import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/context/theme-context';

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'green' | 'amber' | 'purple';
  isCurrency?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

const toneColors: Record<StatCardProps['tone'], { accent: string; icon: ComponentProps<typeof Ionicons>['name'] }> = {
  blue: { accent: '#5271FF', icon: 'stats-chart' },
  green: { accent: '#28A57A', icon: 'time' },
  amber: { accent: '#D58A2A', icon: 'arrow-down-circle' },
  purple: { accent: '#8968D8', icon: 'arrow-up-circle' },
};

export function StatCard({
  label,
  value,
  detail,
  tone,
  isCurrency = false,
  onPress,
  accessibilityLabel,
}: StatCardProps) {
  const { isDarkMode } = useTheme();
  const colors = toneColors[tone];
  const surface = isDarkMode ? '#172033' : '#F7F9FD';
  const border = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.92)';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `Open ${label}`}
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
      <View style={styles.cardHeader}>
        <Ionicons name={colors.icon} size={24} color={colors.accent} />
      </View>
      <Text style={[styles.label, { color: isDarkMode ? '#AEBBD0' : '#667085' }]}>{label}</Text>
      <Text style={[styles.value, isCurrency && styles.currencyValue, { color: isDarkMode ? '#F8FAFC' : '#172033' }]}>{value}</Text>
      <Text style={[styles.detail, { color: isDarkMode ? '#8E9CB2' : '#8A94A6' }]}>{detail}</Text>
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
  cardHeader: {
    marginBottom: 16,
  },
  cardPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 7,
  },
  value: {
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  currencyValue: {
    fontSize: 19,
  },
  detail: {
    fontSize: 12,
  },
});
