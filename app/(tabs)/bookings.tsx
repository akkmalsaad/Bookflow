import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
// Aliased: this screen already imports React Native's own `Animated` for the package dropdown.
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

import { SuccessFeedback } from '@/components/feedback/SuccessFeedback';
import { useConfirmedSave } from '@/components/feedback/useConfirmedSave';
import { Booking, getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { SectionHeader } from '@/components/SectionHeader';
import { JobStatusPill } from '@/components/booking/JobStatusPill';
import { JobStatusSheet } from '@/components/booking/JobStatusSheet';
import {
  SETTINGS_ICON_BACKGROUND_COLOR,
  SETTINGS_ICON_STROKE_COLOR,
} from '@/components/settings/tokens';
import {
  formatTime,
  getSuggestedEndTime,
  getTimeParts,
  to24HourTime,
  TimePickerMenu,
  TimeSelectButton,
  type TimePart,
  type TimePeriod,
} from '@/components/booking/EventTimePicker';
import { useSnackbar } from '@/context/snackbar-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { KeyboardDoneButton } from '@/components/KeyboardDoneButton';
import { modalScrollProps } from '@/components/modal-keyboard';
import type { BookingStatus } from '@/lib/booking-status';
import {
  addMinutesToTime,
  findBookingTimeConflict,
  normalizeBookingTime,
  parsePackageDurationMinutes,
} from '@/lib/booking-conflicts';
import { getServiceDepositDefault, resolveServiceDepositAmount } from '@/lib/service-defaults';
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
type ActiveTimePicker = 'start' | 'finish' | null;

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Renders a resolved deposit for the form; a service without one leaves the field empty. */
function formatDepositDraft(amount: number | null) {
  if (amount === null || amount <= 0) return '';
  // Whole amounts lose the trailing .00 so the field reads the way the user would type it.
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
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
  const { packages, bookings, customers, checkPlanLimit, createBooking, updateBookingStatus, currency } = useAppData();
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const palette = getThemePalette(isDarkMode);
  // The schedule is a single column of text-heavy cards, so it uses the narrower reading column;
  // the month grid is capped tighter still so a day cell never turns into a letterbox.
  const { readingStyle, calendarStyle, sheetStyle, dayCellHeight } = useResponsive();
  const addButtonPress = usePressScale();
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const [showComposer, setShowComposer] = useState(false);
  const feedback = useConfirmedSave(showComposer);
  const [draftNotes, setDraftNotes] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id ?? '');
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>(customers.length ? 'existing' : 'new');
  const [customerQuery, setCustomerQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerLocation, setNewCustomerLocation] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState(packages[0]?.id ?? '');
  const [showPackageDropdown, setShowPackageDropdown] = useState(false);
  const [draftPrice, setDraftPrice] = useState(String(packages[0]?.price ?? 0));
  const [draftDeposit, setDraftDeposit] = useState('');
  // Mirrors isEndTimeManual: once the deposit is typed by hand it stops tracking the service and
  // the price, until a different service is chosen.
  const [isDepositManual, setIsDepositManual] = useState(false);
  const [draftStartTime, setDraftStartTime] = useState('10:00');
  const [draftEndTime, setDraftEndTime] = useState('11:00');
  // Once the finish time is dialled in by hand it stops following the package, until it is reset.
  const [isEndTimeManual, setIsEndTimeManual] = useState(false);
  const [activeTimePicker, setActiveTimePicker] = useState<ActiveTimePicker>(null);
  const isTimePickerOpen = activeTimePicker !== null;
  const [draftLocation, setDraftLocation] = useState('');
  const [formError, setFormError] = useState('');
  // The booking whose job status is being changed. One at a time, so a second tap while the sheet
  // is open cannot start a competing edit.
  const [statusBookingId, setStatusBookingId] = useState<string | null>(null);
  const dropdownAnim = useRef(new Animated.Value(0)).current;

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

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const filteredCustomers = customers.filter((customer) => {
    const searchTerm = customerQuery.trim().toLowerCase();
    if (!searchTerm) return true;
    return customer.name.toLowerCase().includes(searchTerm) || customer.email.toLowerCase().includes(searchTerm);
  });

  useEffect(() => {
    Animated.timing(dropdownAnim, {
      toValue: showCustomerDropdown ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [dropdownAnim, showCustomerDropdown]);

  const selectedDayBookings = bookings.filter((item) => item.date === selectedDate);
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(viewDate);

  const goToPreviousMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const selectedPackage = packages.find((item) => item.id === selectedPackageId) ?? packages[0];
  const packageDurationMinutes = parsePackageDurationMinutes(selectedPackage?.duration);

  /**
   * The finish time a package implies for a given start. Packages whose duration cannot be read
   * ("Half day") fall back to the previous +1 hour default rather than inventing a length.
   */
  const getPackageEndTime = (startTime: string, durationMinutes = packageDurationMinutes) =>
    (durationMinutes ? addMinutesToTime(startTime, durationMinutes) : null) ?? getSuggestedEndTime(startTime);

  const openComposer = () => {
    if (!packages.length) {
      return;
    }

    setSelectedCustomerId(customers[0]?.id ?? '');
    setCustomerMode(customers.length ? 'existing' : 'new');
    setCustomerQuery('');
    setShowCustomerDropdown(false);
    setNewCustomerName('');
    setNewCustomerEmail('');
    setNewCustomerPhone('');
    setNewCustomerLocation('');
    setSelectedPackageId(packages[0].id);
    setShowPackageDropdown(false);
    setDraftPrice(String(packages[0].price));
    setDraftDeposit(formatDepositDraft(resolveServiceDepositAmount(packages[0], packages[0].price)));
    setIsDepositManual(false);
    setDraftStartTime('10:00');
    setDraftEndTime(getPackageEndTime('10:00', parsePackageDurationMinutes(packages[0].duration)));
    setIsEndTimeManual(false);
    setActiveTimePicker(null);
    setDraftLocation('');
    setDraftNotes('');
    setFormError('');
    setShowComposer(true);
  };

  // A customer profile can ask this tab to open the composer for a specific customer.
  useEffect(() => {
    const composeForCustomerId = typeof params.composeForCustomerId === 'string' ? params.composeForCustomerId : '';

    if (!composeForCustomerId || handledDeepLinkRef.current === composeForCustomerId) return;
    handledDeepLinkRef.current = composeForCustomerId;

    openComposer();
    setCustomerMode('existing');
    setSelectedCustomerId(composeForCustomerId);
    router.setParams({ composeForCustomerId: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.composeForCustomerId]);

  const handlePackageSelection = (packageId: string) => {
    const chosenPackage = packages.find((item) => item.id === packageId);
    const nextPrice = chosenPackage?.price ?? 0;
    setSelectedPackageId(packageId);
    setDraftPrice(String(nextPrice));
    if (!isEndTimeManual) {
      setDraftEndTime(getPackageEndTime(draftStartTime, parsePackageDurationMinutes(chosenPackage?.duration)));
    }
    // Deliberately choosing another service re-fills the deposit even after a manual edit, which is
    // the one case where overwriting what was typed is what the user is asking for.
    setDraftDeposit(formatDepositDraft(resolveServiceDepositAmount(chosenPackage, nextPrice)));
    setIsDepositManual(false);
    setShowPackageDropdown(false);
  };

  // Says where the prefilled figure came from, and stays honest once it has been overridden.
  const serviceDeposit = getServiceDepositDefault(selectedPackage);
  const depositHint = isDepositManual
    ? t('bookings.deposit.manual')
    : serviceDeposit
      ? serviceDeposit.type === 'percent'
        ? t('bookings.deposit.percent', { value: serviceDeposit.value, service: selectedPackage?.name ?? t('bookings.deposit.thisService') })
        : t('bookings.deposit.fixed', { service: selectedPackage?.name ?? t('bookings.deposit.thisService') })
      : t('bookings.deposit.none');

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

  /** Hands the finish time back to the package after it has been overridden. */
  const resetEndTimeToPackage = () => {
    setIsEndTimeManual(false);
    setDraftEndTime(getPackageEndTime(draftStartTime));
    setFormError('');
  };

  const updateTimePart = (part: TimePart, value: number | string) => {
    if (!activeTimePicker) return;

    const currentTime = activeTimePicker === 'start' ? draftStartTime : draftEndTime;
    const currentParts = getTimeParts(currentTime);
    const nextTime = to24HourTime(
      part === 'hour' ? Number(value) : currentParts.hour,
      part === 'minute' ? String(value) : currentParts.minute,
      part === 'period' ? value as TimePeriod : currentParts.period,
    );

    if (activeTimePicker === 'start') {
      setDraftStartTime(nextTime);
      if (!isEndTimeManual) {
        // Keeps the booking the length the package says it is as the start moves.
        setDraftEndTime(getPackageEndTime(nextTime));
      } else if (draftEndTime <= nextTime) {
        setDraftEndTime(getSuggestedEndTime(nextTime));
      }
    } else {
      setDraftEndTime(nextTime);
      setIsEndTimeManual(true);
    }
    setFormError('');
  };

  const toggleTimeMenu = (menu: 'start' | 'finish') => {
    if (activeTimePicker === menu) {
      setActiveTimePicker(null);
      return;
    }

    setActiveTimePicker(menu);
    setShowCustomerDropdown(false);
    setShowPackageDropdown(false);
  };

  const handleAddBooking = () => feedback.run(() => {
    const numericPrice = Number(draftPrice);
    // The same gate the mutation enforces; checked here only to route into the upgrade flow.
    if (!checkPlanLimit('bookings').allowed) {
      setShowComposer(false);
      router.push({ pathname: '/paywall', params: { reason: 'bookings', returnTo: '/bookings' } });
      // `false` leaves useConfirmedSave untouched: nothing was mutated, so nothing awaits a save.
      return false;
    }

    const isNewCustomerValid = Boolean(newCustomerName.trim());
    const hasValidCustomer = customerMode === 'existing' ? Boolean(selectedCustomerId) : isNewCustomerValid;
    const startTime = normalizeBookingTime(draftStartTime);
    const endTime = normalizeBookingTime(draftEndTime);
    const hasValidTimeRange = Boolean(startTime && endTime && endTime > startTime);

    if (!selectedPackage || !hasValidCustomer || Number.isNaN(numericPrice) || numericPrice <= 0 || !startTime || !endTime || !hasValidTimeRange) {
      setFormError(t('bookings.error.fields'));
      return false;
    }

    const conflictingBooking = findBookingTimeConflict(bookings, selectedDate, startTime, endTime);
    if (conflictingBooking) {
      const conflictStart = normalizeBookingTime(conflictingBooking.startTime ?? conflictingBooking.time);
      const conflictEnd = normalizeBookingTime(conflictingBooking.endTime);
      const conflictTime = conflictStart
        ? `${formatTime(conflictStart)}${conflictEnd ? ` – ${formatTime(conflictEnd)}` : ''}`
        : t('bookings.error.selectedTime');
      setFormError(
        t('bookings.error.conflict', {
          title: conflictingBooking.title,
          date: formatDisplayDate(selectedDate),
          time: conflictTime,
        }),
      );
      return false;
    }

    // Blank means no deposit, which is a perfectly normal booking — only a typed value is checked.
    const trimmedDeposit = draftDeposit.trim();
    const numericDeposit = trimmedDeposit ? Number(trimmedDeposit) : 0;
    if (trimmedDeposit && (Number.isNaN(numericDeposit) || numericDeposit < 0)) {
      setFormError(t('bookings.error.deposit'));
      return false;
    }
    if (numericDeposit > numericPrice) {
      setFormError(t('bookings.error.depositTooHigh'));
      return false;
    }

    const result = createBooking({
      customerId: customerMode === 'existing' ? selectedCustomerId : undefined,
      newCustomer: customerMode === 'new' ? {
        name: newCustomerName,
        email: newCustomerEmail,
        phone: newCustomerPhone,
        location: newCustomerLocation,
        notes: 'Created while adding a booking.',
      } : undefined,
      title: selectedPackage.name,
      date: selectedDate,
      time: startTime,
      startTime,
      endTime,
      location: draftLocation.trim() || 'Client location',
      packageName: selectedPackage.name,
      price: numericPrice,
      // The value finally on the form, not the service's — editing the service later must never
      // reach back into this booking.
      depositAmount: numericDeposit > 0 ? numericDeposit : undefined,
      status: 'Inquiry',
      notes: draftNotes.trim() || 'New booking created from quick add.',
    });

    if (!result) {
      setFormError(t('bookings.error.save'));
      return false;
    }

    captureEvent('booking_created', {
      customer_source: customerMode,
      has_deposit: numericDeposit > 0,
    });
    return true;
  });

  const completeBooking = () => {
    setShowComposer(false);
    setActiveTimePicker(null);
    setDraftNotes('');
    setCustomerQuery('');
    setShowCustomerDropdown(false);
    if (selectedPackage) {
      setDraftPrice(String(selectedPackage.price));
      setDraftDeposit(formatDepositDraft(resolveServiceDepositAmount(selectedPackage, selectedPackage.price)));
    }
    setIsDepositManual(false);
    setFormError('');
  };

  const flatListData: (Booking | { readonly id: 'empty-state'; readonly __empty: true })[] = selectedDayBookings.length > 0
    ? selectedDayBookings
    : [{ id: 'empty-state', __empty: true } as const];
  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';
  const accentSoft = isDarkMode ? '#29284B' : '#E9E8FF';
  const timePickerColors = { palette, softInset, softBorder, accentSoft };

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

      <Modal visible={showComposer} transparent animationType="slide" onRequestClose={() => { if (!feedback.saving && !feedback.success) setShowComposer(false); }}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, sheetStyle, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }, feedback.success && { display: 'none' }]}>
            <View style={[styles.modalHandle, { backgroundColor: palette.border }]} />
            <View accessibilityElementsHidden={feedback.success} importantForAccessibility={feedback.success ? 'no-hide-descendants' : 'auto'} style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalEyebrow, { color: palette.accent }]}>{t('bookings.create.eyebrow')}</Text>
                <Text style={[styles.modalTitle, { color: palette.text }]}>{t('bookings.create.title')}</Text>
              </View>
              <Pressable disabled={feedback.saving || feedback.success} hitSlop={8} onPress={() => setShowComposer(false)} style={[styles.closeButton, { backgroundColor: softInset }]}>
                <Ionicons name="close" size={24} color={palette.text} />
              </Pressable>
            </View>

            <ScrollView
              accessibilityElementsHidden={feedback.success}
              importantForAccessibility={feedback.success ? 'no-hide-descendants' : 'auto'}
              {...modalScrollProps}
              // The wheels own every vertical gesture while a picker is open, so the form behind
              // them cannot scroll out from under the finger.
              scrollEnabled={!isTimePickerOpen}
              contentContainerStyle={styles.modalScrollContent}>

            <View pointerEvents={feedback.pending ? 'none' : 'auto'}>
            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.package')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('bookings.choosePackage')}
              onPress={() => {
                setShowPackageDropdown((current) => !current);
                setShowCustomerDropdown(false);
              }}
              style={[
                styles.dropdownButton,
                { backgroundColor: softInset, borderColor: softBorder },
                showPackageDropdown && { borderColor: palette.accent, backgroundColor: accentSoft },
              ]}>
              <View style={styles.packageSelectedCopy}>
                <Text style={[styles.packageSelectedName, { color: palette.text }]}>{selectedPackage?.name ?? 'Choose a package'}</Text>
                {selectedPackage ? (
                  <Text style={[styles.packageSelectedMeta, { color: palette.muter }]}>
                    {selectedPackage.duration} · {currencyFormatter.format(selectedPackage.price)}
                  </Text>
                ) : null}
              </View>
              <Ionicons name={showPackageDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={palette.text} />
            </Pressable>

            {showPackageDropdown && (
              <View style={[styles.packageDropdownPanel, { backgroundColor: softInset, borderColor: softBorder }]}>
                <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.packageDropdownScroll}>
                  {packages.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => handlePackageSelection(item.id)}
                      style={[
                        styles.packageOption,
                        { backgroundColor: softSurface, borderColor: softBorder },
                        selectedPackageId === item.id && { backgroundColor: accentSoft, borderColor: palette.accent },
                      ]}>
                      <View style={styles.packageOptionHeader}>
                        <Text style={[styles.packageOptionText, { color: palette.text }]}>{item.name}</Text>
                        {selectedPackageId === item.id ? <Ionicons name="checkmark" size={17} color={palette.accent} /> : null}
                      </View>
                      <Text style={[styles.packageOptionMeta, { color: palette.muter }]}>
                        {item.duration} · {currencyFormatter.format(item.price)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.customerSource')}</Text>
            <View style={styles.modeRow}>
              <Pressable
                onPress={() => {
                  setCustomerMode('existing');
                  setFormError('');
                }}
                style={[
                  styles.modeButton,
                  { backgroundColor: softInset, borderColor: softBorder },
                  customerMode === 'existing' && { backgroundColor: accentSoft, borderColor: palette.accent },
                ]}>
                <Text style={[styles.modeButtonText, { color: customerMode === 'existing' ? palette.accent : palette.text }]}>{t('bookings.existingCustomer')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setCustomerMode('new');
                  setShowCustomerDropdown(false);
                  setFormError('');
                }}
                style={[
                  styles.modeButton,
                  { backgroundColor: softInset, borderColor: softBorder },
                  customerMode === 'new' && { backgroundColor: accentSoft, borderColor: palette.accent },
                ]}>
                <Text style={[styles.modeButtonText, { color: customerMode === 'new' ? palette.accent : palette.text }]}>{t('bookings.newCustomer')}</Text>
              </Pressable>
            </View>

            {customerMode === 'existing' ? (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.customer')}</Text>
                <Pressable
                  onPress={() => {
                    setShowCustomerDropdown((current) => !current);
                    setShowPackageDropdown(false);
                  }}
                  style={[styles.dropdownButton, { backgroundColor: softInset, borderColor: softBorder }, showCustomerDropdown && { borderColor: palette.accent, backgroundColor: accentSoft }]}>
                  <Text style={[styles.dropdownText, { color: palette.text }]}>{selectedCustomer ? selectedCustomer.name : 'Choose a customer'}</Text>
                  <Ionicons name={showCustomerDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={palette.text} />
                </Pressable>

                <Animated.View
                  style={[
                    styles.dropdownPanel,
                    {
                      maxHeight: dropdownAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 220],
                      }),
                      opacity: dropdownAnim,
                      backgroundColor: softInset,
                      borderColor: softBorder,
                    },
                  ]}>
                  <TextInput
                    value={customerQuery}
                    onChangeText={setCustomerQuery}
                    placeholder={t('bookings.searchCustomer')}
                    placeholderTextColor={palette.muter}
                    style={[styles.searchInput, { backgroundColor: softSurface, borderColor: softBorder, color: palette.text }]}
                  />

                  {/* The list scrolls itself. Without this the rows were laid out in a plain View
                      that the panel simply clipped, so every drag fell through to the form behind
                      it and moved the whole modal instead. Mirrors the package dropdown above. */}
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    style={styles.dropdownScroll}
                    contentContainerStyle={styles.dropdownList}>
                    {filteredCustomers.length > 0 ? (
                      filteredCustomers.map((customer) => (
                        <Pressable
                          key={customer.id}
                          onPress={() => {
                            setSelectedCustomerId(customer.id);
                            setCustomerQuery('');
                            setShowCustomerDropdown(false);
                          }}
                          style={[styles.selectOption, { backgroundColor: softSurface, borderColor: softBorder }, selectedCustomerId === customer.id && { backgroundColor: accentSoft, borderColor: palette.accent }]}>
                          <Text style={[styles.selectText, { color: palette.text }]}>{customer.name}</Text>
                          <Text style={[styles.selectSubtext, { color: palette.muter }]}>{customer.email}</Text>
                        </Pressable>
                      ))
                    ) : (
                      <Text style={[styles.emptySearchText, { color: palette.muter }]}>{t('bookings.noMatchingCustomer')}</Text>
                    )}
                  </ScrollView>
                </Animated.View>
              </>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.field.customerName')}</Text>
                <TextInput
                  value={newCustomerName}
                  onChangeText={setNewCustomerName}
                  placeholder="Siti Nur Izzah"
                  placeholderTextColor={palette.muter}
                  style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.field.customerEmail')}</Text>
                <TextInput
                  value={newCustomerEmail}
                  onChangeText={setNewCustomerEmail}
                  placeholder="siti@example.my"
                  placeholderTextColor={palette.muter}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.field.customerPhone')}</Text>
                <TextInput
                  value={newCustomerPhone}
                  onChangeText={setNewCustomerPhone}
                  placeholder="+60 12-345 6789"
                  placeholderTextColor={palette.muter}
                  keyboardType="phone-pad"
                  style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.field.customerLocation')}</Text>
                <TextInput
                  value={newCustomerLocation}
                  onChangeText={setNewCustomerLocation}
                  placeholder="Kuala Lumpur"
                  placeholderTextColor={palette.muter}
                  style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                />
              </>
            )}

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.price')}</Text>
            <TextInput
              value={draftPrice}
              onChangeText={(value) => {
                setDraftPrice(value);
                // A percentage deposit follows the price it is a percentage of, right up until the
                // deposit is typed by hand.
                if (!isDepositManual) {
                  setDraftDeposit(formatDepositDraft(resolveServiceDepositAmount(selectedPackage, Number(value))));
                }
              }}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={palette.muter}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.deposit')}</Text>
            <TextInput
              value={draftDeposit}
              onChangeText={(value) => {
                setDraftDeposit(value);
                setIsDepositManual(true);
                setFormError('');
              }}
              keyboardType="numeric"
              placeholder={t('bookings.deposit.optional')}
              placeholderTextColor={palette.muter}
              accessibilityLabel={t('bookings.deposit.label')}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />
            <Text style={[styles.depositHint, { color: palette.muter }]}>
              {depositHint}
            </Text>

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.eventDate')}</Text>
            <TextInput
              value={selectedDate}
              editable={false}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.muter, opacity: 0.8 }]}
            />

            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.startTime')}</Text>
                <TimeSelectButton
                  value={draftStartTime}
                  accessibilityLabel={`${t('bookings.chooseStartTime')}, ${formatTime(draftStartTime)}`}
                  active={activeTimePicker === 'start'}
                  onPress={() => toggleTimeMenu('start')}
                  colors={timePickerColors}
                />
              </View>
              <View style={styles.timeField}>
                <View style={[styles.timeFieldLabelRow, styles.timeLabelSpacing]}>
                  <Text style={[styles.fieldLabel, styles.timeFieldLabel, { color: palette.muter }]}>{t('bookings.finishTime')}</Text>
                  {isEndTimeManual ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('bookings.auto.label')}
                      accessibilityHint={
                        selectedPackage ? `Sets it from ${selectedPackage.duration}` : undefined
                      }
                      hitSlop={8}
                      onPress={resetEndTimeToPackage}
                      style={({ pressed }) => pressed && styles.autoTagPressed}>
                      <Text style={[styles.autoTag, { color: palette.accent }]}>{t('bookings.auto')}</Text>
                    </Pressable>
                  ) : packageDurationMinutes ? (
                    <Text style={[styles.autoTag, styles.autoTagIdle, { color: palette.muter }]}>
                      Auto
                    </Text>
                  ) : null}
                </View>
                <TimeSelectButton
                  value={draftEndTime}
                  accessibilityLabel={`${t('bookings.chooseFinishTime')}, ${formatTime(draftEndTime)}`}
                  active={activeTimePicker === 'finish'}
                  onPress={() => toggleTimeMenu('finish')}
                  colors={timePickerColors}
                />
              </View>
            </View>

            {activeTimePicker ? (
              <TimePickerMenu
                title={activeTimePicker === 'start' ? t('bookings.chooseStartTime') : t('bookings.chooseFinishTime')}
                value={activeTimePicker === 'start' ? draftStartTime : draftEndTime}
                onChangePart={updateTimePart}
                error={draftEndTime <= draftStartTime ? t('bookings.timeRangeError') : undefined}
                doneDisabled={draftEndTime <= draftStartTime}
                onDone={() => setActiveTimePicker(null)}
                colors={timePickerColors}
              />
            ) : null}

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.eventLocation')}</Text>
            <TextInput
              value={draftLocation}
              onChangeText={setDraftLocation}
              placeholder={t('bookings.location.placeholder')}
              placeholderTextColor={palette.muter}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.notes')}</Text>
            <TextInput
              value={draftNotes}
              onChangeText={setDraftNotes}
              placeholder={t('bookings.notes.placeholder')}
              placeholderTextColor={palette.muter}
              multiline
              style={[styles.input, styles.notesInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />

            <View style={[styles.invoiceNotice, { backgroundColor: accentSoft, borderColor: palette.accent }]}>
              <Ionicons name="document-text-outline" size={18} color={palette.accent} />
              <Text style={[styles.invoiceNoticeText, { color: palette.text }]}>{t('bookings.invoiceNotice')}</Text>
            </View>

            </View>
            {formError || feedback.error ? <Text accessibilityRole="alert" style={styles.formError}>{feedback.error || formError}</Text> : null}

            <Pressable style={[styles.submitButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} disabled={feedback.saving || feedback.success} onPress={handleAddBooking}>
              <Text style={styles.submitButtonText}>{feedback.saving ? t('bookings.saving') : feedback.pending ? t('bookings.retry') : t('bookings.save')}</Text>
            </Pressable>
            </ScrollView>
          </View>
          <SuccessFeedback visible={feedback.success} title={t('bookings.created.title')} message={t('bookings.created.body')} onComplete={completeBooking} />

          <KeyboardDoneButton />
        </View>
      </Modal>

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
  depositHint: {
    fontSize: 11.5,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 6,
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
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
  },
  modalCard: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '92%',
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 14,
  },
  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 10,
  },
  modalScrollContent: {
    paddingBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  modalEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.65,
    marginBottom: 8,
    marginTop: 14,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  timeField: {
    flex: 1,
  },
  timeFieldLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeLabelSpacing: {
    marginBottom: 8,
    marginTop: 14,
  },
  timeFieldLabel: {
    // The row owns the spacing the label used to carry on its own.
    marginBottom: 0,
    marginTop: 0,
  },
  autoTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.65,
    textTransform: 'uppercase',
  },
  autoTagIdle: {
    opacity: 0.7,
  },
  autoTagPressed: {
    opacity: 0.6,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
  },
  dropdownButtonActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  dropdownText: {
    color: '#111827',
    fontWeight: '600',
    flex: 1,
  },
  dropdownPanel: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 18,
    marginBottom: 12,
  },
  dropdownScroll: {
    // Bounded so the list has somewhere to scroll inside the panel's animated 220pt cap, rather
    // than growing past it and being clipped.
    flexGrow: 0,
    flexShrink: 1,
  },
  dropdownList: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    margin: 8,
    color: '#111827',
  },
  selectOption: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
  },
  selectOptionSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  selectText: {
    color: '#111827',
    fontWeight: '600',
  },
  selectSubtext: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  emptySearchText: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 10,
  },
  notesInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  invoiceNotice: {
    borderWidth: 1,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  invoiceNoticeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginLeft: 8,
  },
  formError: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
  },
  packageSelectedCopy: {
    flex: 1,
  },
  packageSelectedName: {
    fontSize: 14,
    fontWeight: '700',
  },
  packageSelectedMeta: {
    fontSize: 12,
    marginTop: 3,
  },
  packageDropdownPanel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 8,
    marginBottom: 8,
  },
  packageDropdownScroll: {
    maxHeight: 240,
  },
  packageOption: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  packageOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  packageOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  packageOptionMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  submitButton: {
    marginTop: 18,
    borderRadius: 17,
    paddingVertical: 15,
    alignItems: 'center',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 4, height: 7 },
    elevation: 5,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
});
