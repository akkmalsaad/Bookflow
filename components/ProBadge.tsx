import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * The one BookFlow Pro badge: solid indigo with white lettering, as first drawn on the paywall.
 *
 * The indigo is fixed rather than following the theme accent. The dark theme's lighter accent
 * leaves white 10pt text too faint to read, and a badge that changes colour per screen stops
 * reading as the same mark.
 */
export function ProBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View accessible accessibilityLabel="Pro" style={[styles.badge, style]}>
      <Text style={styles.text}>PRO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
});
