import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { StatusPill } from '@/components/StatusPill';
import type { Booking, Customer } from '@/context/app-data-context';
import type { AppPalette } from '@/context/theme-context';

const PEEK_OFFSET = 44;
const SCALE_STEP = 0.05;
const OPACITY_STEP = 0.18;
const DEFAULT_CARD_HEIGHT = 150;

function statusTone(status: Booking['status']) {
  return status === 'Confirmed' ? 'blue' : status === 'Completed' ? 'green' : status === 'Inquiry' ? 'amber' : 'red';
}

type PriorityStackProps = {
  bookings: Booking[];
  customerMap: Map<string, Customer>;
  currencyFormatter: Intl.NumberFormat;
  palette: AppPalette;
};

export function PriorityStack({ bookings, customerMap, currencyFormatter, palette }: PriorityStackProps) {
  const [order, setOrder] = useState<string[]>(() => bookings.map((booking) => booking.id));
  const [cardHeight, setCardHeight] = useState(DEFAULT_CARD_HEIGHT);

  useEffect(() => {
    setOrder((current) => {
      const validIds = bookings.map((booking) => booking.id);
      const preserved = current.filter((id) => validIds.includes(id));
      const added = validIds.filter((id) => !preserved.includes(id));
      return [...preserved, ...added];
    });
  }, [bookings]);

  if (bookings.length === 0) {
    return <Text style={[styles.emptyText, { color: palette.muter }]}>No bookings scheduled for today.</Text>;
  }

  const bookingMap = new Map(bookings.map((booking) => [booking.id, booking]));
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
            onPress={() => bringToFront(id)}
            onMeasured={(height) => setCardHeight((current) => Math.max(current, height))}>
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
              <Text style={[styles.metaValue, { color: palette.text }]}>{booking.date}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={16} color={palette.muter} />
              <Text style={[styles.metaValue, { color: palette.text }]}>{booking.location}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="cash-outline" size={16} color={palette.muter} />
              <Text style={[styles.metaValue, styles.currencyMetaValue, { color: palette.text }]}>
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
  onPress: () => void;
  onMeasured: (height: number) => void;
  children: ReactNode;
};

function PriorityCard({ depth, zIndex, palette, onPress, onMeasured, children }: PriorityCardProps) {
  const animatedDepth = useSharedValue(depth);

  useEffect(() => {
    animatedDepth.value = withSpring(depth, { damping: 16, stiffness: 160, mass: 0.9 });
  }, [depth, animatedDepth]);

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

  return (
    <Animated.View
      style={[styles.cardWrapper, animatedStyle]}
      onLayout={(event) => onMeasured(event.nativeEvent.layout.height)}>
      <Pressable
        onPress={onPress}
        style={[styles.listCard, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
        {children}
      </Pressable>
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
  listCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
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
  currencyMetaValue: {
    fontSize: 11,
  },
  emptyText: {
    fontSize: 13,
  },
});
