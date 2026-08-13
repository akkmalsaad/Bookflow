import { StyleSheet, Text, View } from 'react-native';

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'green' | 'amber' | 'purple';
};

const toneColors: Record<StatCardProps['tone'], { background: string; accent: string }> = {
  blue: { background: '#EAF3FF', accent: '#2F70FF' },
  green: { background: '#EAFBF2', accent: '#1DAA72' },
  amber: { background: '#FFF6E7', accent: '#F59E0B' },
  purple: { background: '#F1E8FF', accent: '#7C5CFA' },
};

export function StatCard({ label, value, detail, tone }: StatCardProps) {
  const colors = toneColors[tone];

  return (
    <View style={[styles.card, { backgroundColor: colors.background }]}>
      <Text style={[styles.label, { color: colors.accent }]}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    borderRadius: 18,
    padding: 16,
    marginRight: 12,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  value: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  detail: {
    fontSize: 12,
    color: '#4B5563',
  },
});
