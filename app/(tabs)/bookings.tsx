import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Animated, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusPill } from '@/components/StatusPill';
import { Booking, getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hourOptions = Array.from({ length: 12 }, (_, index) => index + 1);
const periodOptions = ['AM', 'PM'] as const;
type TimePeriod = typeof periodOptions[number];

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

function getStatusTone(status: string) {
  if (status === 'Confirmed') return 'blue';
  if (status === 'Completed') return 'green';
  if (status === 'Inquiry') return 'amber';
  return 'red';
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;

  const hour = Number(match[1]);
  if (hour < 0 || hour > 23) return null;

  return `${String(hour).padStart(2, '0')}:${match[2]}`;
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
  const { isDarkMode } = useTheme();
  const { packages, bookings, customers, invoices, createBooking, currency } = useAppData();
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
  const [openTimeMenu, setOpenTimeMenu] = useState<'start' | 'finish' | null>(null);
  const [draftMinuteInput, setDraftMinuteInput] = useState('00');
  const [draftLocation, setDraftLocation] = useState('');
  const [formError, setFormError] = useState('');
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
    setDraftEndTime('11:00');
    setOpenTimeMenu(null);
    setDraftMinuteInput('00');
    setDraftLocation('');
    setDraftNotes('');
    setFormError('');
    setShowComposer(true);
  };

  const handlePackageSelection = (packageId: string) => {
    const chosenPackage = packages.find((item) => item.id === packageId);
    setSelectedPackageId(packageId);
    setDraftPrice(String(chosenPackage?.price ?? 0));
    setShowPackageDropdown(false);
  };

  const updateTimePart = (part: 'hour' | 'minute' | 'period', value: number | string) => {
    if (!openTimeMenu) return;

    const currentTime = openTimeMenu === 'start' ? draftStartTime : draftEndTime;
    const currentParts = getTimeParts(currentTime);
    const nextTime = to24HourTime(
      part === 'hour' ? Number(value) : currentParts.hour,
      part === 'minute' ? String(value) : currentParts.minute,
      part === 'period' ? value as TimePeriod : currentParts.period,
    );

    if (openTimeMenu === 'start') {
      setDraftStartTime(nextTime);
      if (draftEndTime <= nextTime) {
        setDraftEndTime(getSuggestedEndTime(nextTime));
      }
    } else {
      setDraftEndTime(nextTime);
    }
    setFormError('');
  };

  const toggleTimeMenu = (menu: 'start' | 'finish') => {
    if (openTimeMenu === menu) {
      setOpenTimeMenu(null);
      return;
    }

    const selectedTime = menu === 'start' ? draftStartTime : draftEndTime;
    setDraftMinuteInput(getTimeParts(selectedTime).minute);
    setOpenTimeMenu(menu);
    setShowCustomerDropdown(false);
    setShowPackageDropdown(false);
  };

  const handleAddBooking = () => {
    const numericPrice = Number(draftPrice);
    const isNewCustomerValid = Boolean(newCustomerName.trim());
    const hasValidCustomer = customerMode === 'existing' ? Boolean(selectedCustomerId) : isNewCustomerValid;
    const startTime = normalizeTime(draftStartTime);
    const endTime = normalizeTime(draftEndTime);
    const hasValidTimeRange = Boolean(startTime && endTime && endTime > startTime);

    if (!selectedPackage || !hasValidCustomer || Number.isNaN(numericPrice) || numericPrice <= 0 || !startTime || !endTime || !hasValidTimeRange) {
      setFormError('Choose a package and add valid customer, price, start time, and later finish time.');
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
    setOpenTimeMenu(null);
    setDraftNotes('');
    setCustomerQuery('');
    setShowCustomerDropdown(false);
    setDraftPrice(String(selectedPackage.price));
    setFormError('');
    Alert.alert('Booking saved', `Draft invoice ${result.invoice.id} was created automatically.`);
  };

  const flatListData: (Booking | { readonly id: 'empty-state'; readonly __empty: true })[] = selectedDayBookings.length > 0
    ? selectedDayBookings
    : [{ id: 'empty-state', __empty: true } as const];
  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';
  const accentSoft = isDarkMode ? '#29284B' : '#E9E8FF';
  const hasValidMinuteInput = /^\d{1,2}$/.test(draftMinuteInput) && Number(draftMinuteInput) <= 59;

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
                  <Ionicons name="calendar-clear-outline" size={23} color={palette.accent} />
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
              <View style={[styles.eventsIcon, { backgroundColor: accentSoft }]}>
                <Ionicons name="time-outline" size={18} color={palette.accent} />
              </View>
              <View style={styles.eventsHeaderCopy}>
                <Text style={[styles.eventsEyebrow, { color: palette.muter }]}>Schedule</Text>
                <Text style={[styles.eventsTitle, { color: palette.text }]}>{formatDisplayDate(selectedDate)}</Text>
              </View>
              <View style={[styles.eventCountPill, { backgroundColor: softInset }]}>
                <Text style={[styles.eventCountText, { color: palette.accent }]}>{selectedDayBookings.length}</Text>
              </View>
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
          const invoice = invoices.find((candidate) => candidate.bookingId === item.id);
          const statusTone = getStatusTone(item.status);

          return (
            <View style={[styles.card, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, shadowColor: palette.background }]}>
              <View style={[styles.cardAccent, { backgroundColor: palette.accent }]} />
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderCopy}>
                  <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.customer, { color: palette.muter }]} numberOfLines={1}>{customer?.name ?? 'Unknown customer'}</Text>
                </View>
                <StatusPill label={item.status} tone={statusTone} />
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
                {invoice && (
                  <Pressable style={[styles.invoiceButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} onPress={() => router.push('/(tabs)/invoices')}>
                    <Ionicons name="document-text-outline" size={15} color="#fff" />
                    <Text style={styles.invoiceButtonText}>Invoice · {invoice.status}</Text>
                  </Pressable>
                )}
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
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
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

                  <View style={styles.dropdownList}>
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
                  </View>
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
                    openTimeMenu === 'start' && { backgroundColor: accentSoft, borderColor: palette.accent },
                  ]}>
                  <Ionicons name="time-outline" size={18} color={palette.accent} />
                  <Text style={[styles.timeSelectText, { color: palette.text }]}>{formatTime(draftStartTime)}</Text>
                  <Ionicons name={openTimeMenu === 'start' ? 'chevron-up' : 'chevron-down'} size={16} color={palette.muter} />
                </Pressable>
              </View>
              <View style={styles.timeField}>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Finish time</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Choose finish time, currently ${formatTime(draftEndTime)}`}
                  onPress={() => toggleTimeMenu('finish')}
                  style={[
                    styles.timeSelectButton,
                    { backgroundColor: softInset, borderColor: softBorder },
                    openTimeMenu === 'finish' && { backgroundColor: accentSoft, borderColor: palette.accent },
                  ]}>
                  <Ionicons name="time-outline" size={18} color={palette.accent} />
                  <Text style={[styles.timeSelectText, { color: palette.text }]}>{formatTime(draftEndTime)}</Text>
                  <Ionicons name={openTimeMenu === 'finish' ? 'chevron-up' : 'chevron-down'} size={16} color={palette.muter} />
                </Pressable>
              </View>
            </View>

            {openTimeMenu ? (
              <View style={[styles.timeMenu, { backgroundColor: softInset, borderColor: softBorder }]}>
                <View style={styles.timeMenuHeader}>
                  <Text style={[styles.timeMenuTitle, { color: palette.text }]}>Choose {openTimeMenu === 'start' ? 'start' : 'finish'} time</Text>
                  <Text style={[styles.timeMenuValue, { color: palette.accent }]}>
                    {formatTime(openTimeMenu === 'start' ? draftStartTime : draftEndTime)}
                  </Text>
                </View>
                <Text style={[styles.timeGroupLabel, { color: palette.muter }]}>Hour</Text>
                <View style={styles.hourOptions}>
                  {hourOptions.map((hour) => {
                    const currentParts = getTimeParts(openTimeMenu === 'start' ? draftStartTime : draftEndTime);
                    const isSelected = currentParts.hour === hour;
                    return (
                      <Pressable
                        key={hour}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        onPress={() => updateTimePart('hour', hour)}
                        style={[
                          styles.hourOption,
                          { backgroundColor: softSurface, borderColor: softBorder },
                          isSelected && { backgroundColor: accentSoft, borderColor: palette.accent },
                        ]}>
                        <Text style={[styles.timeOptionText, { color: isSelected ? palette.accent : palette.text }]}>{hour}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.timeChoiceRow}>
                  <View style={styles.timeChoiceGroup}>
                    <Text style={[styles.timeGroupLabel, { color: palette.muter }]}>Minutes</Text>
                    <TextInput
                      accessibilityLabel="Enter minutes"
                      value={draftMinuteInput}
                      onChangeText={(value) => {
                        const digits = value.replace(/\D/g, '').slice(0, 2);
                        setDraftMinuteInput(digits);
                        if (digits && Number(digits) <= 59) {
                          updateTimePart('minute', digits.padStart(2, '0'));
                        }
                      }}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                      placeholder="00"
                      placeholderTextColor={palette.muter}
                      style={[styles.manualMinuteInput, { backgroundColor: softSurface, borderColor: hasValidMinuteInput ? softBorder : '#DC2626', color: palette.text }]}
                    />
                  </View>

                  <View style={styles.timeChoiceGroup}>
                    <Text style={[styles.timeGroupLabel, { color: palette.muter }]}>Period</Text>
                    <View style={styles.compactOptions}>
                      {periodOptions.map((period) => {
                        const isSelected = getTimeParts(openTimeMenu === 'start' ? draftStartTime : draftEndTime).period === period;
                        return (
                          <Pressable
                            key={period}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSelected }}
                            onPress={() => updateTimePart('period', period)}
                            style={[
                              styles.compactOption,
                              { backgroundColor: softSurface, borderColor: softBorder },
                              isSelected && { backgroundColor: accentSoft, borderColor: palette.accent },
                            ]}>
                            <Text style={[styles.timeOptionText, { color: isSelected ? palette.accent : palette.text }]}>{period}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                {!hasValidMinuteInput ? (
                  <Text style={styles.timeRangeError}>Enter minutes from 00 to 59.</Text>
                ) : draftEndTime <= draftStartTime ? (
                  <Text style={styles.timeRangeError}>Finish time must be later than start time.</Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !hasValidMinuteInput || draftEndTime <= draftStartTime }}
                  disabled={!hasValidMinuteInput || draftEndTime <= draftStartTime}
                  onPress={() => {
                    updateTimePart('minute', draftMinuteInput.padStart(2, '0'));
                    setOpenTimeMenu(null);
                  }}
                  style={[
                    styles.timeDoneButton,
                    { backgroundColor: palette.accent },
                    (!hasValidMinuteInput || draftEndTime <= draftStartTime) && styles.timeDoneButtonDisabled,
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
        </View>
      </Modal>
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
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  eventsIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  eventsHeaderCopy: {
    flex: 1,
  },
  eventsEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  eventsTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
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
  invoiceButton: {
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 3, height: 6 },
    elevation: 4,
  },
  invoiceButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    marginLeft: 5,
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
    borderRadius: 18,
    marginTop: 10,
    padding: 10,
  },
  timeMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 9,
  },
  timeMenuTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  timeMenuValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  timeGroupLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginBottom: 7,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  hourOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  hourOption: {
    width: '14.5%',
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeChoiceRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  timeChoiceGroup: {
    flex: 1,
  },
  compactOptions: {
    flexDirection: 'row',
    gap: 6,
  },
  manualMinuteInput: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  compactOption: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeOptionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  timeDoneButton: {
    minHeight: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  timeDoneButtonDisabled: {
    opacity: 0.42,
  },
  timeDoneButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  timeRangeError: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 10,
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
