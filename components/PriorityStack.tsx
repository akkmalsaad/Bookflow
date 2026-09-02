import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { StatusPill } from '@/components/StatusPill';
import type { Booking, Customer } from '@/context/app-data-context';
import { useTheme, type AppPalette } from '@/context/theme-context';
import { getBookingStatusConfig } from '@/lib/booking-status';

/** How far left the front card travels to park the Complete action open. */
const ACTION_WIDTH = 116;
/** Past this much leftward travel, letting go opens rather than snaps back. */
const OPEN_THRESHOLD = ACTION_WIDTH * 0.45;
/** Horizontal movement below this is still a tap, so tap-to-front is never stolen by the pan. */
const SWIPE_ACTIVATION_X = 14;
/** Vertical movement past this hands the gesture to the dashboard's scroll view. */
const SCROLL_YIELD_Y = 12;
/** How long the completed card takes to carry on off the left edge before it is removed. */
const EXIT_MS = 280;
/** Accelerates away, so the card reads as leaving rather than easing to a halt off screen. */
const EXIT_EASING = Easing.bezier(0.4, 0, 1, 1);

const PEEK_OFFSET = 44;
const SCALE_STEP = 0.05;
const OPACITY_STEP = 0.18;
const DEFAULT_CARD_HEIGHT = 150;

/**
 * The stack overlaps its cards, so the accent stripe is often the only part of a buried card still
 * showing. One shared accent made them read as a single slab; giving each booking its own hue makes
 * the stack legible as separate cards at a glance.
 *
 * Both sets are tuned to the Soft UI surfaces they sit on — deeper in light mode, brighter in dark
 * — and adjacent entries are kept far apart in hue so neighbouring cards never look alike.
 */
const PRIORITY_ACCENTS_LIGHT = ['#4F46E5', '#0D9488', '#D97706', '#DB2777', '#0284C7', '#7C3AED'];
const PRIORITY_ACCENTS_DARK = ['#818CF8', '#2DD4BF', '#FBBF24', '#F472B6', '#38BDF8', '#A78BFA'];

/**
 * Keyed off the booking's place in the day's list, never its depth in the stack, so a card keeps
 * its colour when tapping reshuffles the order.
 */
function getPriorityAccent(index: number, isDarkMode: boolean) {
  const accents = isDarkMode ? PRIORITY_ACCENTS_DARK : PRIORITY_ACCENTS_LIGHT;
  return accents[((index % accents.length) + accents.length) % accents.length];
}

/** Reads from the shared booking-status config so tones never drift between screens. */
function statusTone(status: Booking['status']) {
  return getBookingStatusConfig(status).pillTone;
}

function formatBookingDate(dateKey: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(`${dateKey}T00:00:00`),
  );
}

