import { BlurView } from 'expo-blur';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/context/theme-context';

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'green' | 'amber' | 'purple';
  isCurrency?: boolean;
};

const toneColors: Record<StatCardProps['tone'], { accent: string; glow: string; tint: string }> = {
  blue: { accent: '#2F70FF', glow: 'rgba(47, 112, 255, 0.32)', tint: 'rgba(47, 112, 255, 0.10)' },
  green: { accent: '#1DAA72', glow: 'rgba(29, 170, 114, 0.32)', tint: 'rgba(29, 170, 114, 0.10)' },
  amber: { accent: '#D97706', glow: 'rgba(245, 158, 11, 0.34)', tint: 'rgba(245, 158, 11, 0.12)' },
  purple: { accent: '#7C5CFA', glow: 'rgba(124, 92, 250, 0.32)', tint: 'rgba(124, 92, 250, 0.11)' },
};

export function StatCard({ label, value, detail, tone, isCurrency = false }: StatCardProps) {
  const { isDarkMode } = useTheme();
  const colors = toneColors[tone];
  const glass = isDarkMode
    ? {
        fill: 'rgba(15, 23, 42, 0.38)',
        borderTop: 'rgba(255, 255, 255, 0.26)',
        borderSide: 'rgba(255, 255, 255, 0.10)',
        borderBottom: 'rgba(0, 0, 0, 0.4)',
        highlight: 'rgba(255, 255, 255, 0.22)',
        value: '#F8FAFC',
        detail: '#CBD5E1',
      }
    : {
        fill: 'rgba(255, 255, 255, 0.40)',
        borderTop: 'rgba(255, 255, 255, 0.95)',
        borderSide: 'rgba(255, 255, 255, 0.55)',
        borderBottom: 'rgba(17, 24, 39, 0.08)',
        highlight: 'rgba(255, 255, 255, 0.85)',
        value: '#111827',
        detail: '#4B5563',
      };

  return (
    <View
      style={[
        styles.card,
        { shadowColor: isDarkMode ? '#000000' : colors.accent, shadowOpacity: isDarkMode ? 0.45 : 0.2 },
      ]}>
      <View
        style={[
          styles.glassClip,
          {
            borderTopColor: glass.borderTop,
            borderLeftColor: glass.borderSide,
            borderRightColor: glass.borderSide,
            borderBottomColor: glass.borderBottom,
          },
        ]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tint }]} />
        <View style={[styles.toneGlow, { backgroundColor: colors.glow }]} />
        <BlurView
          experimentalBlurMethod="dimezisBlurView"
          intensity={isDarkMode ? 40 : 55}
          tint={isDarkMode ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.fill }]} />
        <View style={[styles.glassHighlight, { backgroundColor: glass.highlight }]} />
        <View style={styles.content}>
          <Text style={[styles.label, { color: colors.accent }]}>{label}</Text>
          <Text style={[styles.value, isCurrency && styles.currencyValue, { color: glass.value }]}>{value}</Text>
          <Text style={[styles.detail, { color: glass.detail }]}>{detail}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    borderRadius: 18,
    marginRight: 12,
    marginBottom: 12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 6,
  },
  glassClip: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  toneGlow: {
    position: 'absolute',
    width: 112,
    height: 112,
    top: -58,
    right: -24,
    borderRadius: 56,
  },
  glassHighlight: {
    position: 'absolute',
    top: 1,
    left: 18,
    right: 18,
    height: 1,
    borderRadius: 1,
  },
  content: {
    padding: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  value: {
    fontSize: 21,
    fontWeight: '800',
    marginBottom: 6,
  },
  currencyValue: {
    fontSize: 19,
  },
  detail: {
    fontSize: 12,
  },
});
