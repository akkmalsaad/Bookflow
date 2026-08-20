import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { getThemePalette, useTheme } from '@/context/theme-context';

const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

// The icon tile and the glow blobs behind it must share one fixed center point.
// Centering the icon as part of the icon+title+subtitle flex block (the old
// approach) pulls its visual center upward by roughly half the text block's
// height, so it drifts off the glow's own center. Pinning both to the same
// fixed offset keeps them concentric regardless of how tall each slide's copy is.
const ICON_SIZE = 116;
const ICON_CENTER_Y = 160;
const GLOW_OUTER_SIZE = 280;
const GLOW_INNER_SIZE = 190;

type IconName = ComponentProps<typeof Ionicons>['name'];

type Slide = {
  icon: IconName;
  tone: string;
  toneSoft: string;
  title: string;
  subtitle: string;
};

const SLIDES: Slide[] = [
  {
    icon: 'calendar',
    tone: '#5271FF',
    toneSoft: '#E4E6FF',
    title: 'Plan every booking',
    subtitle: 'Keep inquiries, confirmations, and schedules organized in one clear view.',
  },
  {
    icon: 'paper-plane',
    tone: '#8968D8',
    toneSoft: '#EFE7FF',
    title: 'Invoice in seconds',
    subtitle: 'Send polished invoices and track payments without the back-and-forth.',
  },
  {
    icon: 'stats-chart',
    tone: '#28A57A',
    toneSoft: '#DFF7EF',
    title: 'See your business clearly',
    subtitle: 'Watch revenue, expenses, and reminders update the moment they change.',
  },
];

type OnboardingProps = {
  onFinish: () => void;
};

export function Onboarding({ onFinish }: OnboardingProps) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();

  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const isLast = activeIndex === SLIDES.length - 1;

  const glowScale = useSharedValue(1);

  useEffect(() => {
    if (reduced) return;
    glowScale.set(withRepeat(withTiming(1.08, { duration: 2200, easing: EASE_IN_OUT }), -1, true));
  }, [reduced, glowScale]);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.set(event.contentOffset.x);
  });

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.get() }],
  }));

  const goToIndex = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setActiveIndex(index);
  };

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setActiveIndex(index);
  };

  const handlePrimaryPress = () => {
    if (isLast) {
      onFinish();
    } else {
      goToIndex(activeIndex + 1);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <View
        pointerEvents="none"
        style={[styles.ambientOrb, styles.ambientOrbTop, { backgroundColor: isDarkMode ? '#293258' : '#E4E6FF' }]}
      />
      <View
        pointerEvents="none"
        style={[styles.ambientOrb, styles.ambientOrbSide, { backgroundColor: isDarkMode ? '#163B38' : '#DFF7EF' }]}
      />

      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Image source={require('../assets/images/bookflow-logo.png')} style={styles.brandLogo} resizeMode="contain" />
          <Text style={[styles.brandWordmark, { color: palette.text }]}>Bookflow</Text>
        </View>
        {!isLast ? (
          <Pressable onPress={onFinish} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip onboarding">
            <Text style={[styles.skip, { color: palette.muter }]}>Skip</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.stage}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glowOuter,
            glowStyle,
            { backgroundColor: isDarkMode ? 'rgba(20,92,69,0.22)' : 'rgba(20,92,69,0.12)' },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glowInner,
            glowStyle,
            { backgroundColor: isDarkMode ? 'rgba(82,113,255,0.22)' : 'rgba(82,113,255,0.12)' },
          ]}
        />

        <Animated.ScrollView
          ref={scrollRef}
          style={styles.pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          onMomentumScrollEnd={handleMomentumEnd}
          scrollEventThrottle={16}>
          {SLIDES.map((slide, index) => (
            <SlideView key={slide.title} slide={slide} index={index} width={width} scrollX={scrollX} palette={palette} />
          ))}
        </Animated.ScrollView>
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, index) => (
            <Dot
              key={index}
              index={index}
              width={width}
              scrollX={scrollX}
              accent={palette.accent}
              muted={isDarkMode ? '#334155' : '#E2E8F0'}
            />
          ))}
        </View>

        <PrimaryButton label={isLast ? 'Get Started' : 'Next'} icon={isLast ? 'checkmark' : 'arrow-forward'} accent={palette.accent} onPress={handlePrimaryPress} />
      </View>
    </SafeAreaView>
  );
}

