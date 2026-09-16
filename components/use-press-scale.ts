import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const PRESS_SPRING = { damping: 15, stiffness: 300 };

/**
 * Press feedback for a button: it scales down while held and springs back on release.
 *
 * Spread `onPressIn`/`onPressOut` onto the pressable and put `scaleStyle` on the view wrapping it,
 * so the button keeps its own styles, handlers and press states exactly as they are.
 */
export function usePressScale() {
  const scale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return {
    scaleStyle,
    onPressIn: () => scale.set(withSpring(0.96, PRESS_SPRING)),
    onPressOut: () => scale.set(withSpring(1, PRESS_SPRING)),
  };
}
