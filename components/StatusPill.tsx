import { StyleSheet, Text, View } from 'react-native';

type StatusPillProps = {
  label: string;
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'gray';
};

const toneColors: Record<NonNullable<StatusPillProps['tone']>, { background: string; text: string }> = {
  blue: { background: '#EAF3FF', text: '#1C5FDA' },
  green: { background: '#EAFBF2', text: '#117A4C' },
  amber: { background: '#FFF6E7', text: '#B26C00' },
  red: { background: '#FDECEC', text: '#B42318' },
  gray: { background: '#F3F4F6', text: '#4B5563' },
};

export function StatusPill({ label, tone = 'gray' }: StatusPillProps) {
  const colors = toneColors[tone];

  return (
    <View style={[styles.pill, { backgroundColor: colors.background }]}>
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
