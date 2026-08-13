import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
  return date.toISOString().split('T')[0];
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
  const { packages, bookings, customers, addBooking, setInvoiceDraft, currency } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const [showComposer, setShowComposer] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id ?? '');
  const [customerQuery, setCustomerQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState(packages[0]?.id ?? '');
  const [draftPrice, setDraftPrice] = useState(String(packages[0]?.price ?? 0));
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
    setCustomerQuery('');
    setShowCustomerDropdown(false);
    setSelectedPackageId(packages[0].id);
    setDraftPrice(String(packages[0].price));
    setDraftTitle('');
    setDraftNotes('');
    setShowComposer(true);
  };

  const handlePackageSelection = (packageId: string) => {
    const chosenPackage = packages.find((item) => item.id === packageId);
    setSelectedPackageId(packageId);
    setDraftPrice(String(chosenPackage?.price ?? 0));
  };

  const handleAddBooking = () => {
    const trimmedTitle = draftTitle.trim();
    const numericPrice = Number(draftPrice);

    if (!trimmedTitle || !selectedPackage || !selectedCustomerId || Number.isNaN(numericPrice) || numericPrice <= 0) {
      return;
    }

    addBooking({
      customerId: selectedCustomerId,
      title: trimmedTitle,
      date: selectedDate,
      location: 'Client location',
      packageName: selectedPackage.name,
      price: numericPrice,
      status: 'Inquiry',
      notes: draftNotes.trim() || 'New booking created from quick add.',
    });

    setShowComposer(false);
    setDraftTitle('');
    setDraftNotes('');
    setCustomerQuery('');
    setShowCustomerDropdown(false);
    setDraftPrice(String(selectedPackage.price));
  };

  const handleCreateInvoiceFromBooking = (booking: (typeof bookings)[number]) => {
    const dueDate = new Date(new Date(`${booking.date}T00:00:00`).getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    setInvoiceDraft({
      customerId: booking.customerId,
      amount: booking.price,
      dueDate,
      bookingId: booking.id,
      serviceName: booking.packageName,
      terms: packages.find((item) => item.name === booking.packageName)?.info,
    });

    router.push('/(tabs)/invoices');
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
                <Text style={[styles.metaLabel, { color: palette.muter }]}>Time</Text>
                <Text style={[styles.metaValue, { color: palette.text }]}>{item.date}</Text>
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

              <Pressable style={[styles.invoiceButton, { backgroundColor: palette.accent }]} onPress={() => handleCreateInvoiceFromBooking(item)}>
                <Text style={styles.invoiceButtonText}>Create invoice</Text>
              </Pressable>
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

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Booking title</Text>
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="Wedding coverage"
              placeholderTextColor={palette.muter}
              style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Customer</Text>
            <Pressable
              onPress={() => setShowCustomerDropdown((current) => !current)}
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

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Package</Text>
            <View style={styles.packagePickerWrap}>
              {packages.map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.packageOption, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }, selectedPackageId === item.id && { backgroundColor: palette.iconWrap, borderColor: palette.accent }]}
                  onPress={() => handlePackageSelection(item.id)}>
                  <Text style={[styles.packageOptionText, { color: palette.text }]}>{item.name}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Price</Text>
            <TextInput
              value={draftPrice}
              onChangeText={setDraftPrice}
              keyboardType="numeric"
              placeholder="0"
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

            <Pressable style={styles.submitButton} onPress={handleAddBooking}>
              <Text style={styles.submitButtonText}>Save booking</Text>
            </Pressable>
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
    alignItems: 'center',
  },
  invoiceButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
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
  packagePickerWrap: {
    gap: 8,
  },
  packageOption: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  packageOptionText: {
    fontSize: 14,
    fontWeight: '700',
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
