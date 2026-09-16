/**
 * BookFlowSplash.tsx
 * ------------------------------------------------------------------
 * BookFlow splash screen (React Native / Expo).
 *
 * Deliberately unlike BookFlowLoading:
 *   - a TAGLINE instead of the wordmark, which arrives first;
 *     the bird folds together into it
 *   - it RESOLVES AND LEAVES — the mark flies to the header slot and
 *     hands off to the app, rather than holding a pattern
 *
 * Install:
 *   npx expo install react-native-svg react-native-reanimated expo-font
 * babel.config.js — Reanimated plugin LAST.
 *
 * Usage:
 *   const [shown, setShown] = useState(true);
 *   return (
 *     <>
 *       <RootNavigator />
 *       {shown && <BookFlowSplash onDone={() => setShown(false)} />}
 *     </>
 *   );
 *
 * Render the app UNDERNEATH and overlay the splash — that is what makes
 * the handoff read as a transition instead of a cut to blank.
 * ------------------------------------------------------------------
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Dimensions } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

/* ---------------- palette (same as the loading screen) ---------------- */
const DEEP = '#E9EDE6';   // ground
const MINT = '#02503F';   // dark green facets
const GREEN = '#058769';  // mid green facets
const GOLD = '#E0B45F';   // chest facet
const CREAM = '#142A3A';  // tagline ink

/* ---------------- geometry ---------------- */
const VIEWBOX = { x: 240, y: 210, w: 810, h: 800 };

type Facet = {
  points: string;
  fill: string;
  hinge?: { a: [number, number]; b: [number, number]; deg: number };
};

const FACETS: Facet[] = [
  { points: '320,992 470,762 662,448 798,747 565,848', fill: MINT },
  {
    points: '317,994 484,698 572,589 263,234 662,447 470,762',
    fill: GREEN,
    hinge: { a: [662, 447], b: [317, 994], deg: 118 },
  },
  {
    points: '485,697.5 263,234.5 572.5,589',
    fill: MINT,
    hinge: { a: [485, 697.5], b: [572.5, 589], deg: 104 },
  },
  {
    points: '320,991 564,848 630,901',
    fill: GREEN,
    hinge: { a: [320, 991], b: [564, 848], deg: -116 },
  },
  {
    points: '798,746.5 682,488.5 850.5,676',
    fill: GOLD,
    hinge: { a: [682, 488.5], b: [798, 746.5], deg: -112 },
  },
  {
    points: '850,675.5 729.5,540 843,379.5 903.5,396',
    fill: GREEN,
    hinge: { a: [729.5, 540], b: [850, 675.5], deg: -108 },
  },
  {
    points: '731,539.5 698.5,505 841,381.5',
    fill: MINT,
    hinge: { a: [841, 381.5], b: [731, 539.5], deg: 96 },
  },
  {
    points: '885,501.5 904,395.5 1028.5,428 942,465.5',
    fill: MINT,
    hinge: { a: [904, 395.5], b: [885, 501.5], deg: -102 },
  },
];

/* ---------------- timing ---------------- */
const WORD_IN = 420;
const FOLD_FROM = 240; // bird folds while the word is still settling
const STAGGER = 78;
const FOLD_DUR = 520;
const HOLD = 190;
const HANDOFF = 560;

const FOLD_END = FOLD_FROM + (FACETS.length - 1) * STAGGER + FOLD_DUR;
const EXIT_AT = Math.max(WORD_IN, FOLD_END) + HOLD;

const WORD_SIZE = 20;   // tagline, not the wordmark

const EASE = Easing.bezier(0.32, 0.86, 0.3, 1);
const EASE_OUT = Easing.bezier(0.22, 0.7, 0.3, 1);

