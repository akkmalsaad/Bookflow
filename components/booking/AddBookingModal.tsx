import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SuccessFeedback } from '@/components/feedback/SuccessFeedback';
import { useConfirmedSave } from '@/components/feedback/useConfirmedSave';
import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { DatePickerField } from '@/components/DatePickerField';
import { KeyboardDoneButton } from '@/components/KeyboardDoneButton';
import { modalScrollProps } from '@/components/modal-keyboard';
import { useResponsive } from '@/lib/responsive';
import { useTranslation } from '@/lib/use-translation';
import { captureEvent } from '@/lib/analytics';
import { getServiceDepositDefault, resolveServiceDepositAmount } from '@/lib/service-defaults';
import { addMinutesToTime, findBookingTimeConflict, normalizeBookingTime, parsePackageDurationMinutes } from '@/lib/booking-conflicts';
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

type ActiveTimePicker = 'start' | 'finish' | null;

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


type Props = {
  selectedDate: string;
  onDateChange?: (date: string) => void;
  dueDate?: string;
  onDueDateChange?: (date: string) => void;
  initialCustomerId?: string;
  onClose: () => void;
  onSaveInvoice?: (input: BookingInvoiceInput) => { ok: true } | { ok: false; error: string };
};

export type BookingInvoiceInput = {
  customerId?: string;
  newCustomer?: { name: string; email: string; phone: string; location: string; notes: string };
  packageId: string;
  price: number;
  location: string;
  depositAmount?: number;
  notes: string;
  date: string;
  startTime: string;
  endTime: string;
};

