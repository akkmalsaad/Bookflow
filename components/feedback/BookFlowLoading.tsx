/**
 * BookFlowLoading.tsx
 * ------------------------------------------------------------------
 * BookFlow loading screen (React Native / Expo).
 *
 * The bird folds open, holds, folds shut, and repeats for as long as
 * `loading` is true. The wordmark animates in ONCE and then stays put.
 * When `loading` flips to false the current pass finishes and the bird
 * settles assembled.
 *
 * Install:
 *   npx expo install react-native-svg react-native-reanimated expo-font
 *
 * babel.config.js — Reanimated plugin LAST:
 *   plugins: ['react-native-reanimated/plugin']
 *
 * Usage:
 *   const [loading, setLoading] = useState(true);
 *   useEffect(() => { fetchStuff().finally(() => setLoading(false)); }, []);
 *   if (loading) return <BookFlowLoading loading={loading} />;
 * ------------------------------------------------------------------
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

/* ---------------- palette ---------------- */
const BG = '#E9EDE6';
const TEXT = '#142A3A';
const ACCENT = '#84948B';
const GREEN_DARK = '#02503F';
const GREEN_MID = '#058769';
const GOLD = '#E0B45F';

/* ---------------- geometry ---------------- */
const VIEWBOX = { x: 240, y: 210, w: 810, h: 800 };

type Facet = {
  points: string;
  fill: string;
  hinge?: { a: [number, number]; b: [number, number]; deg: number };
};

const FACETS: Facet[] = [
  { points: '320,992 470,762 662,448 798,747 565,848', fill: GREEN_DARK },
  {
    points: '317,994 484,698 572,589 263,234 662,447 470,762',
    fill: GREEN_MID,
    hinge: { a: [662, 447], b: [317, 994], deg: 118 },
  },
  {
    points: '485,697.5 263,234.5 572.5,589',
    fill: GREEN_DARK,
    hinge: { a: [485, 697.5], b: [572.5, 589], deg: 104 },
  },
  {
    points: '320,991 564,848 630,901',
    fill: GREEN_MID,
    hinge: { a: [320, 991], b: [564, 848], deg: -116 },
  },
  {
    points: '798,746.5 682,488.5 850.5,676',
    fill: GOLD,
    hinge: { a: [682, 488.5], b: [798, 746.5], deg: -112 },
  },
  {
    points: '850,675.5 729.5,540 843,379.5 903.5,396',
    fill: GREEN_MID,
    hinge: { a: [729.5, 540], b: [850, 675.5], deg: -108 },
  },
  {
    points: '731,539.5 698.5,505 841,381.5',
    fill: GREEN_DARK,
    hinge: { a: [841, 381.5], b: [731, 539.5], deg: 96 },
  },
  {
    points: '885,501.5 904,395.5 1028.5,428 942,465.5',
    fill: GREEN_DARK,
    hinge: { a: [904, 395.5], b: [885, 501.5], deg: -102 },
  },
];

/* ---------------- loop timing ----------------
 * One cycle: fold in (staggered) -> hold -> fold out (reversed) .
 * A single `clock` value runs 0..CYCLE on repeat; every facet derives
 * its own progress from it, so the stagger never drifts.
 */
const N = FACETS.length;
const FOLD_DUR = 640;
const FOLD_STAGGER = 104;
const HOLD = 650;
const UNFOLD_DUR = 420;
const UNFOLD_STAGGER = 64;

const FOLD_END = (N - 1) * FOLD_STAGGER + FOLD_DUR; // 1368
const UNFOLD_START = FOLD_END + HOLD; // 2018
const CYCLE = UNFOLD_START + (N - 1) * UNFOLD_STAGGER + UNFOLD_DUR; // ~2886

const WORD_DELAY = 1360;
const WORD_SIZE = 29;
const DOT = WORD_SIZE * 0.52 * 0.22;

/* cubic ease-out / ease-in, inlined so they run on the UI thread */
function easeOut(t: number) {
  'worklet';
  return 1 - Math.pow(1 - t, 3);
}
function easeIn(t: number) {
  'worklet';
  return t * t * t;
}
function clamp01(t: number) {
  'worklet';
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/* ------------------------------------------------------------------ */
function FoldingFacet({
  facet,
  index,
  size,
  clock,
  settled,
}: {
  facet: Facet;
  index: number;
  size: number;
  clock: Animated.SharedValue<number>;
  settled: Animated.SharedValue<number>;
}) {
  const scale = size / VIEWBOX.w;

  const style = useAnimatedStyle(() => {
    // `settled` ramps to 1 when loading finishes — hold assembled.
    const s = settled.value;

    const t = clock.value;
    const foldStart = index * FOLD_STAGGER;
    const unfoldStart = UNFOLD_START + (N - 1 - index) * UNFOLD_STAGGER;

    let p: number; // 0 = folded away, 1 = in place
    if (t < foldStart) p = 0;
    else if (t < foldStart + FOLD_DUR) p = easeOut(clamp01((t - foldStart) / FOLD_DUR));
    else if (t < unfoldStart) p = 1;
    else p = 1 - easeIn(clamp01((t - unfoldStart) / UNFOLD_DUR));

    // blend towards fully assembled once settling
    p = p + (1 - p) * s;

    const opacity = Math.min(1, p / 0.22);

    if (!facet.hinge) {
      return {
        opacity,
        transform: [{ scale: 0.68 + 0.32 * p }, { rotate: `${-5 + 5 * p}deg` }],
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

    const angle = deg * (1 - p);

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
export default function BookFlowLoading({
  size = 220,
  loading = true,
}: {
  size?: number;
  loading?: boolean;
}) {
  const clock = useSharedValue(0);
  const settled = useSharedValue(0);
  const word = useSharedValue(0);

  // the looping cycle
  useEffect(() => {
    clock.value = 0;
    clock.value = withRepeat(
      withTiming(CYCLE, { duration: CYCLE, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(clock);
  }, []);

  // wordmark: plays once on mount, never again
  useEffect(() => {
    word.value = withDelay(WORD_DELAY, withTiming(1, { duration: 520 }));
  }, []);

  // loading finished -> ease into the assembled state and stop looping
  useEffect(() => {
    if (loading) return;
    settled.value = withTiming(1, { duration: 420 }, (done) => {
      if (done) cancelAnimation(clock);
    });
  }, [loading]);

  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateY: 10 * (1 - word.value) }],
  }));

  return (
    <View style={styles.root}>
      <View style={{ width: size, height: size }}>
        <Svg
          width={size}
          height={size}
          viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
        >
          {FACETS.map((f, i) => (
            <FoldingFacet
              key={i}
              facet={f}
              index={i}
              size={size}
              clock={clock}
              settled={settled}
            />
          ))}
        </Svg>
      </View>

      <Animated.View style={[wordStyle, styles.wordRow]}>
        <Text style={styles.word}>BookFlow</Text>
        <View
          style={{
            width: DOT,
            height: DOT,
            marginLeft: DOT * 0.28,
            backgroundColor: ACCENT,
          }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    backgroundColor: BG,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  word: {
    // Register this with expo-font, or the tracking won't match.
    fontFamily: 'DMSans-Bold',
    fontSize: WORD_SIZE,
    fontWeight: '700',
    color: TEXT,
    letterSpacing: -0.7,
  },
});