/* ------------------------------------------------------------------ */
function Facet({
  facet,
  index,
  size,
}: {
  facet: Facet;
  index: number;
  size: number;
}) {
  const p = useSharedValue(0);
  const scale = size / VIEWBOX.w;

  useEffect(() => {
    p.value = withDelay(
      FOLD_FROM + index * STAGGER,
      withTiming(1, { duration: FOLD_DUR, easing: EASE })
    );
  }, []);

  const style = useAnimatedStyle(() => {
    const v = p.value;
    const opacity = Math.min(1, v / 0.22);

    if (!facet.hinge) {
      return {
        opacity,
        transform: [{ scale: 0.7 + 0.3 * v }, { rotate: `${-5 + 5 * v}deg` }],
      };
    }

    const { a, b, deg } = facet.hinge;
    const mx = ((a[0] + b[0]) / 2 - (VIEWBOX.x + VIEWBOX.w / 2)) * scale;
    const my = ((a[1] + b[1]) / 2 - (VIEWBOX.y + VIEWBOX.h / 2)) * scale;

    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len = Math.sqrt(vx * vx + vy * vy);
    const ux = vx / len;
    const uy = vy / len;
    const angle = deg * (1 - v);

    return {
      opacity,
      transform: [
        { perspective: 900 },
        { translateX: mx },
        { translateY: my },
        { rotateY: `${angle * ux}deg` },
        { rotateX: `${-angle * uy}deg` },
        { translateX: -mx },
        { translateY: -my },
      ],
    };
  });

  return <AnimatedPolygon points={facet.points} fill={facet.fill} style={style} />;
}

/* ------------------------------------------------------------------ */
export default function BookFlowSplash({
  size = 180,
  onDone,
  /* Where the mark should fly to — your header logo's centre, in screen
     coordinates. Measure it with onLayout + measureInWindow and pass it
     in; the defaults assume a 30px logo at the usual top-left slot. */
  target = { x: 35, y: 78, size: 30 },
}: {
  size?: number;
  onDone?: () => void;
  target?: { x: number; y: number; size: number };
}) {
  const { width, height } = Dimensions.get('window');

  const word = useSharedValue(0);
  const exit = useSharedValue(0);
  const veil = useSharedValue(1);

  useEffect(() => {
    word.value = withTiming(1, { duration: WORD_IN, easing: EASE_OUT });

    // resolve, then leave
    exit.value = withDelay(
      EXIT_AT,
      withTiming(1, { duration: HANDOFF, easing: Easing.bezier(0.4, 0, 0.2, 1) })
    );

    veil.value = withDelay(
      EXIT_AT + 160,
      withSequence(
        withTiming(0, { duration: 460 }, (done) => {
          if (done && onDone) runOnJS(onDone)();
        })
      )
    );
  }, []);

  /* The mark is centred; the stack sits slightly above centre because of
     the wordmark below it. dx/dy carry it to the header slot. */
  const markStyle = useAnimatedStyle(() => {
    const e = exit.value;
    const endScale = target.size / size;

    const cx = width / 2;
    const cy = height / 2 - (WORD_SIZE + 26) / 2;

    const dx = (target.x - cx) * e;
    const dy = (target.y - cy) * e;
    const s = 1 + (endScale - 1) * e;

    return { transform: [{ translateX: dx }, { translateY: dy }, { scale: s }] };
  });

  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value * (1 - exit.value),
    transform: [{ translateY: 8 * (1 - word.value) - 6 * exit.value }],
  }));

  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));

  return (
    <Animated.View style={[styles.root, veilStyle]} pointerEvents="none">
      <View style={styles.stack}>
        <Animated.View style={[{ width: size, height: size }, markStyle]}>
          <Svg
            width={size}
            height={size}
            viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
          >
            {FACETS.map((f, i) => (
              <Facet key={i} facet={f} index={i} size={size} />
            ))}
          </Svg>
        </Animated.View>

        <Animated.View style={wordStyle}>
          <Text style={styles.word}>Build For Independent Professional</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: DEEP,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  stack: { alignItems: 'center', gap: 26 },
  word: {
    fontFamily: 'DMSans-Bold', // register with expo-font
    fontSize: WORD_SIZE,
    fontWeight: '700',
    color: CREAM,
    letterSpacing: -0.3,
    lineHeight: WORD_SIZE * 1.25,
    textAlign: 'center',
    maxWidth: 240,
  },
});
