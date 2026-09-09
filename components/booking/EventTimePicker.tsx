import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppPalette } from '@/context/theme-context';

/**
 * The start/finish time control from the New Booking composer, lifted out unchanged so the invoice
 * event schedule uses the same picker rather than a second implementation of the same idea.
 *
 * Markup, wheel behaviour and styles are exactly the composer's — only the colours it used to read
 * from its own scope now arrive as props.
 */

const hourOptions = Array.from({ length: 12 }, (_, index) => index + 1);
const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const periodOptions = ['AM', 'PM'] as const;
export type TimePeriod = typeof periodOptions[number];
export type TimePart = 'hour' | 'minute' | 'period';

const WHEEL_ITEM_HEIGHT = 36;
const WHEEL_VISIBLE_COUNT = 4;
const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_COUNT;
const WHEEL_PADDING = (WHEEL_HEIGHT - WHEEL_ITEM_HEIGHT) / 2;

/** The soft surface colours the host screen already computes for its own fields. */
export type TimePickerColors = {
  palette: AppPalette;
  softInset: string;
  softBorder: string;
  accentSoft: string;
};

function WheelColumn({
  items,
  selectedIndex,
  onSelect,
  textColor,
  align = 'center',
  itemPaddingLeft = 0,
}: {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  textColor: string;
  align?: 'center' | 'flex-start';
  /** Keeps the AM/PM inset inside the scrollable area instead of as dead padding beside it. */
  itemPaddingLeft?: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(selectedIndex * WHEEL_ITEM_HEIGHT)).current;
  // The index the parent already knows about, so momentum does not re-commit the same value.
  const committedIndex = useRef(selectedIndex);
  const hasPositioned = useRef(false);

  const commitOffset = (offsetY: number) => {
    const index = Math.max(0, Math.min(items.length - 1, Math.round(offsetY / WHEEL_ITEM_HEIGHT)));
    if (index === committedIndex.current) return;
    committedIndex.current = index;
    onSelect(index);
  };

  const selectIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    scrollRef.current?.scrollTo({ y: clamped * WHEEL_ITEM_HEIGHT, animated: true });
    if (clamped === committedIndex.current) return;
    committedIndex.current = clamped;
    onSelect(clamped);
  };

  return (
    <View style={styles.wheelViewport}>
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        nestedScrollEnabled
        contentContainerStyle={styles.wheelContent}
        // Positioned once the content is measured, so reopening the picker lands on the saved value.
        onContentSizeChange={() => {
          if (hasPositioned.current) return;
          hasPositioned.current = true;
          scrollRef.current?.scrollTo({ y: selectedIndex * WHEEL_ITEM_HEIGHT, animated: false });
        }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        // Values are only read once the wheel settles — never mid-drag, and never by pushing the
        // scroll position around while the finger is still down.
        onMomentumScrollEnd={(event) => commitOffset(event.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(event) => {
          const { velocity, contentOffset } = event.nativeEvent;
          // A flick hands over to momentum, which commits when it stops.
          if (velocity && Math.abs(velocity.y) > 0.05) return;
          commitOffset(contentOffset.y);
        }}>
        {items.map((label, index) => {
          const inputRange = [
            (index - 2) * WHEEL_ITEM_HEIGHT,
            (index - 1) * WHEEL_ITEM_HEIGHT,
            index * WHEEL_ITEM_HEIGHT,
            (index + 1) * WHEEL_ITEM_HEIGHT,
            (index + 2) * WHEEL_ITEM_HEIGHT,
          ];
          const opacity = scrollY.interpolate({ inputRange, outputRange: [0.22, 0.48, 1, 0.48, 0.22], extrapolate: 'clamp' });
          const scale = scrollY.interpolate({ inputRange, outputRange: [0.8, 0.9, 1, 0.9, 0.8], extrapolate: 'clamp' });
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => selectIndex(index)}
              style={[styles.wheelItem, { alignItems: align, paddingLeft: itemPaddingLeft }]}>
              <Animated.Text style={[styles.wheelItemText, { color: textColor, opacity, transform: [{ scale }] }]}>{label}</Animated.Text>
            </Pressable>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

export function getTimeParts(value: string) {
  const [hourValue, minute = '00'] = value.split(':');
  const hour24 = Number(hourValue);

  return {
    hour: hour24 % 12 || 12,
    minute,
    period: (hour24 >= 12 ? 'PM' : 'AM') as TimePeriod,
  };
}

export function to24HourTime(hour: number, minute: string, period: TimePeriod) {
  const hour24 = period === 'AM' ? hour % 12 : (hour % 12) + 12;
  return `${String(hour24).padStart(2, '0')}:${minute}`;
}

export function formatTime(value: string) {
  const { hour, minute, period } = getTimeParts(value);
  return `${hour}:${minute} ${period}`;
}

export function getSuggestedEndTime(startTime: string) {
  const [hourValue, minuteValue] = startTime.split(':');
  const totalMinutes = Math.min((Number(hourValue) * 60) + Number(minuteValue) + 60, (23 * 60) + 30);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** The field that opens the wheel menu, showing the time it currently holds. */
export function TimeSelectButton({
  value,
  accessibilityLabel,
  active,
  onPress,
  colors: { palette, softInset, softBorder, accentSoft },
}: {
  value: string;
  accessibilityLabel: string;
  active: boolean;
  onPress: () => void;
  colors: TimePickerColors;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[
        styles.timeSelectButton,
        { backgroundColor: softInset, borderColor: softBorder },
        active && { backgroundColor: accentSoft, borderColor: palette.accent },
      ]}>
      <Ionicons name="time-outline" size={18} color={palette.accent} />
      <Text style={[styles.timeSelectText, { color: palette.text }]}>{formatTime(value)}</Text>
      <Ionicons name={active ? 'chevron-up' : 'chevron-down'} size={16} color={palette.muter} />
    </Pressable>
  );
}

/** The hour / minute / AM-PM wheels, with the same Done button and range error as the composer. */
export function TimePickerMenu({
  title,
  value,
  onChangePart,
  error,
  doneDisabled = false,
  onDone,
  colors: { palette, softInset, softBorder, accentSoft },
}: {
  title: string;
  value: string;
  onChangePart: (part: TimePart, value: number | string) => void;
  error?: string;
  doneDisabled?: boolean;
  onDone: () => void;
  colors: TimePickerColors;
}) {
  const currentParts = getTimeParts(value);

  return (
    // No responder handlers on this panel: claiming the gesture here takes it away from
    // the wheels' scroll views, which stops them scrolling. The parent ScrollView is
    // already disabled while a picker is open, so nothing behind it can move anyway.
    <View style={[styles.timeMenu, { backgroundColor: softInset, borderColor: softBorder }]}>
      <View style={styles.timeMenuHeader}>
        <Text style={[styles.timeMenuTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.timeMenuValue, { color: palette.accent }]}>{formatTime(value)}</Text>
      </View>

      <View style={styles.wheelRow}>
        <View style={[styles.wheelHighlight, { top: WHEEL_PADDING, backgroundColor: accentSoft }]} pointerEvents="none" />
        <View style={styles.wheelColumnHour}>
          <WheelColumn
            items={hourOptions.map(String)}
            selectedIndex={hourOptions.indexOf(currentParts.hour)}
            onSelect={(index) => onChangePart('hour', hourOptions[index])}
            textColor={palette.text}
          />
        </View>
        <View style={styles.wheelColumnMinute}>
          <WheelColumn
            items={minuteOptions}
            selectedIndex={minuteOptions.indexOf(currentParts.minute)}
            onSelect={(index) => onChangePart('minute', minuteOptions[index])}
            textColor={palette.text}
          />
        </View>
        <View style={styles.wheelColumnPeriod}>
          <WheelColumn
            items={periodOptions as unknown as string[]}
            selectedIndex={periodOptions.indexOf(currentParts.period)}
            onSelect={(index) => onChangePart('period', periodOptions[index])}
            textColor={palette.text}
            align="flex-start"
            itemPaddingLeft={16}
          />
        </View>
      </View>

      {error ? <Text style={styles.timeRangeError}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: doneDisabled }}
        disabled={doneDisabled}
        onPress={onDone}
        style={[styles.timeDoneButton, { backgroundColor: palette.accent }, doneDisabled && styles.timeDoneButtonDisabled]}>
        <Text style={styles.timeDoneButtonText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  timeSelectButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeSelectText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  timeMenu: {
    borderWidth: 1,
    borderRadius: 16,
    marginTop: 8,
    padding: 8,
  },
  timeMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 3,
    paddingBottom: 6,
  },
  timeMenuTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  timeMenuValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  wheelRow: {
    flexDirection: 'row',
    position: 'relative',
    paddingHorizontal: 3,
    marginTop: 3,
  },
  wheelHighlight: {
    position: 'absolute',
    left: 3,
    right: 3,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 11,
  },
  wheelColumnHour: {
    width: 52,
  },
  wheelColumnMinute: {
    width: 52,
  },
  wheelColumnPeriod: {
    flex: 1,
  },
  wheelViewport: {
    height: WHEEL_HEIGHT,
    overflow: 'hidden',
    width: '100%',
  },
  wheelContent: {
    paddingVertical: WHEEL_PADDING,
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    justifyContent: 'center',
    width: '100%',
  },
  wheelItemText: {
    fontSize: 17,
    fontWeight: '600',
  },
  timeDoneButton: {
    minHeight: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 9,
  },
  timeDoneButtonDisabled: {
    opacity: 0.42,
  },
  timeDoneButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  timeRangeError: {
    color: '#DC2626',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
});
