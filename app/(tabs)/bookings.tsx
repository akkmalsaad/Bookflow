import { AddBookingModal } from '@/components/booking/AddBookingModal';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Booking, getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { SectionHeader } from '@/components/SectionHeader';
import { JobStatusPill } from '@/components/booking/JobStatusPill';
import { JobStatusSheet } from '@/components/booking/JobStatusSheet';
import {
  SETTINGS_ICON_BACKGROUND_COLOR,
  SETTINGS_ICON_STROKE_COLOR,
} from '@/components/settings/tokens';
import { useSnackbar } from '@/context/snackbar-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import type { BookingStatus } from '@/lib/booking-status';
import { usePressScale } from '@/components/use-press-scale';
import { useResponsive } from '@/lib/responsive';
import { useTranslation } from '@/lib/use-translation';
import { captureEvent } from '@/lib/analytics';

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);
const TAP_EASING = Easing.out(Easing.cubic);
/** Peak ripple size, as a multiple of the day cell. Just past its own edges, never into its neighbours. */
const RIPPLE_MAX_SCALE = 1.2;

/**
 * The calendar day cell, with tap feedback only: a scale pulse, a ripple ring that expands from the
 * tapped day, and the selected fill easing in instead of snapping. Selection itself is untouched —
 * `onPress` still does exactly what it did, and the cell keeps the styles passed to it.
 */