function formatBookingTime(value?: string) {
  if (!value || value === 'Not specified') return 'Not specified';

  const match = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return value;

  const hour24 = Number(match[1]);
  const hour12 = hour24 % 12 || 12;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour12}:${match[2]} ${period}`;
}

type PriorityStackProps = {
  bookings: Booking[];
  customerMap: Map<string, Customer>;
  currencyFormatter: Intl.NumberFormat;
  palette: AppPalette;
  /** Marks the booking's job done. Omit and the swipe action is simply not offered. */
  onComplete?: (bookingId: string) => void;
};

export function PriorityStack({
  bookings,
  customerMap,
  currencyFormatter,
  palette,
  onComplete,
}: PriorityStackProps) {
  const { isDarkMode } = useTheme();
  const [order, setOrder] = useState<string[]>(() => bookings.map((booking) => booking.id));
  const [cardHeight, setCardHeight] = useState(DEFAULT_CARD_HEIGHT);
  // At most one card may sit open, and only ever the front one.
  const [openId, setOpenId] = useState<string | null>(null);
  // Latched while a completion plays out, so repeated taps cannot fire it twice.
  const [completingId, setCompletingId] = useState<string | null>(null);

  useEffect(() => {
    setOrder((current) => {
      const validIds = bookings.map((booking) => booking.id);
      const preserved = current.filter((id) => validIds.includes(id));
      const added = validIds.filter((id) => !preserved.includes(id));
      return [...preserved, ...added];
    });
  }, [bookings]);

  const frontId = order[0] ?? null;

  // A card that is no longer at the front must never stay visually offset, so any change of front
  // card — or of the bookings behind the stack — resets the exposed action.
  useEffect(() => {
    setOpenId((current) => (current && current === frontId ? current : null));
  }, [frontId, bookings]);

  const handleComplete = useCallback(
    (bookingId: string) => {
      if (completingId) return;
      setCompletingId(bookingId);
      setOpenId(null);
      onComplete?.(bookingId);
      // The booking leaves `bookings` on the next render, which unmounts this card and lets the
      // existing depth spring reflow the rest of the stack.
      setCompletingId(null);
    },
    [completingId, onComplete],
  );

  if (bookings.length === 0) {
    return (
      <View style={styles.emptyState}>
        <View style={[styles.emptyIcon, { backgroundColor: isDarkMode ? '#12362B' : '#EAFBF2' }]}>
          <Ionicons name="checkmark-circle" size={24} color={palette.success} />
        </View>
        <Text style={[styles.emptyTitle, { color: palette.text }]}>You&rsquo;re all caught up</Text>
        <Text style={[styles.emptyText, { color: palette.muter }]}>No more priority jobs for today.</Text>
      </View>
    );
  }

  const bookingMap = new Map(bookings.map((booking) => [booking.id, booking]));
  const accentByBookingId = new Map(
    bookings.map((booking, index) => [booking.id, getPriorityAccent(index, isDarkMode)]),
  );
  const maxDepth = order.length - 1;

  const bringToFront = (id: string) => {
    setOrder((current) => (current[0] === id ? current : [id, ...current.filter((cardId) => cardId !== id)]));
  };

  return (
    <View style={[styles.stackContainer, { height: cardHeight, marginTop: maxDepth * PEEK_OFFSET }]}>
      {order.map((id, depth) => {
        const booking = bookingMap.get(id);
        if (!booking) return null;
        const customer = customerMap.get(booking.customerId);

        return (
          <PriorityCard
            key={id}
            depth={depth}
            zIndex={order.length - depth}
            palette={palette}
            accentColor={accentByBookingId.get(id) ?? palette.accent}
            onPress={() => bringToFront(id)}
            onMeasured={(height) => setCardHeight((current) => Math.max(current, height))}
            // Only the front card may be swiped; every card behind it keeps tap-to-front alone.
            canSwipe={depth === 0 && Boolean(onComplete)}
            isOpen={openId === id}
            onOpenChange={(open) => setOpenId(open ? id : null)}
            isCompleting={completingId === id}
            onComplete={() => handleComplete(id)}
            accessibilityLabel={`${booking.title} booking for ${customer?.name ?? 'unknown customer'}`}>
            <View style={styles.listHeader}>
              <View style={styles.listHeaderText}>
                <Text style={[styles.bookingTitle, { color: palette.text }]} numberOfLines={1}>
                  {booking.title}
                </Text>
                <Text style={[styles.bookingCustomer, { color: palette.muter }]} numberOfLines={1}>
                  {customer?.name ?? 'Unknown customer'}
                </Text>
              </View>
              <StatusPill label={booking.status} tone={statusTone(booking.status)} />
            </View>

            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={16} color={palette.muter} />
              <Text style={[styles.metaValue, { color: palette.text }]}>{formatBookingDate(booking.date)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={16} color={palette.muter} />
              <Text style={[styles.metaValue, { color: palette.text }]}>
                {formatBookingTime(booking.startTime ?? booking.time)} – {formatBookingTime(booking.endTime)}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={16} color={palette.muter} />
              <Text style={[styles.metaValue, { color: palette.text }]}>{booking.location}</Text>
            </View>
            <View style={[styles.metaRow, styles.priceRow]}>
              <Text style={[styles.priceValue, { color: palette.text }]} numberOfLines={1}>
                {currencyFormatter.format(booking.price)}
              </Text>
            </View>
          </PriorityCard>
        );
      })}
    </View>
  );
}

type PriorityCardProps = {
  depth: number;
  zIndex: number;
  palette: AppPalette;
  /** This booking's own stripe colour, so the stack reads as distinct cards. */
  accentColor: string;
  onPress: () => void;
  onMeasured: (height: number) => void;
  children: ReactNode;
  canSwipe: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isCompleting: boolean;
  onComplete: () => void;
  accessibilityLabel: string;
};

function PriorityCard({
  depth,
  zIndex,
  palette,
  accentColor,
  onPress,
  onMeasured,
  children,
  canSwipe,
  isOpen,
  onOpenChange,
  isCompleting,
  onComplete,
  accessibilityLabel,
}: PriorityCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const animatedDepth = useSharedValue(depth);
  // Horizontal offset of the card face. Entirely separate from the depth animation above, which
  // owns translateY / scale / opacity and is left exactly as it was.
  const translateX = useSharedValue(0);
  // The exit, kept as its own value so the two motions do not fight: `translateX` reveals the
  // action by moving the face alone, while `exitX` carries the face and the action off together.
  const exitX = useSharedValue(0);
  // Latched from the moment Complete is tapped until the card has left the screen.
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    animatedDepth.value = withSpring(depth, { damping: 16, stiffness: 160, mass: 0.9 });
  }, [depth, animatedDepth]);

  // Driven from the parent so a card can never be left parked open once it leaves the front. It
  // stands down while the card is exiting, or closing the action would yank it back mid-flight.
  useEffect(() => {
    if (isExiting) return;
    translateX.value = withSpring(isOpen ? -ACTION_WIDTH : 0, { damping: 20, stiffness: 220, mass: 0.7 });
  }, [isExiting, isOpen, translateX]);

  /**
   * Completing carries on the movement the swipe started: the card keeps travelling left until it
   * is clear of the screen, and only then is the booking marked done — which is what removes it
   * from the stack and lets the card behind it spring forward on the existing depth animation.
   */
  const handleCompletePress = () => {
    if (isExiting || isCompleting) return;

    setIsExiting(true);
    exitX.value = withTiming(
      // Past the far edge, so both the card and its Complete action are genuinely gone before the
      // booking is removed.
      -(screenWidth + ACTION_WIDTH),
      { duration: EXIT_MS, easing: EXIT_EASING },
      (finished) => {
        'worklet';
        if (finished) scheduleOnRN(onComplete);
      },
    );
  };

  const animatedStyle = useAnimatedStyle(() => {
    const translateY = animatedDepth.value * -PEEK_OFFSET;
    const scale = 1 - animatedDepth.value * SCALE_STEP;
    const opacity = 1 - animatedDepth.value * OPACITY_STEP;

    return {
      transform: [{ translateY }, { scale }],
      opacity,
      zIndex,
    };
  });

  // The face carries both: how far it has been swiped, plus however far the card has left to go.
  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value + exitX.value }],
  }));

  // Fades the action in as the card clears it, so it is never a hard edge appearing at 1px, and
  // takes only the exit offset — it must stay put while the face slides off it to be revealed.
  const actionStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(Math.min(translateX.value, 0)) / (ACTION_WIDTH * 0.6)),
    transform: [{ translateX: exitX.value }],
  }));

  /**
   * Left-drag only, and deliberately hard to trigger by accident:
   *
   * - `activeOffsetX` means the pan does not even begin until the finger has travelled past a
   *   plain tap, so tapping a card still reaches the Pressable underneath and still brings it to
   *   the front exactly as before.
   * - `failOffsetY` hands any mostly-vertical drag straight to the dashboard's scroll view.
   * - `.enabled(canSwipe)` leaves the gesture completely inert on every card behind the front one.
   */
  const pan = Gesture.Pan()
    .enabled(canSwipe && !isCompleting && !isExiting)
    .activeOffsetX([-SWIPE_ACTIVATION_X, SWIPE_ACTIVATION_X])
    .failOffsetY([-SCROLL_YIELD_Y, SCROLL_YIELD_Y])
    .onUpdate((event) => {
      'worklet';
      const base = isOpen ? -ACTION_WIDTH : 0;
      // Clamped: never past the action's width, and never dragged out to the right.
      translateX.value = Math.min(0, Math.max(-ACTION_WIDTH, base + event.translationX));
    })
    .onEnd((event) => {
      'worklet';
      const shouldOpen = translateX.value <= -OPEN_THRESHOLD || event.velocityX < -600;
      translateX.value = withSpring(shouldOpen ? -ACTION_WIDTH : 0, {
        damping: 20,
        stiffness: 220,
        mass: 0.7,
      });
      scheduleOnRN(onOpenChange, shouldOpen);
    });

  return (
    <Animated.View
      style={[styles.cardWrapper, animatedStyle]}
      onLayout={(event) => onMeasured(event.nativeEvent.layout.height)}>
      {canSwipe ? (
        <Animated.View
          style={[styles.actionLayer, actionStyle]}
          pointerEvents={isOpen && !isExiting ? 'auto' : 'none'}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark job as completed"
            accessibilityState={{ disabled: isCompleting || isExiting }}
            disabled={isCompleting || isExiting}
            onPress={handleCompletePress}
            style={({ pressed }) => [
              styles.completeAction,
              { backgroundColor: palette.success },
              pressed && styles.completeActionPressed,
            ]}>
            {/* Brief success state while the card slides away. */}
            <Ionicons
              name={isCompleting || isExiting ? 'checkmark-done-circle' : 'checkmark-circle'}
              size={22}
              color="#FFFFFF"
            />
            <Text style={styles.completeActionText} numberOfLines={1}>
              Complete
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}

      <GestureDetector gesture={pan}>
        <Animated.View style={faceStyle}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={canSwipe ? 'Swipe left to reveal the complete action' : 'Brings this booking to the front'}
            // Unchanged for every card behind the front one. On the front card, where bringing to
            // front is already a no-op, a tap closes an exposed action instead.
            disabled={isExiting}
            onPress={() => {
              if (isOpen) {
                onOpenChange(false);
                return;
              }
              onPress();
            }}
            style={[
              styles.listCard,
              {
                backgroundColor: palette.surfaceAlt,
                borderColor: palette.border,
                shadowColor: palette.background,
              },
            ]}>
            <View style={[styles.cardAccent, { backgroundColor: accentColor }]} />
            {children}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stackContainer: {
    position: 'relative',
  },
  cardWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  /**
   * Sits behind the card face, pinned to the right edge and matching the card's own rounded shape,
   * so sliding the face left uncovers it rather than pushing anything around.
   */
  actionLayer: {
    alignItems: 'flex-end',
    borderRadius: 22,
    bottom: 0,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
    width: ACTION_WIDTH,
  },
  completeAction: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
    justifyContent: 'center',
    // Well past the 44pt minimum in both directions.
    minHeight: 44,
    paddingHorizontal: 12,
    width: '100%',
  },
  completeActionPressed: {
    opacity: 0.82,
  },
  completeActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  listCard: {
    position: 'relative',
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    overflow: 'hidden',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 4, height: 6 },
    elevation: 3,
  },
  cardAccent: {
    position: 'absolute',
    top: 18,
    left: 0,
    width: 4,
    height: 38,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  listHeaderText: {
    flex: 1,
    marginRight: 10,
  },
  bookingTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  bookingCustomer: {
    fontSize: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  metaValue: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  priceRow: {
    // Aligns with the metadata labels above rather than with the icon column they sit in.
    marginBottom: 0,
    marginTop: 2,
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 22,
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 52,
    justifyContent: 'center',
    marginBottom: 12,
    width: 52,
  },
  emptyTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
