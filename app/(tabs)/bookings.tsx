import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Animated, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusPill } from '@/components/StatusPill';
import { Booking, getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
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
  const [draftLocation, setDraftLocation] = useState('');
  const [formError, setFormError] = useState('');
  const dropdownAnim = useRef(new Animated.Value(0)).current;

  const firstBookingDate = bookings[0]?.date ?? toIsoDate(new Date());
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

  const handleAddBooking = () => {
    const numericPrice = Number(draftPrice);
    const isNewCustomerValid = Boolean(newCustomerName.trim() && newCustomerEmail.trim());
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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <FlatList
        data={flatListData}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={(
          <>
            <View style={styles.headerRow}>
              <View>
                <Text style={[styles.eyebrow, { color: palette.accent }]}>Bookings</Text>
                <Text style={[styles.title, { color: palette.text }]}>Calendar</Text>
              </View>
              <Pressable style={styles.primaryButton} onPress={openComposer}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Add</Text>
              </Pressable>
            </View>

            <View style={[styles.calendarCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <View style={styles.monthHeader}>
                <Pressable onPress={goToPreviousMonth} style={[styles.arrowButton, { backgroundColor: palette.surfaceAlt }]}>
                  <Ionicons name="chevron-back" size={18} color={palette.text} />
                </Pressable>
                <Text style={[styles.monthLabel, { color: palette.text }]}>{monthLabel}</Text>
                <Pressable onPress={goToNextMonth} style={[styles.arrowButton, { backgroundColor: palette.surfaceAlt }]}>
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
                  const hasEvent = bookings.some((booking) => booking.date === cell.dateKey);

                  return (
                    <Pressable
                      key={`${cell.dateKey}-cell`}
                      style={[
                        styles.dayCell,
                        cell.isCurrentMonth ? { backgroundColor: palette.surface } : { backgroundColor: palette.surfaceAlt, opacity: 0.7 },
                        isSelected && { backgroundColor: palette.iconWrap },
                      ]}
                      onPress={() => setSelectedDate(cell.dateKey)}>
                      <Text style={[styles.dayNumber, { color: isSelected ? palette.accent : palette.text }]}>
                        {cell.date.getDate()}
                      </Text>
                      {hasEvent && <View style={[styles.dot, { backgroundColor: palette.accent }]} />}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Text style={[styles.eventsTitle, { color: palette.text, marginTop: 18 }]}>{formatDisplayDate(selectedDate)}</Text>
          </>
        )}
        renderItem={({ item }) => {
          if ('__empty' in item) {
            return (
              <View style={[styles.emptyState, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <Text style={[styles.emptyText, { color: palette.muter }]}>No bookings scheduled for this date.</Text>
              </View>
            );
          }

          const customer = customerMap.get(item.customerId);
          const invoice = invoices.find((candidate) => candidate.bookingId === item.id);
          const statusTone = getStatusTone(item.status);

          return (
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>{item.title}</Text>
                  <Text style={[styles.customer, { color: palette.muter }]}>{customer?.name ?? 'Unknown customer'}</Text>
                </View>
                <StatusPill label={item.status} tone={statusTone} />
              </View>

              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: palette.muter }]}>Date</Text>
                <Text style={[styles.metaValue, { color: palette.text }]}>{item.date}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: palette.muter }]}>Time</Text>
                <Text style={[styles.metaValue, { color: palette.text }]}>
                  {item.startTime ?? item.time ?? 'Not specified'} – {item.endTime ?? 'Not specified'}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: palette.muter }]}>Location</Text>
                <Text style={[styles.metaValue, { color: palette.text }]}>{item.location}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: palette.muter }]}>Package</Text>
                <Text style={[styles.metaValue, { color: palette.text }]}>{item.packageName}</Text>
              </View>
              <View style={[styles.footerRow, { borderTopColor: palette.border }]}>
                <Text style={[styles.amount, { color: palette.text }]}>{currencyFormatter.format(item.price)}</Text>
                <Text style={[styles.notes, { color: palette.muter }]}>{item.notes}</Text>
              </View>

              {invoice && (
                <Pressable style={[styles.invoiceButton, { backgroundColor: palette.accent }]} onPress={() => router.push('/(tabs)/invoices')}>
                  <Ionicons name="document-text-outline" size={16} color="#fff" />
                  <Text style={styles.invoiceButtonText}>View invoice · {invoice.status}</Text>
                </Pressable>
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
      />

      <Modal visible={showComposer} transparent animationType="slide" onRequestClose={() => setShowComposer(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>New booking</Text>
              <Pressable onPress={() => setShowComposer(false)}>
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
                { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
                showPackageDropdown && { borderColor: palette.accent, backgroundColor: palette.iconWrap },
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
              <View style={[styles.packageDropdownPanel, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.packageDropdownScroll}>
                  {packages.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => handlePackageSelection(item.id)}
                      style={[
                        styles.packageOption,
                        { backgroundColor: palette.surface, borderColor: palette.border },
                        selectedPackageId === item.id && { backgroundColor: palette.iconWrap, borderColor: palette.accent },
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
                  { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
                  customerMode === 'existing' && { backgroundColor: palette.iconWrap, borderColor: palette.accent },
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
                  { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
                  customerMode === 'new' && { backgroundColor: palette.iconWrap, borderColor: palette.accent },
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
                  style={[styles.dropdownButton, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }, showCustomerDropdown && { borderColor: palette.accent, backgroundColor: palette.iconWrap }]}>
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
                      backgroundColor: palette.surfaceAlt,
                      borderColor: palette.border,
                    },
                  ]}>
                  <TextInput
                    value={customerQuery}
                    onChangeText={setCustomerQuery}
                    placeholder="Search customer"
                    placeholderTextColor={palette.muter}
                    style={[styles.searchInput, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
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
                          style={[styles.selectOption, { backgroundColor: palette.surface, borderColor: palette.border }, selectedCustomerId === customer.id && { backgroundColor: palette.iconWrap, borderColor: palette.accent }]}>
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
                  placeholder="Jane Smith"
                  placeholderTextColor={palette.muter}
                  style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
                />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer email</Text>
                <TextInput
                  value={newCustomerEmail}
                  onChangeText={setNewCustomerEmail}
                  placeholder="jane@example.com"
                  placeholderTextColor={palette.muter}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
                />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer phone</Text>
                <TextInput
                  value={newCustomerPhone}
                  onChangeText={setNewCustomerPhone}
                  placeholder="+60 12-345 6789"
                  placeholderTextColor={palette.muter}
                  keyboardType="phone-pad"
                  style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
                />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer location</Text>
                <TextInput
                  value={newCustomerLocation}
                  onChangeText={setNewCustomerLocation}
                  placeholder="Kuala Lumpur"
                  placeholderTextColor={palette.muter}
                  style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
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
              style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Event date</Text>
            <TextInput
              value={selectedDate}
              editable={false}
              style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.muter, opacity: 0.8 }]}
            />

            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Start time</Text>
                <TextInput
                  value={draftStartTime}
                  onChangeText={setDraftStartTime}
                  placeholder="10:00"
                  placeholderTextColor={palette.muter}
                  style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
                />
              </View>
              <View style={styles.timeField}>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>Finish time</Text>
                <TextInput
                  value={draftEndTime}
                  onChangeText={setDraftEndTime}
                  placeholder="11:00"
                  placeholderTextColor={palette.muter}
                  style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
                />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Event location</Text>
            <TextInput
              value={draftLocation}
              onChangeText={setDraftLocation}
              placeholder="Venue or client location"
              placeholderTextColor={palette.muter}
              style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Notes</Text>
            <TextInput
              value={draftNotes}
              onChangeText={setDraftNotes}
              placeholder="Wedding details or client notes"
              placeholderTextColor={palette.muter}
              multiline
              style={[styles.input, styles.notesInput, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
            />

            <View style={[styles.invoiceNotice, { backgroundColor: palette.iconWrap, borderColor: palette.accent }]}>
              <Ionicons name="document-text-outline" size={18} color={palette.accent} />
              <Text style={[styles.invoiceNoticeText, { color: palette.text }]}>A draft invoice will be created automatically from this booking.</Text>
            </View>

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}

            <Pressable style={styles.submitButton} onPress={handleAddBooking}>
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
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 120,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 6,
  },
  calendarCard: {
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 6,
  },
  arrowButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekday: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    marginBottom: 8,
    position: 'relative',
  },
  dayCellCurrent: {
    backgroundColor: '#fff',
  },
  dayCellMuted: {
    backgroundColor: '#F9FAFB',
    opacity: 0.5,
  },
  dayCellSelected: {
    backgroundColor: '#EEF2FF',
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  dayNumberSelected: {
    color: '#312E81',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4F46E5',
    position: 'absolute',
    bottom: 8,
  },
  dotSelected: {
    backgroundColor: '#312E81',
  },
  eventsSection: {
    marginTop: 18,
    marginBottom: 24,
  },
  eventsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 90,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    paddingBottom: 80,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  customer: {
    fontSize: 13,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    marginLeft: 14,
  },
  footerRow: {
    marginTop: 12,
    borderTopColor: '#E5E7EB',
    borderTopWidth: 1,
    paddingTop: 12,
  },
  amount: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  notes: {
    fontSize: 12,
    lineHeight: 18,
  },
  invoiceButton: {
    marginTop: 14,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 6,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  modalScrollContent: {
    paddingBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  timeField: {
    flex: 1,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
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
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 12,
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
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    marginBottom: 12,
  },
  dropdownList: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    margin: 8,
    color: '#111827',
  },
  selectOption: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    minHeight: 80,
    textAlignVertical: 'top',
  },
  invoiceNotice: {
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
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
    borderRadius: 12,
    padding: 8,
    marginBottom: 8,
  },
  packageDropdownScroll: {
    maxHeight: 240,
  },
  packageOption: {
    borderWidth: 1,
    borderRadius: 12,
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
    marginTop: 16,
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
});
