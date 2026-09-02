import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Booking, getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { SectionHeader } from '@/components/SectionHeader';
import { JobStatusPill } from '@/components/booking/JobStatusPill';
import { JobStatusSheet } from '@/components/booking/JobStatusSheet';
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
import { getInvoiceNumber } from '@/lib/invoice-numbering';

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hourOptions = Array.from({ length: 12 }, (_, index) => index + 1);
const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const periodOptions = ['AM', 'PM'] as const;
type TimePeriod = typeof periodOptions[number];
type ActiveTimePicker = 'start' | 'finish' | null;

const WHEEL_ITEM_HEIGHT = 36;
const WHEEL_VISIBLE_COUNT = 4;
const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_COUNT;
const WHEEL_PADDING = (WHEEL_HEIGHT - WHEEL_ITEM_HEIGHT) / 2;

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

function getTimeParts(value: string) {
  const [hourValue, minute = '00'] = value.split(':');
  const hour24 = Number(hourValue);

  return {
    hour: hour24 % 12 || 12,
    minute,
    period: (hour24 >= 12 ? 'PM' : 'AM') as TimePeriod,
  };
}

function to24HourTime(hour: number, minute: string, period: TimePeriod) {
  const hour24 = period === 'AM' ? hour % 12 : (hour % 12) + 12;
  return `${String(hour24).padStart(2, '0')}:${minute}`;
}

function formatTime(value: string) {
  const { hour, minute, period } = getTimeParts(value);
  return `${hour}:${minute} ${period}`;
}