export function AddBookingModal({ selectedDate, onDateChange, dueDate, onDueDateChange, initialCustomerId, onClose, onSaveInvoice }: Props) {
  const showComposer = true;
  const setShowComposer = (visible: boolean) => { if (!visible) onClose(); };
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { packages, bookings, customers, checkPlanLimit, createBooking, currency } = useAppData();
  const { t } = useTranslation();
  const palette = getThemePalette(isDarkMode);
  const { sheetStyle } = useResponsive();
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const dropdownAnim = useRef(new Animated.Value(0)).current;
  const feedback = useConfirmedSave(showComposer);
  const [draftNotes, setDraftNotes] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId ?? customers[0]?.id ?? '');
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>(initialCustomerId || customers.length ? 'existing' : 'new');
  const [customerQuery, setCustomerQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerLocation, setNewCustomerLocation] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState(packages[0]?.id ?? '');
  const [showPackageDropdown, setShowPackageDropdown] = useState(false);
  const [draftPrice, setDraftPrice] = useState(String(packages[0]?.price ?? 0));
  const [draftDeposit, setDraftDeposit] = useState(formatDepositDraft(resolveServiceDepositAmount(packages[0], packages[0]?.price ?? 0)));
  // Mirrors isEndTimeManual: once the deposit is typed by hand it stops tracking the service and
  // the price, until a different service is chosen.
  const [isDepositManual, setIsDepositManual] = useState(false);
  const [draftStartTime, setDraftStartTime] = useState('10:00');
  const [draftEndTime, setDraftEndTime] = useState((addMinutesToTime('10:00', parsePackageDurationMinutes(packages[0]?.duration) ?? 60)) ?? '11:00');
  // Once the finish time is dialled in by hand it stops following the package, until it is reset.
  const [isEndTimeManual, setIsEndTimeManual] = useState(false);
  const [activeTimePicker, setActiveTimePicker] = useState<ActiveTimePicker>(null);
  const isTimePickerOpen = activeTimePicker !== null;
  const [draftLocation, setDraftLocation] = useState('');
  const [formError, setFormError] = useState('');
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

  const selectedPackage = packages.find((item) => item.id === selectedPackageId) ?? packages[0];
  const packageDurationMinutes = parsePackageDurationMinutes(selectedPackage?.duration);

  /**
   * The finish time a package implies for a given start. Packages whose duration cannot be read
   * ("Half day") fall back to the previous +1 hour default rather than inventing a length.
   */
  const getPackageEndTime = (startTime: string, durationMinutes = packageDurationMinutes) =>
    (durationMinutes ? addMinutesToTime(startTime, durationMinutes) : null) ?? getSuggestedEndTime(startTime);

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
    if (!checkPlanLimit(onSaveInvoice ? 'invoices' : 'bookings').allowed) {
      setShowComposer(false);
      router.push({ pathname: '/paywall', params: { reason: onSaveInvoice ? 'invoices' : 'bookings', returnTo: onSaveInvoice ? '/invoices' : '/bookings' } });
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

    // Invoice submissions must use the invoice mutation, never createBooking.
    if (onSaveInvoice) {
      const result = onSaveInvoice({
        customerId: customerMode === 'existing' ? selectedCustomerId : undefined,
        newCustomer: customerMode === 'new' ? {
          name: newCustomerName, email: newCustomerEmail, phone: newCustomerPhone,
          location: newCustomerLocation, notes: 'Created from invoice form',
        } : undefined,
        packageId: selectedPackage.id,
        price: numericPrice,
        location: draftLocation.trim() || 'Client location',
        depositAmount: numericDeposit > 0 ? numericDeposit : undefined,
        notes: draftNotes.trim(),
        date: selectedDate,
        startTime,
        endTime,
      });
      if (!result.ok) setFormError(result.error);
      return result.ok;
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

  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';
  const accentSoft = isDarkMode ? '#29284B' : '#E9E8FF';
  const timePickerColors = { palette, softInset, softBorder, accentSoft };

  return (
      <Modal visible={showComposer} transparent animationType="slide" onRequestClose={() => { if (!feedback.saving && !feedback.success) setShowComposer(false); }}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, sheetStyle, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }, feedback.success && { display: 'none' }]}>
            <View style={[styles.modalHandle, { backgroundColor: palette.border }]} />
            <View accessibilityElementsHidden={feedback.success} importantForAccessibility={feedback.success ? 'no-hide-descendants' : 'auto'} style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalEyebrow, { color: palette.accent }]}>{t(onSaveInvoice ? 'invoices.create.eyebrow' : 'bookings.create.eyebrow')}</Text>
                <Text style={[styles.modalTitle, { color: palette.text }]}>{t(onSaveInvoice ? 'invoices.create.title' : 'bookings.create.title')}</Text>
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
            {onDateChange ? (
              <DatePickerField value={selectedDate} onChange={onDateChange} isDarkMode={isDarkMode} palette={palette} />
            ) : (
            <TextInput
              value={selectedDate}
              editable={false}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.muter, opacity: 0.8 }]}
            />
            )}

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

            {onDueDateChange ? (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('invoices.dueDate')}</Text>
                <TextInput
                  value={dueDate}
                  onChangeText={onDueDateChange}
                  style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={palette.muter}
                />
              </>
            ) : null}

            <View style={[styles.invoiceNotice, { backgroundColor: accentSoft, borderColor: palette.accent }]}>
              <Ionicons name="document-text-outline" size={18} color={palette.accent} />
              <Text style={[styles.invoiceNoticeText, { color: palette.text }]}>{t('bookings.invoiceNotice')}</Text>
            </View>

            </View>
            {formError || feedback.error ? <Text accessibilityRole="alert" style={styles.formError}>{feedback.error || formError}</Text> : null}

            <Pressable style={[styles.submitButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} disabled={feedback.saving || feedback.success} onPress={handleAddBooking}>
              <Text style={styles.submitButtonText}>{feedback.saving ? t('bookings.saving') : feedback.pending ? t('bookings.retry') : t(onSaveInvoice ? 'invoices.save' : 'bookings.save')}</Text>
            </Pressable>
            </ScrollView>
          </View>
          <SuccessFeedback visible={feedback.success} title={t(onSaveInvoice ? 'invoices.created.title' : 'bookings.created.title')} message={t(onSaveInvoice ? 'invoices.created.body' : 'bookings.created.body')} onComplete={completeBooking} />

          <KeyboardDoneButton />
        </View>
      </Modal>
  );
}

const styles = StyleSheet.create({
  depositHint: {
    fontSize: 11.5,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 6,
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
