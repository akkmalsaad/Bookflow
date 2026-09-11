import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { cubicBezier, useReducedMotion, type CSSAnimationKeyframes } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

// The project's style types also declare CSS easing as a string. Reanimated 4 accepts easing
// objects at runtime; this intersection bridges the overlapping style declarations.
const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1) as ReturnType<typeof cubicBezier> & string;
const EASE_IN_OUT = cubicBezier(0.77, 0, 0.175, 1) as ReturnType<typeof cubicBezier> & string;
const INTRO_MS = 1450;
const MAX_HOLD_MS = 4500;
const EXIT_MS = 260;

// Starts at the native splash's exact 160pt logo size and center, then takes flight.
const FLIGHT: CSSAnimationKeyframes = {
  '0%': { transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '0deg' }, { scale: 1 }] },
  '40%': { transform: [{ translateX: -9 }, { translateY: -19 }, { rotate: '-7deg' }, { scale: 1.08 }] },
  '100%': { transform: [{ translateX: 0 }, { translateY: -36 }, { rotate: '0deg' }, { scale: 1.25 }] },
};
const ARRIVE: CSSAnimationKeyframes = {
  from: { opacity: 0, transform: [{ translateY: 12 }] },
  to: { opacity: 1, transform: [{ translateY: 0 }] },
};
const LIGHT: CSSAnimationKeyframes = {
  from: { opacity: 0, transform: [{ scale: 0.94 }, { rotate: '-12deg' }] },
  to: { opacity: 1, transform: [{ scale: 1.04 }, { rotate: '0deg' }] },
};
const RIPPLE: CSSAnimationKeyframes = {
  '0%': { opacity: 0, transform: [{ scale: 0.94 }] },
  '25%': { opacity: 0.6, transform: [{ scale: 1 }] },
  '100%': { opacity: 0, transform: [{ scale: 1.35 }] },
};

type AnimatedSplashProps = {
  /** The destination has mounted, including its recoverable loading/error state. */
  isReady: boolean;
  /** Hide the static native splash only after this surface and its logo can be displayed. */
  onNativeReady: () => Promise<void>;
  onFinish: () => void;
};

