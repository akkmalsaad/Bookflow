import { Pressable, StyleSheet, Text, View } from 'react-native';

export type TrendRange = 'month' | '6months' | 'year';

const OPTIONS: { key: TrendRange; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: '6months', label: '6 months' },
  { key: 'year', label: 'This year' },
];

type Props = {
  value: TrendRange;
  onChange: (range: TrendRange) => void;
  color: string;
  isDarkMode: boolean;
};

export function TrendRangeTabs({ value, onChange, color, isDarkMode }: Props) {
  const inactiveBackground = isDarkMode ? '#141E33' : '#EEF2FA';
  const inactiveText = isDarkMode ? '#8792AD' : '#6B7686';

  return (
    <View style={styles.row}>
      {OPTIONS.map((option) => {
        const isActive = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            style={[
              styles.tab,
              {
                backgroundColor: isActive ? `${color}1F` : inactiveBackground,
                borderColor: isActive ? color : 'transparent',
              },
            ]}>
            <Text style={[styles.tabText, { color: isActive ? color : inactiveText }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 9,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