function CalendarDayCell({
  style,
  fillColor,
  rippleColor,
  isSelected,
  onPress,
  children,
}: {
  style: StyleProp<ViewStyle>;
  /** The selected-state fill, faded in on tap. */
  fillColor: string;
  rippleColor: string;
  isSelected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const pressScale = useSharedValue(1);
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);
  const fill = useSharedValue(isSelected ? 1 : 0);
  const [isRingVisible, setIsRingVisible] = useState(false);

  useEffect(() => {
    if (reduced) {
      fill.set(isSelected ? 1 : 0);
      return;
    }
    // The existing selected colour, faded in 80ms after the tap rather than applied instantly.
    fill.set(isSelected ? withDelay(80, withTiming(1, { duration: 320 })) : withTiming(0, { duration: 320 }));
  }, [fill, isSelected, reduced]);

  const handlePress = () => {
    // Alongside the pulse and ripple, and silent where the device or platform has no haptics.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!reduced) {
      pressScale.set(
        withSequence(
          withTiming(1.18, { duration: 140, easing: TAP_EASING }),
          withTiming(1, { duration: 180, easing: TAP_EASING }),
        ),
      );
      // A tap during another day's ripple simply starts its own; this one restarts from the top.
      setIsRingVisible(true);
      ringScale.set(1);
      ringOpacity.set(0.75);
      ringScale.set(withTiming(RIPPLE_MAX_SCALE, { duration: 550, easing: TAP_EASING }));
      ringOpacity.set(
        withTiming(0, { duration: 550, easing: TAP_EASING }, (finished) => {
          'worklet';
          // Interrupted by a fresh tap: that run owns the ring and will remove it instead.
          if (finished) scheduleOnRN(setIsRingVisible, false);
        }),
      );
    }
    onPress();
  };

  const cellStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.get() }],
    // From the same colour at zero alpha, so an unselected cell shows no box at all.
    backgroundColor: interpolateColor(fill.get(), [0, 1], [`${fillColor}00`, fillColor]),
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.get(),
    // Divided by the pulse so the ring reaches exactly RIPPLE_MAX_SCALE, not that much of a scaling cell.
    transform: [{ scale: ringScale.get() / Math.max(pressScale.get(), 0.001) }],
  }));

  return (
    <AnimatedPressable style={[style, cellStyle]} onPress={handlePress}>
      {isRingVisible ? (
        <Reanimated.View
          pointerEvents="none"
          style={[styles.dayRipple, { borderColor: rippleColor }, ringStyle]}
        />
      ) : null}
      {children}
    </AnimatedPressable>
  );
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export default function BookingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ composeForCustomerId?: string }>();
  const handledDeepLinkRef = useRef('');
  const { isDarkMode } = useTheme();
  const { packages, bookings, customers, updateBookingStatus, currency } = useAppData();
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const palette = getThemePalette(isDarkMode);
  // The schedule is a single column of text-heavy cards, so it uses the narrower reading column;
  // the month grid is capped tighter still so a day cell never turns into a letterbox.
  const { readingStyle, calendarStyle, dayCellHeight } = useResponsive();
  const addButtonPress = usePressScale();
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const [showComposer, setShowComposer] = useState(false);
  const [composerCustomerId, setComposerCustomerId] = useState<string>();
  // The booking whose job status is being changed. One at a time, so a second tap while the sheet
  // is open cannot start a competing edit.
  const [statusBookingId, setStatusBookingId] = useState<string | null>(null);

  const firstBookingDate = bookings[0]?.date ?? toIsoDate(new Date());
  const todayKey = toIsoDate(new Date());
  const [viewDate, setViewDate] = useState(new Date(`${firstBookingDate}T00:00:00`));
  const [selectedDate, setSelectedDate] = useState(firstBookingDate);

  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const startOffset = firstDayOfMonth.getDay();

  const calendarCells = useMemo(() => {
    const cells: { date: Date; isCurrentMonth: boolean; dateKey: string }[] = [];

    for (let index = 0; index < 42; index += 1) {
      const dayNumber = index - startOffset + 1;
      const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), dayNumber);
      cells.push({
        date,
        isCurrentMonth: date.getMonth() === viewDate.getMonth(),
        dateKey: toIsoDate(date),
      });
    }

    return cells;
  }, [startOffset, viewDate]);

  const selectedDayBookings = bookings.filter((item) => item.date === selectedDate);
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(viewDate);

  const goToPreviousMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const openComposer = () => {
    if (!packages.length) return;
    setComposerCustomerId(undefined);
    setShowComposer(true);
  };

  // A customer profile can ask this tab to open the composer for a specific customer.
  useEffect(() => {
    const composeForCustomerId = typeof params.composeForCustomerId === 'string' ? params.composeForCustomerId : '';

    if (!composeForCustomerId || handledDeepLinkRef.current === composeForCustomerId) return;
    handledDeepLinkRef.current = composeForCustomerId;

    openComposer();
    setComposerCustomerId(composeForCustomerId);
    router.setParams({ composeForCustomerId: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.composeForCustomerId]);

  const statusBooking = bookings.find((item) => item.id === statusBookingId) ?? null;

  const handleStatusSelect = (status: BookingStatus) => {
    if (!statusBookingId) return;

    const result = updateBookingStatus(statusBookingId, status);
    setStatusBookingId(null);

    if (!result.ok) {
      showSnackbar({ message: result.error ?? t('bookings.error.status'), tone: 'danger' });
      return;
    }

    captureEvent('booking_status_updated', { status });
  };

  const flatListData: (Booking | { readonly id: 'empty-state'; readonly __empty: true })[] = selectedDayBookings.length > 0
    ? selectedDayBookings
    : [{ id: 'empty-state', __empty: true } as const];
  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <FlatList
        data={flatListData}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={(
          <>
            <View style={styles.headerRow}>
              <View style={styles.headerTitleGroup}>
                <View style={[styles.headerIcon, { backgroundColor: SETTINGS_ICON_BACKGROUND_COLOR, borderColor: softBorder, shadowColor: softShadow }]}>
                  <Ionicons name="calendar-outline" size={23} color={SETTINGS_ICON_STROKE_COLOR} />
                </View>
                <View>
                  <Text style={[styles.eyebrow, { color: '#142A3A' }]}>{t('bookings.eyebrow')}</Text>
                  <Text style={[styles.title, { color: palette.text }]}>{t('bookings.title')}</Text>
                </View>
              </View>
              <Reanimated.View style={addButtonPress.scaleStyle}>
                <Pressable
                  style={[styles.primaryButton, { backgroundColor: '#142A3A', shadowColor: palette.accent }]}
                  onPressIn={addButtonPress.onPressIn}
                  onPressOut={addButtonPress.onPressOut}
                  onPress={openComposer}>
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>{t('bookings.add')}</Text>
                </Pressable>
              </Reanimated.View>
            </View>

            <View style={[styles.calendarCard, calendarStyle, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
              <View style={styles.monthHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('bookings.prevMonth')}
                  hitSlop={8}
                  onPress={goToPreviousMonth}
                  style={[styles.arrowButton, { backgroundColor: softInset, borderColor: softBorder }]}>
                  <Ionicons name="chevron-back" size={18} color={palette.text} />
                </Pressable>
                <Text style={[styles.monthLabel, { color: palette.text }]}>{monthLabel}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('bookings.nextMonth')}
                  hitSlop={8}
                  onPress={goToNextMonth}
                  style={[styles.arrowButton, { backgroundColor: softInset, borderColor: softBorder }]}>
                  <Ionicons name="chevron-forward" size={18} color={palette.text} />
                </Pressable>
              </View>

              <View style={styles.weekRow}>
                {weekDays.map((day) => (
                  <Text key={day} style={[styles.weekday, { color: palette.muter }]}>
                    {day}
                  </Text>
                ))}
              </View>

              <View style={styles.grid}>
                {calendarCells.map((cell) => {
                  const isSelected = cell.dateKey === selectedDate;
                  const isToday = cell.dateKey === todayKey;
                  const hasEvent = bookings.some((booking) => booking.date === cell.dateKey);

                  return (
                    <CalendarDayCell
                      key={`${cell.dateKey}-cell`}
                      style={[
                        styles.dayCell,
                        { height: dayCellHeight },
                        cell.isCurrentMonth ? null : { opacity: 0.52 },
                        isSelected && { shadowColor: palette.accent, shadowOpacity: 0.22, elevation: 3 },
                        isToday && { borderWidth: 2, borderColor: '#142A3A' },
                      ]}
                      fillColor="#142A3A"
                      rippleColor="#142A3A"
                      isSelected={isSelected}
                      onPress={() => setSelectedDate(cell.dateKey)}>
                      <Text style={[styles.dayNumber, { color: isSelected ? '#FFFFFF' : palette.text }]}>
                        {cell.date.getDate()}
                      </Text>
                      {hasEvent && <View style={[styles.dot, { backgroundColor: isSelected ? '#FFFFFF' : palette.accent }]} />}
                    </CalendarDayCell>
                  );
                })}
              </View>
            </View>

            <View style={styles.eventsHeader}>
              <SectionHeader
                icon="calendar-outline"
                eyebrow={t('bookings.scheduleEyebrow')}
                title={formatDisplayDate(selectedDate)}
                rightElement={
                  <View style={[styles.eventCountPill, { backgroundColor: softInset }]}>
                    <Text style={[styles.eventCountText, { color: palette.accent }]}>{selectedDayBookings.length}</Text>
                  </View>
                }
              />
            </View>
          </>
        )}
        renderItem={({ item }) => {
          if ('__empty' in item) {
            return (
              <View style={[styles.emptyState, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
                <View style={[styles.emptyIcon, { backgroundColor: softInset }]}>
                  <Ionicons name="calendar-outline" size={24} color={palette.accent} />
                </View>
                <Text style={[styles.emptyText, { color: palette.muter }]}>{t('bookings.emptyDate')}</Text>
              </View>
            );
          }

          const customer = customerMap.get(item.customerId);

          return (
            <View style={[styles.card, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, shadowColor: palette.background }]}>
              <View style={[styles.cardAccent, { backgroundColor: palette.accent }]} />
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderCopy}>
                  <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.customer, { color: palette.muter }]} numberOfLines={1}>{customer?.name ?? 'Unknown customer'}</Text>
                </View>
                {/* The job status lives once per card, on the pill in the footer. */}
              </View>

              <View style={styles.scheduleMetaRow}>
                <Ionicons name="calendar-outline" size={16} color={palette.muter} />
                <Text style={[styles.scheduleMetaValue, { color: palette.text }]}>{formatDisplayDate(item.date)}</Text>
              </View>
              <View style={styles.scheduleMetaRow}>
                <Ionicons name="time-outline" size={16} color={palette.muter} />
                <Text style={[styles.scheduleMetaValue, { color: palette.text }]}>
                  {item.startTime ?? item.time ?? t('bookings.notSpecified')} – {item.endTime ?? t('bookings.notSpecified')}
                </Text>
              </View>
              <View style={styles.scheduleMetaRow}>
                <Ionicons name="location-outline" size={16} color={palette.muter} />
                <Text style={[styles.scheduleMetaValue, { color: palette.text }]} numberOfLines={2}>{item.location}</Text>
              </View>
              <View style={styles.scheduleMetaRow}>
                <Ionicons name="cube-outline" size={16} color={palette.muter} />
                <Text style={[styles.scheduleMetaValue, { color: palette.text }]} numberOfLines={1}>{item.packageName}</Text>
              </View>

              <View style={[styles.scheduleNotes, { backgroundColor: softSurface }]}>
                <Ionicons name="document-text-outline" size={15} color={palette.muter} />
                <Text style={[styles.notes, { color: palette.muter }]} numberOfLines={2}>{item.notes}</Text>
              </View>

              <View style={styles.scheduleFooter}>
                <View style={styles.schedulePrice}>
                  <Ionicons name="cash-outline" size={17} color={palette.muter} />
                  <Text style={[styles.amount, { color: palette.text }]}>{currencyFormatter.format(item.price)}</Text>
                </View>
                <JobStatusPill
                  status={item.status}
                  onPress={() => setStatusBookingId(item.id)}
                  disabled={statusBookingId !== null}
                />
              </View>
            </View>
          );
        }}
        contentContainerStyle={[styles.listContent, readingStyle]}
      />

      {showComposer ? (
        <AddBookingModal
          selectedDate={selectedDate}
          initialCustomerId={composerCustomerId}
          onClose={() => setShowComposer(false)}
        />
      ) : null}

      <JobStatusSheet
        visible={statusBooking !== null}
        status={statusBooking?.status}
        bookingTitle={statusBooking?.title}
        onSelect={handleStatusSelect}
        onClose={() => setStatusBookingId(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 120,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 6, height: 7 },
    elevation: 5,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 12,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 4, height: 7 },
    elevation: 5,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 6,
  },
  calendarCard: {
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 14,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 8, height: 10 },
    elevation: 5,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    paddingHorizontal: 6,
  },
  arrowButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.25,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  weekday: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.35,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    marginBottom: 6,
    position: 'relative',
    shadowOpacity: 0,
    shadowRadius: 7,
    shadowOffset: { width: 2, height: 4 },
    elevation: 0,
  },
  dayRipple: {
    // Inset to the cell's own bounds, so the ring is the cell's square — same radius as selected.
    ...StyleSheet.absoluteFillObject,
    borderRadius: 15,
    borderWidth: 2,
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    bottom: 6,
  },
  eventsHeader: {
    marginTop: 24,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  eventCountPill: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  eventCountText: {
    fontSize: 13,
    fontWeight: '800',
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 132,
    shadowOpacity: 0.13,
    shadowRadius: 15,
    shadowOffset: { width: 6, height: 8 },
    elevation: 4,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    position: 'relative',
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardHeaderCopy: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  customer: {
    fontSize: 12,
  },
  scheduleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  scheduleMetaValue: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  scheduleNotes: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    padding: 10,
    marginTop: 2,
  },
  scheduleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  schedulePrice: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    marginRight: 10,
  },
  amount: {
    // Shrinks with the price row so a long amount and the status pill can share a narrow card.
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 8,
  },
  notes: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 8,
  },
  dropdownButtonActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  selectOptionSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
});