/** A once-per-launch brand moment. Animation frames stay on the UI runtime. */
export function AnimatedSplash({ isReady, onNativeReady, onFinish }: AnimatedSplashProps) {
  const reduced = useReducedMotion();
  const { width, height, fontScale } = useWindowDimensions();
  const [laidOut, setLaidOut] = useState(false);
  const [logoReady, setLogoReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [exiting, setExiting] = useState(false);
  const finished = useRef(false);
  const exitDuration = reduced ? 160 : EXIT_MS;
  const compact = height < 650 || fontScale > 1.35;
  const lightSize = Math.min(width + 100, 520);

  // An image failure or a missing onDisplay event must never strand the native splash.
  useEffect(() => {
    const timer = setTimeout(() => setLogoReady(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!laidOut || !logoReady || started) return;
    let cancelled = false;
    void (async () => {
      try {
        await onNativeReady();
      } catch {
        // The custom splash remains usable if the native screen was already dismissed.
      } finally {
        if (!cancelled) setStarted(true);
      }
    })();
    return () => { cancelled = true; };
  }, [laidOut, logoReady, onNativeReady, started]);

  useEffect(() => {
    if (!started) return;
    const introTimer = setTimeout(() => setIntroDone(true), reduced ? 300 : INTRO_MS);
    const deadlineTimer = setTimeout(() => setTimedOut(true), MAX_HOLD_MS);
    return () => { clearTimeout(introTimer); clearTimeout(deadlineTimer); };
  }, [reduced, started]);

  useEffect(() => {
    if (started && introDone && (isReady || timedOut)) setExiting(true);
  }, [introDone, isReady, started, timedOut]);

  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => {
      if (!finished.current) {
        finished.current = true;
        onFinish();
      }
    }, exitDuration);
    return () => clearTimeout(timer);
  }, [exitDuration, exiting, onFinish]);

  // No motion or waiting for decorative choreography with Reduce Motion enabled.
  const entrance = (delay: number) => reduced
    ? { opacity: started ? 1 : 0 }
    : { opacity: 0, animationName: started ? ARRIVE : 'none' as const,
      animationDuration: 300, animationDelay: delay, animationFillMode: 'both' as const,
      animationTimingFunction: EASE_OUT };

  return (
    <Animated.View
      testID="bookflow-splash"
      onLayout={() => setLaidOut(true)}
      pointerEvents="auto"
      accessibilityViewIsModal
      style={[styles.container, { opacity: exiting ? 0 : 1, transition: `opacity ${exitDuration}ms cubic-bezier(0.23, 1, 0.32, 1)` }]}>
      <View accessible accessibilityRole="text" accessibilityLabel="BookFlow. Welcome to your flow." style={styles.accessibilityLabel} />
      <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.scene}>
        <Animated.View style={[styles.light, { width: lightSize, height: lightSize, marginLeft: -lightSize / 2,
          marginTop: -lightSize / 2 - 36, opacity: reduced ? 0.55 : 0,
          animationName: started && !reduced ? LIGHT : 'none', animationDuration: 1000,
          animationTimingFunction: EASE_OUT, animationFillMode: 'both' }]}>
          <Svg width="100%" height="100%" viewBox="0 0 520 520">
            <Defs>
              <RadialGradient id="splashViolet"><Stop offset="0" stopColor="#B8B0FF" stopOpacity="0.40" /><Stop offset="1" stopColor="#B8B0FF" stopOpacity="0" /></RadialGradient>
              <RadialGradient id="splashGold"><Stop offset="0" stopColor="#EBD091" stopOpacity="0.36" /><Stop offset="1" stopColor="#EBD091" stopOpacity="0" /></RadialGradient>
              <RadialGradient id="splashMint"><Stop offset="0" stopColor="#89C4B1" stopOpacity="0.22" /><Stop offset="1" stopColor="#89C4B1" stopOpacity="0" /></RadialGradient>
            </Defs>
            <Circle cx="210" cy="235" r="195" fill="url(#splashViolet)" />
            <Circle cx="340" cy="210" r="135" fill="url(#splashGold)" />
            <Circle cx="260" cy="325" r="155" fill="url(#splashMint)" />
          </Svg>
        </Animated.View>
        {!reduced ? <Animated.View style={[styles.ripple, { animationName: started ? RIPPLE : 'none',
          animationDuration: 950, animationDelay: 180, animationFillMode: 'both', animationTimingFunction: EASE_OUT }]} /> : null}
        <Animated.View testID="splash-bird" style={[styles.logoWrap, reduced ? { transform: [{ translateY: -36 }, { scale: 1.25 }] } : {
          animationName: started ? FLIGHT : 'none', animationDuration: 850,
          animationTimingFunction: EASE_IN_OUT, animationFillMode: 'both',
        }]}>
          <Image source={require('../assets/branding/bookflow-logo-master.png')} style={styles.logo} contentFit="contain"
            onDisplay={() => setLogoReady(true)} onError={() => setLogoReady(true)} transition={0} />
        </Animated.View>
        <View style={[styles.copy, compact && styles.copyCompact]}>
          <View style={styles.wordmark}>
            <Animated.Text style={[styles.brandText, entrance(330)]}>Book</Animated.Text>
            <Animated.Text style={[styles.brandText, styles.flowText, entrance(420)]}>Flow</Animated.Text>
          </View>
          <Animated.View style={[styles.accentLine, entrance(520)]} />
          <Animated.Text style={[styles.welcome, entrance(570)]}>Welcome to your flow.</Animated.Text>
        </View>
        {!compact ? <Animated.View style={[styles.footer, entrance(720)]}>
          <Text style={styles.footerText}>A little less admin. A lot more room to grow.</Text>
        </Animated.View> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Matches the existing native launch screen and the app's initial light theme.
  container: { ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: '#F5F7FB' },
  scene: { flex: 1, overflow: 'hidden' },
  accessibilityLabel: { position: 'absolute', width: 1, height: 1 },
  light: { position: 'absolute', left: '50%', top: '50%' },
  ripple: { position: 'absolute', left: '50%', top: '50%', width: 238, height: 238,
    marginLeft: -119, marginTop: -155, borderRadius: 119, borderWidth: 1, borderColor: '#C5BFEB', opacity: 0 },
  logoWrap: { position: 'absolute', left: '50%', top: '50%', width: 160, height: 160, marginLeft: -80, marginTop: -80 },
  logo: { width: '100%', height: '100%' },
  copy: { position: 'absolute', top: '50%', left: 24, right: 24, marginTop: 72, alignItems: 'center' },
  copyCompact: { marginTop: 60 },
  wordmark: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  brandText: { color: '#111827', fontSize: 34, fontWeight: '800', letterSpacing: -1.1 },
  flowText: { color: '#4F46E5' },
  accentLine: { width: 28, height: 3, borderRadius: 2, backgroundColor: '#D5B466', marginTop: 15 },
  welcome: { color: '#6B7280', fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 15, fontWeight: '500' },
  footer: { position: 'absolute', bottom: '9%', left: 32, right: 32, alignItems: 'center' },
  footerText: { color: '#737E91', fontSize: 11, lineHeight: 18, letterSpacing: 0.15, textAlign: 'center' },
});
