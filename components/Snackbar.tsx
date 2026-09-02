import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';

export type SnackbarTone = 'default' | 'success' | 'danger';

export type SnackbarAction = {
  label: string;
  onPress: () => void;
};

type Props = {
  message: string;
  tone?: SnackbarTone;
  action?: SnackbarAction;
  onDismiss: () => void;
};

const TONE_ICONS: Record<SnackbarTone, React.ComponentProps<typeof Ionicons>['name']> = {
  default: 'information-circle',
  success: 'checkmark-circle',
  danger: 'alert-circle',
};

/**
 * BookFlow's temporary notification: the same soft card, fade and timing as the toast the services
 * editor already uses, lifted out so anything can show one — with an optional single action such as
 * Undo. It always disappears on its own; nothing here is ever persistent.
 *
 * An icon carries the tone alongside the colour, so destructive and error states are never signalled
 * by red alone.
 */
export function Snackbar({ message, tone = 'default', action, onDismiss }: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  // Starts above its resting place so the notification drops in from the top of the screen.
  const translateY = useRef(new Animated.Value(-12)).current;
  const accent = tone === 'danger' ? palette.danger : tone === 'success' ? palette.success : palette.accent;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents="box-none"
      style={[
        styles.wrap,
        // Clears the status bar and notch rather than competing with the tab bar and the sync
        // banner, both of which own the bottom of the screen.
        { top: insets.top + 12 },
        { opacity, transform: [{ translateY }] },
      ]}>
      <View
        style={[
          styles.card,
          { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow },
        ]}>
        <Ionicons name={TONE_ICONS[tone]} size={18} color={accent} />
        <Text style={[styles.message, { color: palette.text }]} numberOfLines={3}>
          {message}
        </Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            hitSlop={10}
            onPress={action.onPress}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <Text style={[styles.actionText, { color: palette.accent }]}>{action.label}</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss notification"
            hitSlop={10}
            onPress={onDismiss}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <Ionicons name="close" size={17} color={palette.muter} />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    left: 16,
    position: 'absolute',
    right: 16,
    zIndex: 30,
  },
  card: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    elevation: 8,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 13,
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
  },
  message: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 19,
  },
  action: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  actionText: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.6,
  },
});
