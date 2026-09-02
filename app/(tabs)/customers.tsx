import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/InitialsAvatar';
import { KeyboardDoneButton } from '@/components/KeyboardDoneButton';
import { modalScrollProps } from '@/components/modal-keyboard';
import { getCompactCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { useSnackbar } from '@/context/snackbar-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import {
  customerSortOptions,
  getCustomerMetrics,
  matchesCustomerSearch,
  sortCustomers,
  type CustomerSortKey,
} from '@/lib/customer-metrics';

export default function CustomersScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { customers, bookings, invoices, payments, addCustomer, currency } = useAppData();
  const { showSnackbar } = useSnackbar();
  const palette = getThemePalette(isDarkMode);
  const [showComposer, setShowComposer] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<CustomerSortKey>('recent');
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';
  const accentSoft = isDarkMode ? '#29284B' : '#E9E8FF';
  const compactCurrency = useMemo(() => getCompactCurrencyFormatter(currency), [currency]);

  const metricsById = useMemo(
    () =>
      new Map(
        customers.map((customer) => [customer.id, getCustomerMetrics(customer.id, bookings, invoices, payments)]),
      ),
    [bookings, customers, invoices, payments],
  );

  const visibleCustomers = useMemo(
    () => sortCustomers(customers.filter((customer) => matchesCustomerSearch(customer, searchTerm)), sortKey, metricsById),
    [customers, metricsById, searchTerm, sortKey],
  );

  const activeSortLabel = customerSortOptions.find((option) => option.key === sortKey)?.label ?? 'Recently added';

  const handleAddCustomer = () => {
    const savedCustomer = addCustomer({
      name,
      email,
      phone,
      location,
      notes,
    });

    // A name and an email are both required. Without this the form used to clear and close even
    // when nothing had been saved.
    if (!savedCustomer) {
      showSnackbar({ message: 'Enter a name and an email address to save this customer.', tone: 'danger' });
      return;
    }

    showSnackbar({ message: `${savedCustomer.name} added to customers`, tone: 'success' });

    setName('');
    setEmail('');
    setPhone('');
    setLocation('');
    setNotes('');
    setShowComposer(false);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleGroup}>
          <View style={[styles.headerIcon, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <Ionicons name="people-outline" size={23} color={palette.accent} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>Customers</Text>
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
              {customers.length} {customers.length === 1 ? 'client' : 'clients'}
            </Text>
          </View>
        </View>
        <Pressable style={[styles.primaryButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} onPress={() => setShowComposer(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={[styles.searchField, { backgroundColor: softInset, borderColor: softBorder }]}>
          <Ionicons name="search" size={17} color={palette.muter} />
          <TextInput
            value={searchTerm}
            onChangeText={setSearchTerm}
            style={[styles.searchInput, { color: palette.text }]}
            placeholder="Search customers"
            placeholderTextColor={palette.muter}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search customers by name, phone, or email"
          />
          {searchTerm.length > 0 && (
            <Pressable
              onPress={() => setSearchTerm('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={17} color={palette.muter} />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => setShowSortSheet(true)}
          accessibilityRole="button"
          accessibilityLabel={`Sort customers. Current sort: ${activeSortLabel}`}
          style={({ pressed }) => [
            styles.sortButton,
            { backgroundColor: softInset, borderColor: softBorder },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="swap-vertical" size={16} color={palette.accent} />
        </Pressable>
      </View>

      {sortKey !== 'recent' && (
        <Pressable
          onPress={() => setShowSortSheet(true)}
          accessibilityRole="button"
          accessibilityLabel={`Sorted by ${activeSortLabel}. Change sorting`}
          style={styles.sortHintRow}>
          <Text style={[styles.sortHint, { color: palette.muter }]}>Sorted by {activeSortLabel}</Text>
        </Pressable>
      )}

      <FlatList
        data={visibleCustomers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={(
          <View style={[styles.emptyState, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <Ionicons name={searchTerm ? 'search-outline' : 'people-outline'} size={22} color={palette.muter} />
            <Text style={[styles.emptyText, { color: palette.muter }]}>
              {searchTerm ? `No customers match “${searchTerm}”.` : 'No customers yet. Add your first client to get started.'}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const metrics = metricsById.get(item.id);
          const bookingCount = metrics?.bookingCount ?? 0;
          const secondaryLine = bookingCount
            ? `${bookingCount} ${bookingCount === 1 ? 'booking' : 'bookings'} · ${compactCurrency.format(metrics?.revenue ?? 0)}`
            : 'No bookings yet';

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.name}'s customer profile`}
              onPress={() => router.push(`/customer/${item.id}`)}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow },
                pressed && styles.cardPressed,
              ]}>
              <View style={styles.profileHeader}>
                <InitialsAvatar
                  name={item.name}
                  size={44}
                  backgroundColor={accentSoft}
                  color={palette.accent}
                  style={styles.avatar}
                />
                <View style={styles.profileCopy}>
                  <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.profileMeta, { color: palette.muter }]} numberOfLines={1}>{secondaryLine}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={palette.muter} />
              </View>
            </Pressable>
          );
        }}
      />

      <Modal visible={showSortSheet} transparent animationType="fade" onRequestClose={() => setShowSortSheet(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowSortSheet(false)}>
          <Pressable
            style={[styles.sortSheet, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}
            onPress={(event) => event.stopPropagation()}>
            <View style={[styles.modalHandle, { backgroundColor: palette.border }]} />
            <Text style={[styles.sortSheetTitle, { color: palette.muter }]}>Sort by</Text>
            {customerSortOptions.map((option) => {
              const isActive = option.key === sortKey;

              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => {
                    setSortKey(option.key);
                    setShowSortSheet(false);
                  }}
                  style={({ pressed }) => [
                    styles.sortOption,
                    isActive && { backgroundColor: accentSoft },
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.sortOptionText, { color: isActive ? palette.accent : palette.text }]}>{option.label}</Text>
                  {isActive && <Ionicons name="checkmark" size={17} color={palette.accent} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showComposer} transparent animationType="slide" onRequestClose={() => setShowComposer(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <View style={[styles.modalHandle, { backgroundColor: palette.border }]} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalEyebrow, { color: palette.accent }]}>Create</Text>
                <Text style={[styles.modalTitle, { color: palette.text }]}>Add customer</Text>
              </View>
              <Pressable onPress={() => setShowComposer(false)} style={[styles.closeButton, { backgroundColor: softInset }]}>
                <Ionicons name="close" size={24} color={palette.text} />
              </Pressable>
            </View>

            <ScrollView {...modalScrollProps} contentContainerStyle={styles.modalScrollContent}>
            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Name</Text>
            <TextInput value={name} onChangeText={setName} style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="Nur Aisyah Rahman" placeholderTextColor={palette.muter} />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Email</Text>
            <TextInput value={email} onChangeText={setEmail} style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="aisyah@example.my" keyboardType="email-address" placeholderTextColor={palette.muter} />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Phone</Text>
            <TextInput value={phone} onChangeText={setPhone} style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="+60 12-345 6789" placeholderTextColor={palette.muter} />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Location</Text>
            <TextInput value={location} onChangeText={setLocation} style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="Shah Alam, Selangor" placeholderTextColor={palette.muter} />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Notes</Text>
            <TextInput value={notes} onChangeText={setNotes} style={[styles.input, styles.notesInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="Wedding client, prefers WhatsApp updates" placeholderTextColor={palette.muter} multiline />

            <Pressable style={[styles.submitButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} onPress={handleAddCustomer}>
              <Text style={styles.submitButtonText}>Save customer</Text>
            </Pressable>
            </ScrollView>
          </View>

          <KeyboardDoneButton />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    padding: 0,
  },
  sortButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortHintRow: {
    marginBottom: 10,
  },
  sortHint: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  sortSheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 14,
  },
  sortSheetTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 4,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  sortOptionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 28,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 8, height: 10 },
    elevation: 5,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
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
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    textTransform: 'uppercase',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 5,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.45,
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
  list: {
    paddingBottom: 116,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 8, height: 10 },
    elevation: 5,
  },
  cardPressed: {
    opacity: 0.72,
  },
  pressed: {
    opacity: 0.72,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    marginRight: 13,
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 3,
  },
  profileMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    justifyContent: 'flex-end',
  },
  modalScrollContent: {
    paddingBottom: 4,
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
    marginBottom: 8,
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.65,
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    fontSize: 14,
  },
  notesInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  submitButton: {
    marginTop: 12,
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
  },
});
