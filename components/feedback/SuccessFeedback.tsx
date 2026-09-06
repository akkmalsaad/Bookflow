import * as Haptics from 'expo-haptics';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SUCCESS_SAFE_AREA_GAP, successCardLayout } from '@/components/feedback/success-card-layout';
import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  onComplete?: () => void;
  /** Total confirmation time, in milliseconds (minimum 700). */
  duration?: number;
  hapticEnabled?: boolean;
};
const AnimatedPath = Animated.createAnimatedComponent(Path);
const easeOut = Easing.bezier(0.23, 1, 0.32, 1);
const checkLength = Math.hypot(9, 9) + Math.hypot(19, 21);

/** Render inside the presenting modal so native modal stacking cannot hide the feedback. */
export function SuccessFeedback({ visible, ...props }: Props) {
  return visible ? <SuccessPresentation {...props} /> : null;
}

const ignoreClose = () => {};
// Deferred until presentation to avoid a circular module load with AddTransactionModal.
const ExpenseReference = lazy(async () => ({ default: (await import('@/components/AddTransactionModal')).AddTransactionModal }));

/** The hidden reference uses native layout on this device, including font scaling and safe areas.
 * It performs no writes and mounts no native Modal. Every confirmation uses that same size,
 * even when Finance has never been opened. There is no guessed height or text-dependent sizing.
 */
function SuccessPresentation(props: Omit<Props, 'visible'>) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const measure = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (layout.width <= 0 || layout.height <= 0) return;
    setSize((current) => current?.width === layout.width && current?.height === layout.height
      ? current : { width: layout.width, height: layout.height });
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.reference]}>
        <Suspense fallback={null}>
          <ExpenseReference visible={false} onClose={ignoreClose} onMeasure={measure} />
        </Suspense>
      </View>
      <View style={[
        successCardLayout.backdrop,
        { paddingTop: insets.top + SUCCESS_SAFE_AREA_GAP, paddingBottom: insets.bottom + SUCCESS_SAFE_AREA_GAP },
      ]}>
        {size && <SuccessSequence {...props} size={size} />}
      </View>
    </View>
  );
}

function SuccessSequence({ title, message, onComplete, duration = 950, hapticEnabled = true, size }: Omit<Props, 'visible'> & { size: { width: number; height: number } }) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(reduced ? 1 : 0.85);
  const icon = useSharedValue(0);
  const check = useSharedValue(0);
  const copy = useSharedValue(0);
  const callbacks = useRef({ onComplete, hapticEnabled });
  useEffect(() => { callbacks.current = { onComplete, hapticEnabled }; }, [onComplete, hapticEnabled]);

  useEffect(() => {
    let active = true;
    let completed = false;
    let hapticFired = false;
    const haptic = () => {
      if (!active || hapticFired) return;
      hapticFired = true;
      if (callbacks.current.hapticEnabled) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    };
    AccessibilityInfo.announceForAccessibility(`Success. ${title}.${message ? ` ${message}` : ''}`);
    opacity.set(withTiming(1, { duration: 180, easing: easeOut }));
    if (reduced) {
      scale.set(1);
      icon.set(1);
      check.set(1);
      copy.set(withTiming(1, { duration: 150 }));
      haptic();
    } else {
      scale.set(withSequence(
        withTiming(1, { duration: 300, easing: easeOut }),
        withTiming(1.02, { duration: 100, easing: easeOut }),
        withSpring(1, { duration: 400, dampingRatio: 1, overshootClamping: true }),
      ));
      icon.set(withDelay(120, withTiming(1, { duration: 200, easing: easeOut })));
      check.set(withDelay(150, withTiming(1, { duration: 350, easing: Easing.linear }, (finished) => {
        if (finished) scheduleOnRN(haptic);
      })));
      copy.set(withDelay(450, withTiming(1, { duration: 250, easing: easeOut })));
    }
    // This timer controls the reading interval only; the caller already confirmed the save.
    // Keep it independent of reduced-motion animation callbacks, which can finish immediately.
    const timer = setTimeout(() => {
      if (!active || completed) return;
      completed = true;
      callbacks.current.onComplete?.();
    }, Math.max(700, Number.isFinite(duration) ? duration : 950));
    return () => {
      active = false;
      clearTimeout(timer);
      [opacity, scale, icon, check, copy].forEach(cancelAnimation);
    };
    // Copy, duration and motion are captured once for this presentation; rerenders never replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardStyle = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ scale: scale.get() }] }));
  const iconStyle = useAnimatedStyle(() => ({ opacity: icon.get(), transform: [{ scale: reduced ? 1 : 0.9 + icon.get() * 0.1 }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: copy.get(), transform: [{ translateY: reduced ? 0 : 6 * (1 - copy.get()) }] }));
  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: checkLength * (1 - check.get()), opacity: check.get() > 0 ? 1 : 0 }));

  return (
    <View
      style={[
        successCardLayout.card,
        size,
        styles.container,
        { backgroundColor: soft.surface },
        { borderColor: soft.border, shadowColor: soft.shadow },
      ]}
      accessibilityViewIsModal>
      <Animated.View accessible accessibilityRole="text" accessibilityLabel={`Success. ${title}.${message ? ` ${message}` : ''}`} style={[styles.card, cardStyle]}>
        <Animated.View style={[styles.icon, { backgroundColor: palette.iconWrap }, iconStyle]}>
          <Svg width={56} height={56} viewBox="0 0 56 56" accessible={false}>
            <AnimatedPath d="M14 28 L23 37 L42 16" fill="none" stroke={palette.success} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={[checkLength, checkLength]} animatedProps={checkProps} />
          </Svg>
        </Animated.View>
        <Animated.View style={textStyle}>
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: palette.muter }]}>{message}</Text> : null}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  reference: { opacity: 0 },
  card: { alignItems: 'center', width: '100%', maxWidth: 360, paddingVertical: 20 },
  icon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
});