function getSuggestedEndTime(startTime: string) {
  const [hourValue, minuteValue] = startTime.split(':');
  const totalMinutes = Math.min((Number(hourValue) * 60) + Number(minuteValue) + 60, (23 * 60) + 30);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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
  const { packages, bookings, customers, createBooking, updateBookingStatus, currency } = useAppData();
  const { showSnackbar } = useSnackbar();
  const palette = getThemePalette(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const [showComposer, setShowComposer] = useState(false);
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
  }).slice(0, 8);

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
    setSelectedPackageId(packageId);
    setDraftPrice(String(chosenPackage?.price ?? 0));
    if (!isEndTimeManual) {
      setDraftEndTime(getPackageEndTime(draftStartTime, parsePackageDurationMinutes(chosenPackage?.duration)));
    }
    setShowPackageDropdown(false);
  };

  const statusBooking = bookings.find((item) => item.id === statusBookingId) ?? null;

  const handleStatusSelect = (status: BookingStatus) => {
    if (!statusBookingId) return;

    const result = updateBookingStatus(statusBookingId, status);
    setStatusBookingId(null);

    if (!result.ok) {
      showSnackbar({ message: result.error ?? 'The job status could not be updated.', tone: 'danger' });
    }
  };

  /** Hands the finish time back to the package after it has been overridden. */
  const resetEndTimeToPackage = () => {
    setIsEndTimeManual(false);
    setDraftEndTime(getPackageEndTime(draftStartTime));
    setFormError('');
  };

  const updateTimePart = (part: 'hour' | 'minute' | 'period', value: number | string) => {
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

  const handleAddBooking = () => {
    const numericPrice = Number(draftPrice);
    const isNewCustomerValid = Boolean(newCustomerName.trim());
    const hasValidCustomer = customerMode === 'existing' ? Boolean(selectedCustomerId) : isNewCustomerValid;
    const startTime = normalizeBookingTime(draftStartTime);
    const endTime = normalizeBookingTime(draftEndTime);
    const hasValidTimeRange = Boolean(startTime && endTime && endTime > startTime);

    if (!selectedPackage || !hasValidCustomer || Number.isNaN(numericPrice) || numericPrice <= 0 || !startTime || !endTime || !hasValidTimeRange) {
      setFormError('Choose a package and add valid customer, price, start time, and later finish time.');
      return;
    }

    const conflictingBooking = findBookingTimeConflict(bookings, selectedDate, startTime, endTime);
    if (conflictingBooking) {
      const conflictStart = normalizeBookingTime(conflictingBooking.startTime ?? conflictingBooking.time);
      const conflictEnd = normalizeBookingTime(conflictingBooking.endTime);
      const conflictTime = conflictStart
        ? `${formatTime(conflictStart)}${conflictEnd ? ` – ${formatTime(conflictEnd)}` : ''}`
        : 'the selected time';
      setFormError(
        `Time unavailable. ${conflictingBooking.title} is already booked on ${formatDisplayDate(selectedDate)} from ${conflictTime}. Choose a non-overlapping time.`,
      );
      return;
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
      status: 'Inquiry',
      notes: draftNotes.trim() || 'New booking created from quick add.',
    });

    if (!result) {
      setFormError('The booking could not be saved. Check the customer and booking details.');
      return;
    }

    setShowComposer(false);
    setActiveTimePicker(null);
    setDraftNotes('');
    setCustomerQuery('');
    setShowCustomerDropdown(false);
    setDraftPrice(String(selectedPackage.price));
    setFormError('');
    showSnackbar({
      message: `Booking saved · draft invoice ${getInvoiceNumber(result.invoice)} created`,
      tone: 'success',
    });
  };

  const flatListData: (Booking | { readonly id: 'empty-state'; readonly __empty: true })[] = selectedDayBookings.length > 0
    ? selectedDayBookings
    : [{ id: 'empty-state', __empty: true } as const];
  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';
  const accentSoft = isDarkMode ? '#29284B' : '#E9E8FF';

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
                <View style={[styles.headerIcon, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
                  <Ionicons name="calendar-outline" size={23} color={palette.accent} />
                </View>
                <View>
                  <Text style={[styles.eyebrow, { color: palette.accent }]}>Bookings</Text>
                  <Text style={[styles.title, { color: palette.text }]}>Calendar</Text>
                </View>
              </View>
              <Pressable style={[styles.primaryButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} onPress={openComposer}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Add</Text>
              </Pressable>
            </View>

            <View style={[styles.calendarCard, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
              <View style={styles.monthHeader}>
                <Pressable onPress={goToPreviousMonth} style={[styles.arrowButton, { backgroundColor: softInset, borderColor: softBorder }]}>
                  <Ionicons name="chevron-back" size={18} color={palette.text} />
                </Pressable>
                <Text style={[styles.monthLabel, { color: palette.text }]}>{monthLabel}</Text>
                <Pressable onPress={goToNextMonth} style={[styles.arrowButton, { backgroundColor: softInset, borderColor: softBorder }]}>
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
                    <Pressable
                      key={`${cell.dateKey}-cell`}
                      style={[
                        styles.dayCell,
                        cell.isCurrentMonth ? { backgroundColor: softSurface } : { backgroundColor: softInset, opacity: 0.52 },
                        isSelected && { backgroundColor: palette.accent, shadowColor: palette.accent, shadowOpacity: 0.22, elevation: 3 },
                        isToday && { borderWidth: 2, borderColor: isSelected ? '#FFFFFF' : palette.accent },
                      ]}
                      onPress={() => setSelectedDate(cell.dateKey)}>
                      <Text style={[styles.dayNumber, { color: isSelected ? '#FFFFFF' : palette.text }]}>
                        {cell.date.getDate()}
                      </Text>
                      {hasEvent && <View style={[styles.dot, { backgroundColor: isSelected ? '#FFFFFF' : palette.accent }]} />}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.eventsHeader}>
              <SectionHeader
                icon="calendar-outline"
                eyebrow="Schedule"
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
                <Text style={[styles.emptyText, { color: palette.muter }]}>No bookings scheduled for this date.</Text>
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
                  {item.startTime ?? item.time ?? 'Not specified'} – {item.endTime ?? 'Not specified'}
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
        contentContainerStyle={styles.listContent}
      />

      <Modal visible={showComposer} transparent animationType="slide" onRequestClose={() => setShowComposer(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <View style={[styles.modalHandle, { backgroundColor: palette.border }]} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalEyebrow, { color: palette.accent }]}>Create</Text>
                <Text style={[styles.modalTitle, { color: palette.text }]}>New booking</Text>
              </View>
              <Pressable onPress={() => setShowComposer(false)} style={[styles.closeButton, { backgroundColor: softInset }]}>
                <Ionicons name="close" size={24} color={palette.text} />
              </Pressable>
            </View>

            <ScrollView
              {...modalScrollProps}
              // The wheels own every vertical gesture while a picker is open, so the form behind
              // them cannot scroll out from under the finger.
              scrollEnabled={!isTimePickerOpen}
              contentContainerStyle={styles.modalScrollContent}>

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Package</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose a package"
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
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.packageDropdownScroll}>
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

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer source</Text>
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
                <Text style={[styles.modeButtonText, { color: customerMode === 'existing' ? palette.accent : palette.text }]}>Existing customer</Text>
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
                <Text style={[styles.modeButtonText, { color: customerMode === 'new' ? palette.accent : palette.text }]}>Add new customer</Text>
              </Pressable>
            </View>

            {customerMode === 'existing' ? (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer</Text>
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
                    placeholder="Search customer"
                    placeholderTextColor={palette.muter}
                    style={[styles.searchInput, { backgroundColor: softSurface, borderColor: softBorder, color: palette.text }]}
                  />

                  {/* The list scrolls itself. Without this the rows were laid out in a plain View
                      that the panel simply clipped, so every drag fell through to the form behind
                      it and moved the whole modal instead. Mirrors the package dropdown above. */}
                  <ScrollView
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
                      <Text style={[styles.emptySearchText, { color: palette.muter }]}>No matching customer</Text>
                    )}
                  </ScrollView>
                </Animated.View>
              </>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer name</Text>
                <TextInput
                  value={newCustomerName}
                  onChangeText={setNewCustomerName}
                  placeholder="Siti Nur Izzah"
                  placeholderTextColor={palette.muter}
                  style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer email</Text>
                <TextInput
                  value={newCustomerEmail}
                  onChangeText={setNewCustomerEmail}
                  placeholder="siti@example.my"
                  placeholderTextColor={palette.muter}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer phone</Text>
                <TextInput
                  value={newCustomerPhone}
                  onChangeText={setNewCustomerPhone}
                  placeholder="+60 12-345 6789"
                  placeholderTextColor={palette.muter}
                  keyboardType="phone-pad"
                  style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer location</Text>
                <TextInput
                  value={newCustomerLocation}
                  onChangeText={setNewCustomerLocation}
                  placeholder="Kuala Lumpur"
                  placeholderTextColor={palette.muter}
                  style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                />
              </>
            )}

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Price</Text>
            <TextInput
              value={draftPrice}
              onChangeText={setDraftPrice}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={palette.muter}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Event date</Text>
            <TextInput
              value={selectedDate}
              editable={false}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.muter, opacity: 0.8 }]}
            />

            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Start time</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Choose start time, currently ${formatTime(draftStartTime)}`}
                  onPress={() => toggleTimeMenu('start')}
                  style={[
                    styles.timeSelectButton,
                    { backgroundColor: softInset, borderColor: softBorder },
                    activeTimePicker === 'start' && { backgroundColor: accentSoft, borderColor: palette.accent },
                  ]}>
                  <Ionicons name="time-outline" size={18} color={palette.accent} />
                  <Text style={[styles.timeSelectText, { color: palette.text }]}>{formatTime(draftStartTime)}</Text>
                  <Ionicons name={activeTimePicker === 'start' ? 'chevron-up' : 'chevron-down'} size={16} color={palette.muter} />
                </Pressable>
              </View>
              <View style={styles.timeField}>
                <View style={[styles.timeFieldLabelRow, styles.timeLabelSpacing]}>
                  <Text style={[styles.fieldLabel, styles.timeFieldLabel, { color: palette.muter }]}>Finish time</Text>
                  {isEndTimeManual ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Use the package duration for the finish time"
                      accessibilityHint={
                        selectedPackage ? `Sets it from ${selectedPackage.duration}` : undefined
                      }
                      hitSlop={8}
                      onPress={resetEndTimeToPackage}
                      style={({ pressed }) => pressed && styles.autoTagPressed}>
                      <Text style={[styles.autoTag, { color: palette.accent }]}>Auto</Text>
                    </Pressable>
                  ) : packageDurationMinutes ? (
                    <Text style={[styles.autoTag, styles.autoTagIdle, { color: palette.muter }]}>
                      Auto
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Choose finish time, currently ${formatTime(draftEndTime)}`}
                  onPress={() => toggleTimeMenu('finish')}
                  style={[
                    styles.timeSelectButton,
                    { backgroundColor: softInset, borderColor: softBorder },
                    activeTimePicker === 'finish' && { backgroundColor: accentSoft, borderColor: palette.accent },
                  ]}>
                  <Ionicons name="time-outline" size={18} color={palette.accent} />
                  <Text style={[styles.timeSelectText, { color: palette.text }]}>{formatTime(draftEndTime)}</Text>
                  <Ionicons name={activeTimePicker === 'finish' ? 'chevron-up' : 'chevron-down'} size={16} color={palette.muter} />
                </Pressable>
              </View>
            </View>

            {activeTimePicker ? (
              // No responder handlers on this panel: claiming the gesture here takes it away from
              // the wheels' scroll views, which stops them scrolling. The parent ScrollView is
              // already disabled while a picker is open, so nothing behind it can move anyway.
              <View style={[styles.timeMenu, { backgroundColor: softInset, borderColor: softBorder }]}>
                <View style={styles.timeMenuHeader}>
                  <Text style={[styles.timeMenuTitle, { color: palette.text }]}>Choose {activeTimePicker === 'start' ? 'start' : 'finish'} time</Text>
                  <Text style={[styles.timeMenuValue, { color: palette.accent }]}>
                    {formatTime(activeTimePicker === 'start' ? draftStartTime : draftEndTime)}
                  </Text>
                </View>

                {(() => {
                  const currentParts = getTimeParts(activeTimePicker === 'start' ? draftStartTime : draftEndTime);
                  const hourIndex = hourOptions.indexOf(currentParts.hour);
                  const minuteIndex = minuteOptions.indexOf(currentParts.minute);
                  const periodIndex = periodOptions.indexOf(currentParts.period);
                  return (
                    <View style={styles.wheelRow}>
                      <View style={[styles.wheelHighlight, { top: WHEEL_PADDING, backgroundColor: accentSoft }]} pointerEvents="none" />
                      <View style={styles.wheelColumnHour}>
                        <WheelColumn
                          key={`hour-${activeTimePicker}`}
                          items={hourOptions.map(String)}
                          selectedIndex={hourIndex}
                          onSelect={(index) => updateTimePart('hour', hourOptions[index])}
                          textColor={palette.text}
                        />
                      </View>
                      <View style={styles.wheelColumnMinute}>
                        <WheelColumn
                          key={`minute-${activeTimePicker}`}
                          items={minuteOptions}
                          selectedIndex={minuteIndex}
                          onSelect={(index) => updateTimePart('minute', minuteOptions[index])}
                          textColor={palette.text}
                        />
                      </View>
                      <View style={styles.wheelColumnPeriod}>
                        <WheelColumn
                          key={`period-${activeTimePicker}`}
                          items={periodOptions as unknown as string[]}
                          selectedIndex={periodIndex}
                          onSelect={(index) => updateTimePart('period', periodOptions[index])}
                          textColor={palette.text}
                          align="flex-start"
                          itemPaddingLeft={16}
                        />
                      </View>
                    </View>
                  );
                })()}

                {draftEndTime <= draftStartTime ? (
                  <Text style={styles.timeRangeError}>Finish time must be later than start time.</Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: draftEndTime <= draftStartTime }}
                  disabled={draftEndTime <= draftStartTime}
                  onPress={() => setActiveTimePicker(null)}
                  style={[
                    styles.timeDoneButton,
                    { backgroundColor: palette.accent },
                    draftEndTime <= draftStartTime && styles.timeDoneButtonDisabled,
                  ]}>
                  <Text style={styles.timeDoneButtonText}>Done</Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Event location</Text>
            <TextInput
              value={draftLocation}
              onChangeText={setDraftLocation}
              placeholder="Venue or client location"
              placeholderTextColor={palette.muter}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Notes</Text>
            <TextInput
              value={draftNotes}
              onChangeText={setDraftNotes}
              placeholder="Wedding details or client notes"
              placeholderTextColor={palette.muter}
              multiline
              style={[styles.input, styles.notesInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />

            <View style={[styles.invoiceNotice, { backgroundColor: accentSoft, borderColor: palette.accent }]}>
              <Ionicons name="document-text-outline" size={18} color={palette.accent} />
              <Text style={[styles.invoiceNoticeText, { color: palette.text }]}>A draft invoice will be created automatically from this booking.</Text>
            </View>

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}

            <Pressable style={[styles.submitButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} onPress={handleAddBooking}>
              <Text style={styles.submitButtonText}>Save booking &amp; create invoice</Text>
            </Pressable>
            </ScrollView>
          </View>

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