function SlideView({
  slide,
  index,
  width,
  scrollX,
  palette,
}: {
  slide: Slide;
  index: number;
  width: number;
  scrollX: SharedValue<number>;
  palette: ReturnType<typeof getThemePalette>;
}) {
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.get(), inputRange, [0.35, 1, 0.35], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(scrollX.get(), inputRange, [0.82, 1, 0.82], Extrapolation.CLAMP) }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.get(), inputRange, [0, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollX.get(), inputRange, [16, 0, 16], Extrapolation.CLAMP) }],
  }));

  return (
    <View style={[styles.slide, { width }]}>
      <Animated.View style={[styles.iconTile, { backgroundColor: slide.toneSoft }, iconStyle]}>
        <Ionicons name={slide.icon} size={48} color={slide.tone} />
      </Animated.View>
      <Animated.View style={textStyle}>
        <Text style={[styles.slideTitle, { color: palette.text }]}>{slide.title}</Text>
        <Text style={[styles.slideSubtitle, { color: palette.muter }]}>{slide.subtitle}</Text>
      </Animated.View>
    </View>
  );
}

function Dot({
  index,
  width,
  scrollX,
  accent,
  muted,
}: {
  index: number;
  width: number;
  scrollX: SharedValue<number>;
  accent: string;
  muted: string;
}) {
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

  const dotStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(scrollX.get(), inputRange, [muted, accent, muted]),
    transform: [{ scale: interpolate(scrollX.get(), inputRange, [1, 1.6, 1], Extrapolation.CLAMP) }],
  }));

  return <Animated.View style={[styles.dot, dotStyle]} />;
}

function PrimaryButton({
  label,
  icon,
  accent,
  onPress,
}: {
  label: string;
  icon: IconName;
  accent: string;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Animated.View
        style={[
          styles.cta,
          { backgroundColor: accent, shadowColor: accent },
          pressed && styles.ctaPressed,
        ]}>
        <Text style={styles.ctaLabel}>{label}</Text>
        <Ionicons name={icon} size={18} color="#FFFFFF" />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    overflow: 'hidden',
  },
  ambientOrb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.72,
  },
  ambientOrbTop: {
    width: 220,
    height: 220,
    top: -118,
    right: -86,
  },
  ambientOrbSide: {
    width: 170,
    height: 170,
    top: 380,
    left: -126,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandLogo: {
    width: 28,
    height: 28,
    marginRight: 8,
  },
  brandWordmark: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  skip: {
    fontSize: 14,
    fontWeight: '700',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
  },
  pager: {
    flex: 1,
    width: '100%',
  },
  glowOuter: {
    position: 'absolute',
    top: ICON_CENTER_Y - GLOW_OUTER_SIZE / 2,
    width: GLOW_OUTER_SIZE,
    height: GLOW_OUTER_SIZE,
    borderRadius: GLOW_OUTER_SIZE / 2,
  },
  glowInner: {
    position: 'absolute',
    top: ICON_CENTER_Y - GLOW_INNER_SIZE / 2,
    width: GLOW_INNER_SIZE,
    height: GLOW_INNER_SIZE,
    borderRadius: GLOW_INNER_SIZE / 2,
  },
  slide: {
    alignItems: 'center',
    paddingHorizontal: 36,
  },
  iconTile: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: ICON_CENTER_Y - ICON_SIZE / 2,
    marginBottom: 32,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 8, height: 10 },
    elevation: 5,
  },
  slideTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 10,
  },
  slideSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 22,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    borderRadius: 20,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    transitionProperty: ['transform'],
    transitionDuration: '120ms',
    transitionTimingFunction: 'ease-out',
  },
  ctaPressed: {
    transform: [{ scale: 0.97 }],
  },
  ctaLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
