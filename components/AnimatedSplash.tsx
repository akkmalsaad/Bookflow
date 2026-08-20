import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

const HOLD_MS = 1500;
const REDUCED_HOLD_MS = 700;

type AnimatedSplashProps = {
  onFinish: () => void;
};

// The app always mounts with the light palette (context/theme-context.tsx has
// no system-scheme or persisted dark-mode source), so the splash is fixed to
// light too — matching whatever appearance the dashboard will reveal under it,
// regardless of the device's system appearance.
const BACKGROUND = '#F5F7FB';
const WORDMARK = '#111827';

export function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const reduced = useReducedMotion();

  const containerOpacity = useSharedValue(1);
  const containerScale = useSharedValue(1);
  const logoScale = useSharedValue(reduced ? 1 : 0.94);
  const glowScale = useSharedValue(reduced ? 1 : 0.85);
  const glowOpacity = useSharedValue(reduced ? 1 : 0);
  const breathe = useSharedValue(1);
  const textOpacity = useSharedValue(reduced ? 1 : 0);
  const textTranslate = useSharedValue(reduced ? 0 : 10);
  const dotsOpacity = useSharedValue(reduced ? 1 : 0);
  const dot1 = useSharedValue(1);
  const dot2 = useSharedValue(1);
  const dot3 = useSharedValue(1);

  useEffect(() => {
    const hold = reduced ? REDUCED_HOLD_MS : HOLD_MS;

    if (!reduced) {
      glowOpacity.set(withTiming(1, { duration: 550, easing: EASE_OUT }));
      glowScale.set(
        withTiming(1, { duration: 550, easing: EASE_OUT }, (finished) => {
          'worklet';
          if (finished) {
            breathe.set(withRepeat(withTiming(1.06, { duration: 1600, easing: EASE_IN_OUT }), -1, true));
          }
        }),
      );
      logoScale.set(withSpring(1, { duration: 500, dampingRatio: 0.8 }));
      textOpacity.set(withDelay(220, withTiming(1, { duration: 380, easing: EASE_OUT })));
      textTranslate.set(withDelay(220, withTiming(0, { duration: 380, easing: EASE_OUT })));

      const loopDots = (delay: number) =>
        withDelay(
          420 + delay,
          withRepeat(
            withSequence(
              withTiming(1.35, { duration: 340, easing: EASE_IN_OUT }),
              withTiming(1, { duration: 340, easing: EASE_IN_OUT }),
            ),
            -1,
            false,
          ),
        );
      dotsOpacity.set(withDelay(420, withTiming(1, { duration: 300, easing: EASE_OUT })));
      dot1.set(loopDots(0));
      dot2.set(loopDots(140));
      dot3.set(loopDots(280));
    }

    const exitTimer = setTimeout(() => {
      const exitDuration = reduced ? 200 : 380;
      containerOpacity.set(withTiming(0, { duration: exitDuration, easing: EASE_OUT }));
      containerScale.set(
        withTiming(reduced ? 1 : 1.03, { duration: exitDuration, easing: EASE_OUT }, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(onFinish);
        }),
      );
    }, hold);

    return () => clearTimeout(exitTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.get(),
    transform: [{ scale: containerScale.get() }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.get(),
    transform: [{ scale: glowScale.get() * breathe.get() }],
  }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.get() }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.get(),
    transform: [{ translateY: textTranslate.get() }],
  }));

  const dotsStyle = useAnimatedStyle(() => ({ opacity: dotsOpacity.get() }));
  const dot1Style = useAnimatedStyle(() => ({ transform: [{ scale: dot1.get() }] }));
  const dot2Style = useAnimatedStyle(() => ({ transform: [{ scale: dot2.get() }] }));
  const dot3Style = useAnimatedStyle(() => ({ transform: [{ scale: dot3.get() }] }));

  return (
    <Animated.View pointerEvents="none" style={[styles.container, { backgroundColor: BACKGROUND }, containerStyle]}>
      <View style={styles.center}>
        <Animated.View style={[styles.glowOuter, { backgroundColor: 'rgba(20,92,69,0.14)' }, glowStyle]} />
        <Animated.View style={[styles.glowInner, { backgroundColor: 'rgba(216,181,74,0.16)' }, glowStyle]} />
        <Animated.View style={[styles.logoWrap, logoStyle]}>
          <Image source={require('@/assets/images/bookflow-logo.png')} style={styles.logo} contentFit="contain" />
        </Animated.View>
        <Animated.Text style={[styles.wordmark, { color: WORDMARK }, textStyle]}>Bookflow</Animated.Text>
        <Animated.View style={[styles.dots, dotsStyle]}>
          <Animated.View style={[styles.dot, { backgroundColor: '#145C45' }, dot1Style]} />
          <Animated.View style={[styles.dot, { backgroundColor: '#1F7A5C' }, dot2Style]} />
          <Animated.View style={[styles.dot, { backgroundColor: '#D8B54A' }, dot3Style]} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowOuter: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  glowInner: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
  },
  logoWrap: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 108,
    height: 108,
  },
  wordmark: {
    marginTop: 22,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});
