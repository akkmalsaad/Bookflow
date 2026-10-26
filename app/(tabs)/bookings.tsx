import { AddBookingModal, type BookingModalMode } from '@/components/booking/AddBookingModal';
import { BookingDetailsSheet } from '@/components/booking/BookingDetailsSheet';
import { BookingFormActionSheet } from '@/components/booking/BookingFormActionSheet';
import { SuccessFeedback } from '@/components/feedback/SuccessFeedback';
import { FilterTabs } from '@/components/TrendRangeTabs';
import { filterDeliveries, getDeliveryState, type DeliveryFilter } from '@/lib/booking-fulfilment';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { AppState, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
import { BookingCardStatusFooter } from '@/components/booking/BookingCardStatusFooter';
import { JobStatusSheet } from '@/components/booking/JobStatusSheet';
import {
  SETTINGS_ICON_BACKGROUND_COLOR,
  SETTINGS_ICON_STROKE_COLOR,
} from '@/components/settings/tokens';
import { useSnackbar } from '@/context/snackbar-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { recordDeliveredJob, requestReviewIfEligible } from '@/lib/app-store-review';
import type { BookingStatus } from '@/lib/booking-status';
import { getBookingInvoicePayment, hasLinkedInvoice } from '@/lib/job-financials';
import { usePressScale } from '@/components/use-press-scale';
import { useResponsive } from '@/lib/responsive';
import { useTranslation } from '@/lib/use-translation';
import { captureEvent } from '@/lib/analytics';
import { getCalendarPendingForms, getOfferTotals, offerRecordIds, type BookingOffer } from '@/lib/booking-offers';

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

/** The first day of the month a YYYY-MM-DD date falls in, in local time. */
function monthStartOf(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDisplayDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * A booking made from a submitted booking form starts its notes with a line the app writes
 * ("Submitted through the booking form on 2026-10-16. Terms t1-… accepted."). The card shows it
 * plainly — submission date and that the terms were accepted — while the stored note, with its
 * terms version, stays exactly as recorded.
 */
const SUBMISSION_NOTE = /^Submitted through the booking form on (\d{4}-\d{2}-\d{2})\. Terms \S* accepted\./;

function formatBookingNotes(notes: string, submittedLabel: (date: string) => string) {
  const match = SUBMISSION_NOTE.exec(notes);
  return match ? notes.replace(SUBMISSION_NOTE, submittedLabel(formatDisplayDate(match[1]))) : notes;
}

export default function BookingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ composeForCustomerId?: string; date?: string }>();
  const handledDeepLinkRef = useRef('');
  const { isDarkMode } = useTheme();
  const { packages, bookings, customers, invoices, trashedInvoices, payments, offers, updateBookingStatus, confirmWorkspaceSave, currency, refreshOffers, checkPlanLimit } = useAppData();
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
  // The booking whose job status change is waiting on the workspace save. The ref blocks a second
  // change before the state has re-rendered the pill as busy.
  const [savingStatusBookingId, setSavingStatusBookingId] = useState<string | null>(null);
  const savingStatusRef = useRef(false);
  // Booking details sheet. The id outlives `detailsVisible` so the sheet keeps its content while it
  // slides away; a follow-up (edit, duplicate, status) opens only once it has finished closing.
  const [detailsBookingId, setDetailsBookingId] = useState<string | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const afterDetailsClosed = useRef<(() => void) | null>(null);
  // "Status saved" is shown here, after the details sheet has finished closing, so the two never
  // overlap and the confirmation outlives the sheet.
  const [showStatusSaved, setShowStatusSaved] = useState(false);
  // Set when the save just confirmed was a Delivered status: once "Status saved" has gone, that is
  // the natural stopping point at which iOS may be asked for its App Store review prompt.
  const reviewAfterStatusSaved = useRef(false);
  const isFocusedRef = useRef(false);
  const overlayOpenRef = useRef(false);
  const [composerMode, setComposerMode] = useState<BookingModalMode>('create');
  const [composerSource, setComposerSource] = useState<Booking | undefined>();
  const [listMode, setListMode] = useState<'schedule' | 'deliveries'>('schedule');
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('open');

  const todayKey = toIsoDate(new Date());
  // The calendar opens on the device's current month, with today selected.
  const [viewDate, setViewDate] = useState(() => monthStartOf(todayKey));
  const [selectedDate, setSelectedDate] = useState(todayKey);

  const showDay = (dateKey: string) => {
    setViewDate(monthStartOf(dateKey));
    setSelectedDate(dateKey);
  };

  // Entering or returning to the tab always shows the current month. Only focus does this, so
  // re-renders, data refreshes and closing a sheet or modal leave the month where the owner put it.
  useFocusEffect(
    useCallback(() => {
      showDay(toIsoDate(new Date()));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Customer responses (submissions, change requests) live in their own table and otherwise arrive
  // only on launch or return to the foreground, so the booking-form cards check on every visit —
  // the same as Quotes & forms. Through a ref, so the check runs per focus, not per new function.
  const refreshOffersRef = useRef(refreshOffers);
  useEffect(() => {
    refreshOffersRef.current = refreshOffers;
  }, [refreshOffers]);
  useFocusEffect(
    useCallback(() => {
      refreshOffersRef.current().catch(() => {});
    }, []),
  );

  // A link may still ask for a specific day (?date=YYYY-MM-DD); that request wins over today.
  useEffect(() => {
    const requestedDate = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : '';
    if (!requestedDate) return;
    showDay(requestedDate);
    router.setParams({ date: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.date]);

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
  // Booking forms not yet turned into a booking, shown on their event date (display only). One whose
  // booking exists — active, or held by a deleted invoice — is left to that booking's own card.
  const pendingForms = useMemo(() => {
    const bookingIds = new Set(bookings.map((item) => item.id));
    for (const invoice of [...invoices, ...trashedInvoices]) {
      if (invoice.removedBooking?.id) bookingIds.add(invoice.removedBooking.id);
    }
    return getCalendarPendingForms(offers, bookingIds, Date.now());
  }, [bookings, invoices, offers, trashedInvoices]);
  const selectedDayForms = pendingForms.filter((offer) => offer.details.date === selectedDate);
  // The form's actions are read from the live list, so they always reflect its current status.
  const [formMenuId, setFormMenuId] = useState<string | null>(null);
  // "View request" on a card opens the form's change request directly rather than its actions.
  const [formMenuView, setFormMenuView] = useState<'actions' | 'request'>('actions');
  const formMenuOffer = formMenuId ? offers.find((item) => item.id === formMenuId) ?? null : null;

  // Read from a timer, so kept in refs rather than closed over.
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      return () => {
        isFocusedRef.current = false;
      };
    }, []),
  );
  useEffect(() => {
    overlayOpenRef.current = showComposer || detailsVisible || detailsBookingId !== null
      || statusBookingId !== null || formMenuId !== null || showStatusSaved;
  });

  /**
   * Asks iOS for its review prompt if the rules allow, but only with the calendar on screen and
   * nothing over it. Anything opened in the meantime wins — the request is simply skipped.
   */
  const requestReviewWhenSettled = () => {
    // Lets the confirmation finish fading so iOS never presents over a closing modal.
    setTimeout(() => {
      if (!isFocusedRef.current || overlayOpenRef.current || AppState.currentState !== 'active') return;
      void requestReviewIfEligible();
    }, 600);
  };
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(viewDate);

  // Moving month keeps the selected day (and its list) inside the month on screen: today in the
  // current month, otherwise the 1st.
  const goToMonth = (offset: number) => {
    const nextMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
    const today = toIsoDate(new Date());
    setViewDate(nextMonth);
    setSelectedDate(today.slice(0, 7) === toIsoDate(nextMonth).slice(0, 7) ? today : toIsoDate(nextMonth));
  };

  const goToPreviousMonth = () => goToMonth(-1);

  const goToNextMonth = () => goToMonth(1);

  const openComposer = () => {
    if (!packages.length) return;
    setComposerCustomerId(undefined);
    setComposerMode('create');
    setComposerSource(undefined);
    setShowComposer(true);
  };

  /** Closes the details sheet, then runs the follow-up once it has slid away. */
  const closeDetailsThen = (next: () => void) => {
    afterDetailsClosed.current = next;
    setDetailsVisible(false);
  };
  const openDetails = (bookingId: string) => {
    afterDetailsClosed.current = null;
    setDetailsBookingId(bookingId);
    setDetailsVisible(true);
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

  /**
   * Changes only the booking's own job status — no invoice, acceptance or payment is touched — and
   * counts it as done once the workspace save has landed. If the save fails, the previous status is
   * put back so the card matches what is stored, and the existing error is shown.
   */
  const handleStatusSelect = async (status: BookingStatus) => {
    const bookingId = statusBookingId;
    setStatusBookingId(null);
    if (!bookingId || savingStatusRef.current) return;

    const previous = bookings.find((item) => item.id === bookingId)?.status;
    const result = updateBookingStatus(bookingId, status);

    if (!result.ok) {
      showSnackbar({ message: result.error ?? t('bookings.error.status'), tone: 'danger' });
      return;
    }
    if (previous === status) return;

    savingStatusRef.current = true;
    setSavingStatusBookingId(bookingId);
    try {
      await confirmWorkspaceSave();
      captureEvent('booking_status_updated', { status });
    } catch {
      if (previous) updateBookingStatus(bookingId, previous);
      showSnackbar({ message: t('bookings.error.status'), tone: 'danger' });
    } finally {
      savingStatusRef.current = false;
      setSavingStatusBookingId(null);
    }
  };

  const deliveryBookings = useMemo(
    () => (listMode === 'deliveries' ? filterDeliveries(bookings, deliveryFilter, todayKey) : []),
    [bookings, deliveryFilter, listMode, todayKey],
  );
  type PendingFormItem = { readonly id: string; readonly __form: BookingOffer };
  const visibleBookings: (Booking | PendingFormItem)[] = listMode === 'deliveries'
    ? deliveryBookings
    : [...selectedDayBookings, ...selectedDayForms.map((offer) => ({ id: `form-${offer.id}`, __form: offer }))];
  const flatListData: (Booking | PendingFormItem | { readonly id: 'empty-state'; readonly __empty: true })[] = visibleBookings.length > 0
    ? visibleBookings
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
              <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('bk.offers')}
                hitSlop={6}
                onPress={() => router.push('/offers')}
                style={({ pressed }) => [styles.arrowButton, styles.offersButton, { backgroundColor: softInset, borderColor: softBorder }, pressed && { opacity: 0.7 }]}>
                <Ionicons name="pricetags-outline" size={18} color={palette.text} />
              </Pressable>
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
                  const hasEvent = bookings.some((booking) => booking.date === cell.dateKey)
                    || pendingForms.some((offer) => offer.details.date === cell.dateKey);

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
                      // A day from the neighbouring month brings that month on screen with it.
                      onPress={() => (cell.isCurrentMonth ? setSelectedDate(cell.dateKey) : showDay(cell.dateKey))}>
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
              <FilterTabs
                value={listMode}
                onChange={setListMode}
                options={[
                  { key: 'schedule', label: t('bk.view.schedule') },
                  { key: 'deliveries', label: t('bk.view.deliveries') },
                ]}
                color={palette.accent}
                isDarkMode={isDarkMode}
              />
              {listMode === 'deliveries' ? (
                <FilterTabs
                  value={deliveryFilter}
                  onChange={setDeliveryFilter}
                  options={[
                    { key: 'open', label: t('bk.deliveries.open') },
                    { key: 'overdue', label: t('bk.deliveries.overdue') },
                    { key: 'delivered', label: t('bk.deliveries.delivered') },
                  ]}
                  color={palette.accent}
                  isDarkMode={isDarkMode}
                />
              ) : (
              <SectionHeader
                icon="calendar-outline"
                eyebrow={t('bookings.scheduleEyebrow')}
                title={formatDisplayDate(selectedDate)}
                rightElement={
                  <View style={[styles.eventCountPill, { backgroundColor: softInset }]}>
                    <Text style={[styles.eventCountText, { color: palette.accent }]}>{selectedDayBookings.length + selectedDayForms.length}</Text>
                  </View>
                }
              />
              )}
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
                <Text style={[styles.emptyText, { color: palette.muter }]}>{listMode === 'deliveries' ? t('bk.deliveries.empty') : t('bookings.emptyDate')}</Text>
              </View>
            );
          }

          if ('__form' in item) {
            // A booking form not yet a booking: the same card, built from the form's saved details.
            const form = item.__form;
            const formCustomer = form.customerId ? customerMap.get(form.customerId) : undefined;
            const received = form.status === 'submitted';
            const changeRequested = form.status === 'change_requested';
            const formStatusLabel = changeRequested ? t('of.status.change_requested') : t(received ? 'bk.form.received' : 'bk.form.awaiting');
            // The same linked id the calendar uses to hide a form once its booking exists.
            const formBookingId = form.bookingId ?? offerRecordIds(form.id).bookingId;
            // A form still waiting for the client that the Free allowance would refuse right now —
            // the booking, invoice and (for a client not yet on file) customer limits the server
            // applies at submission. checkPlanLimit allows everything on Pro.
            const limitBlocked = (form.status === 'sent' || changeRequested) && (
              !checkPlanLimit('bookings').allowed
              || !checkPlanLimit('invoices').allowed
              || (!form.customerId && !checkPlanLimit('customers').allowed)
            );
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${form.details.title}, ${formStatusLabel}`}
                onPress={() => {
                  setFormMenuView('actions');
                  setFormMenuId(form.id);
                }}
                style={({ pressed }) => [styles.card, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, shadowColor: palette.background }, pressed && { opacity: 0.92 }]}>
                <View style={[styles.cardAccent, { backgroundColor: palette.accent }]} />
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderCopy}>
                    <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={1}>{form.details.title}</Text>
                    <Text style={[styles.customer, { color: palette.muter }]} numberOfLines={1}>
                      {formCustomer?.name ?? form.response?.name ?? t('bk.form.customerPending')}
                    </Text>
                  </View>
                </View>

                <View style={styles.scheduleMetaRow}>
                  <Ionicons name="calendar-outline" size={16} color={palette.muter} />
                  <Text style={[styles.scheduleMetaValue, { color: palette.text }]}>{formatDisplayDate(form.details.date)}</Text>
                </View>
                <View style={styles.scheduleMetaRow}>
                  <Ionicons name="time-outline" size={16} color={palette.muter} />
                  <Text style={[styles.scheduleMetaValue, { color: palette.text }]}>
                    {form.details.startTime || t('bookings.notSpecified')} – {form.details.endTime || t('bookings.notSpecified')}
                  </Text>
                </View>
                {form.details.location?.trim() ? (
                  <View style={styles.scheduleMetaRow}>
                    <Ionicons name="location-outline" size={16} color={palette.muter} />
                    <Text style={[styles.scheduleMetaValue, { color: palette.text }]} numberOfLines={2}>{form.details.location}</Text>
                  </View>
                ) : null}
                <View style={styles.scheduleMetaRow}>
                  <Ionicons name="cube-outline" size={16} color={palette.muter} />
                  <Text style={[styles.scheduleMetaValue, { color: palette.text }]} numberOfLines={1}>{form.details.packageName}</Text>
                </View>

                {/* Payment reads the invoice the form's own linked booking id would carry. Normally
                    there is none until conversion, so it says "No invoice yet"; nothing is created. */}
                <BookingCardStatusFooter
                  variant="form"
                  bookingTotal={getOfferTotals(form.details).totalCents / 100}
                  formStatus={{ label: formStatusLabel, tone: received || changeRequested ? 'attention' : 'awaiting' }}
                  payment={getBookingInvoicePayment(formBookingId, invoices, payments)}
                  hasLinkedInvoice={hasLinkedInvoice(formBookingId, invoices)}
                  formatAmount={(amount) => currencyFormatter.format(amount)}
                  colors={{ text: palette.text, muted: palette.muter, divider: palette.border }}
                />
                {limitBlocked ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('bk.form.limitBlocked')}
                    onPress={() => router.push('/paywall')}
                    style={({ pressed }) => [styles.formRequestButton, styles.formLimitNotice, { borderColor: palette.accent }, pressed && { opacity: 0.8 }]}>
                    <Text style={[styles.formLimitText, { color: palette.accent }]}>{t('bk.form.limitBlocked')}</Text>
                  </Pressable>
                ) : null}
                {changeRequested ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('of.request.view')}, ${form.details.title}`}
                    onPress={() => {
                      setFormMenuView('request');
                      setFormMenuId(form.id);
                    }}
                    style={({ pressed }) => [styles.formRequestButton, { borderColor: palette.accent }, pressed && { opacity: 0.8 }]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={17} color={palette.accent} />
                    <Text style={[styles.formRequestText, { color: palette.accent }]}>{t('of.request.view')}</Text>
                  </Pressable>
                ) : null}
              </Pressable>
            );
          }

          const customer = customerMap.get(item.customerId);
          const deliveryState = getDeliveryState(item, todayKey);

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${t('bk.viewDetails')}`}
              onPress={() => openDetails(item.id)}
              style={({ pressed }) => [styles.card, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, shadowColor: palette.background }, pressed && { opacity: 0.92 }]}>
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

              {item.fulfilment && deliveryState !== 'none' ? (
                <View style={styles.scheduleMetaRow}>
                  <Ionicons name="images-outline" size={16} color={deliveryState === 'overdue' ? palette.danger : palette.muter} />
                  <Text style={[styles.scheduleMetaValue, { color: deliveryState === 'overdue' ? palette.danger : palette.text }]} numberOfLines={1}>
                    {t(`bd.status.${item.fulfilment.status}`)}
                    {item.fulfilment.promisedDate && item.fulfilment.status !== 'delivered' ? ` · ${t('bd.delivery.promised')} ${formatDisplayDate(item.fulfilment.promisedDate)}` : ''}
                    {deliveryState === 'overdue' ? ` · ${t('bd.delivery.overdue')}` : ''}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.scheduleNotes, { backgroundColor: softSurface }]}>
                <Ionicons name="document-text-outline" size={15} color={palette.muter} />
                <Text style={[styles.notes, { color: palette.muter }]} numberOfLines={2}>{formatBookingNotes(item.notes, (date) => t('bookings.note.submitted', { date }))}</Text>
              </View>

              <BookingCardStatusFooter
                variant="booking"
                payment={getBookingInvoicePayment(item.id, invoices, payments)}
                hasLinkedInvoice={hasLinkedInvoice(item.id, invoices)}
                jobStatus={item.status}
                formatAmount={(amount) => currencyFormatter.format(amount)}
                onChangeJobStatus={() => setStatusBookingId(item.id)}
                isSavingJobStatus={savingStatusBookingId === item.id}
                jobStatusDisabled={statusBookingId !== null || savingStatusBookingId !== null}
                colors={{ text: palette.text, muted: palette.muter, divider: palette.border }}
              />
            </Pressable>
          );
        }}
        contentContainerStyle={[styles.listContent, readingStyle]}
      />

      {showComposer ? (
        <AddBookingModal
          selectedDate={composerMode === 'duplicate' ? selectedDate : composerSource?.date ?? selectedDate}
          initialCustomerId={composerCustomerId}
          mode={composerMode}
          sourceBooking={composerSource}
          onClose={() => setShowComposer(false)}
        />
      ) : null}

      <BookingFormActionSheet
        offer={formMenuOffer}
        view={formMenuView}
        onClose={() => {
          setFormMenuId(null);
          setFormMenuView('actions');
        }}
      />

      <BookingDetailsSheet
        bookingId={detailsBookingId}
        visible={detailsVisible}
        onClose={() => closeDetailsThen(() => {})}
        onClosed={() => {
          const next = afterDetailsClosed.current;
          afterDetailsClosed.current = null;
          setDetailsBookingId(null);
          next?.();
        }}
        onChangeStatus={(booking) => closeDetailsThen(() => {
          if (!savingStatusRef.current) setStatusBookingId(booking.id);
        })}
        onStatusSaved={(saved) => {
          if (saved.status === 'delivered') {
            recordDeliveredJob(saved.bookingId);
            reviewAfterStatusSaved.current = true;
          }
          closeDetailsThen(() => setShowStatusSaved(true));
        }}
      />

      {/* The same presentation the Invoices screen uses for a confirmation outside any form. */}
      <Modal visible={showStatusSaved} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.successBackdrop}>
          <SuccessFeedback
            visible={showStatusSaved}
            title={t('bd.delivery.saved')}
            onComplete={() => {
              setShowStatusSaved(false);
              if (!reviewAfterStatusSaved.current) return;
              reviewAfterStatusSaved.current = false;
              requestReviewWhenSettled();
            }}
          />
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
  successBackdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    flex: 1,
  },
  formRequestButton: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  formRequestText: {
    fontSize: 14,
    fontWeight: '800',
  },
  // The request button's shape, with room for a sentence that wraps.
  // The request button's outline, kept compact and secondary to the booking details above it. The
  // 44pt minimum stays, so it remains a comfortable tap target.
  formLimitNotice: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  formLimitText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
    textAlign: 'left',
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  offersButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
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
