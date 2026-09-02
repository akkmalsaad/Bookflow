import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { getBookingStatusVisual } from '@/lib/booking-status';
import { useTheme } from '@/context/theme-context';

type Props = {
  status: string | null | undefined;
  onPress: () => void;
  /** Shows a spinner in place of the dot while a change is being applied. */
  isBusy?: boolean;
  disabled?: boolean;
};

/**
 * Compact, tappable job status: tinted dot, label, chevron. Deliberately reads as a secondary
 * control rather than a primary CTA — it sits beside the booking amount, not under it.
 *
 * The label is always rendered, so the status never depends on its colour to be understood.
 */
export function JobStatusPill({ status, onPress, isBusy = false, disabled = false }: Props) {
  const { isDarkMode } = useTheme();
  const visual = getBookingStatusVisual(status, isDarkMode);
  const isDisabled = disabled || isBusy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Job status, ${visual.label}`}
      accessibilityHint="Opens the job status picker"
      accessibilityState={{ disabled: isDisabled, busy: isBusy }}
      disabled={isDisabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: visual.colors.tint },
        pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}>
      {isBusy ? (
        <ActivityIndicator color={visual.colors.text} size="small" style={styles.spinner} />
      ) : (
        <View style={[styles.dot, { backgroundColor: visual.colors.dot }]} />
      )}
      <Text style={[styles.label, { color: visual.colors.text }]} numberOfLines={1}>
        {visual.label}
      </Text>
      <Ionicons name="chevron-down" size={14} color={visual.colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 7,
    // Comfortably past the 44pt guidance once hitSlop is counted, without bulking up the card.
    minHeight: 38,
    paddingHorizontal: 12,
    // Lets the label wrap out of the way instead of clipping at larger text sizes.
    flexShrink: 1,
  },
  dot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  spinner: {
    height: 8,
    width: 8,
  },
  label: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.6,
  },
});
