import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

export default function FinanceScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { financeEntries, addFinanceEntry, currency } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const [showComposer, setShowComposer] = useState(false);
  const [entryType, setEntryType] = useState<'income' | 'expense'>('income');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';
  const accentSoft = isDarkMode ? '#29284B' : '#E9E8FF';

  const totalIncome = financeEntries
    .filter((entry) => entry.type === 'income')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const totalExpenses = financeEntries
    .filter((entry) => entry.type === 'expense')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const resetComposer = () => {
    setEntryType('income');
    setCategory('');
    setAmount('');
    setDate(new Date().toISOString().slice(0, 10));
    setDescription('');
    setFormError('');
  };

  const closeComposer = () => {
    setShowComposer(false);
    resetComposer();
  };

  const handleAddEntry = () => {
    const numericAmount = Number(amount);
    const trimmedCategory = category.trim();
    const trimmedDescription = description.trim();
    const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(`${date}T00:00:00`).getTime());

    if (!trimmedCategory || !trimmedDescription || Number.isNaN(numericAmount) || numericAmount <= 0 || !isValidDate) {
      setFormError('Enter a category, positive amount, valid date, and description.');
      return;
    }

    addFinanceEntry({
      category: trimmedCategory,
      amount: numericAmount,
      date,
      description: trimmedDescription,
      type: entryType,
    });
    closeComposer();
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleGroup}>
          <View style={[styles.headerIcon, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <Ionicons name="wallet-outline" size={23} color={palette.accent} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>Finance</Text>
            <Text style={[styles.title, { color: palette.text }]}>Cash flow</Text>
          </View>
        </View>
        <Pressable
          style={[styles.primaryButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]}
          onPress={() => {
            resetComposer();
            setShowComposer(true);
          }}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <Pressable
          onPress={() => router.push('/income')}
          style={({ pressed }) => [
            styles.statCard,
            { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="View income breakdown">
          <View style={styles.statLabelRow}>
            <View style={[styles.statIcon, { backgroundColor: isDarkMode ? '#173A35' : '#DFF7EF' }]}>
              <Ionicons name="trending-up" size={18} color={palette.success} />
            </View>
            <Ionicons name="chevron-forward" size={15} color={palette.muter} />
          </View>
          <Text style={[styles.statLabel, { color: palette.muter }]}>Income</Text>
          <Text style={[styles.statValue, { color: palette.text }]}>{currencyFormatter.format(totalIncome)}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/expense')}
          style={({ pressed }) => [
            styles.statCard,
            { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow, marginRight: 0, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="View expense breakdown">
          <View style={styles.statLabelRow}>
            <View style={[styles.statIcon, { backgroundColor: isDarkMode ? '#422129' : '#FDE8EC' }]}>
              <Ionicons name="trending-down" size={18} color={palette.danger} />
            </View>
            <Ionicons name="chevron-forward" size={15} color={palette.muter} />
          </View>
          <Text style={[styles.statLabel, { color: palette.muter }]}>Expense</Text>
          <Text style={[styles.statValue, { color: palette.text }]}>{currencyFormatter.format(totalExpenses)}</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: accentSoft }]}>
          <Ionicons name="swap-vertical-outline" size={18} color={palette.accent} />
        </View>
        <View style={styles.sectionCopy}>
          <Text style={[styles.sectionEyebrow, { color: palette.muter }]}>Activity</Text>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Recent entries</Text>
        </View>
        <View style={[styles.entryCount, { backgroundColor: softInset }]}>
          <Text style={[styles.entryCountText, { color: palette.accent }]}>{financeEntries.length}</Text>
        </View>
      </View>
      <FlatList
        data={financeEntries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.entryCard, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <View style={[styles.entryAccent, { backgroundColor: item.type === 'income' ? palette.success : palette.danger }]} />
            <View style={styles.entryLeft}>
              <View style={[styles.iconBadge, { backgroundColor: item.type === 'income' ? (isDarkMode ? '#173A35' : '#DFF7EF') : (isDarkMode ? '#422129' : '#FDE8EC') }]}>
                <Ionicons name={item.type === 'income' ? 'trending-up' : 'trending-down'} size={17} color={item.type === 'income' ? palette.success : palette.danger} />
              </View>
              <View style={styles.entryCopy}>
                <Text style={[styles.entryCategory, { color: palette.text }]} numberOfLines={1}>{item.category}</Text>
                <Text style={[styles.entryDescription, { color: palette.muter }]} numberOfLines={3}>{item.description}</Text>
              </View>
            </View>
            <View style={styles.entryRight}>
              <Text style={[styles.amount, item.type === 'income' ? styles.positive : styles.negative]}>
                {item.type === 'income' ? '+' : '-'}
                {currencyFormatter.format(item.amount)}
              </Text>
              <Text style={[styles.date, { color: palette.muter }]}>{item.date}</Text>
            </View>
          </View>
        )}
      />

      <Modal visible={showComposer} transparent animationType="slide" onRequestClose={closeComposer}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <View style={[styles.modalHandle, { backgroundColor: palette.border }]} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalEyebrow, { color: palette.accent }]}>Manual entry</Text>
                <Text style={[styles.modalTitle, { color: palette.text }]}>Add transaction</Text>
              </View>
              <Pressable onPress={closeComposer} accessibilityLabel="Close transaction form" style={[styles.closeButton, { backgroundColor: softInset }]}>
                <Ionicons name="close" size={24} color={palette.text} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Transaction type</Text>
            <View style={styles.typeRow}>
              <Pressable
                onPress={() => {
                  setEntryType('income');
                  setFormError('');
                }}
                style={[
                  styles.typeButton,
                  { backgroundColor: softInset, borderColor: softBorder },
                  entryType === 'income' && { backgroundColor: isDarkMode ? '#173A35' : '#DFF7EF', borderColor: palette.success },
                ]}>
                <Ionicons name="trending-up" size={17} color={entryType === 'income' ? '#117A4C' : palette.muter} />
                <Text style={[styles.typeButtonText, { color: entryType === 'income' ? '#117A4C' : palette.text }]}>Income</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setEntryType('expense');
                  setFormError('');
                }}
                style={[
                  styles.typeButton,
                  { backgroundColor: softInset, borderColor: softBorder },
                  entryType === 'expense' && { backgroundColor: isDarkMode ? '#422129' : '#FDE8EC', borderColor: palette.danger },
                ]}>
                <Ionicons name="trending-down" size={17} color={entryType === 'expense' ? '#B42318' : palette.muter} />
                <Text style={[styles.typeButtonText, { color: entryType === 'expense' ? '#B42318' : palette.text }]}>Expense</Text>
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Category</Text>
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder={entryType === 'income' ? 'Client payment' : 'Equipment'}
              placeholderTextColor={palette.muter}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Amount</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={palette.muter}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Date</Text>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.muter}
              autoCapitalize="none"
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Add transaction details"
              placeholderTextColor={palette.muter}
              multiline
              style={[styles.input, styles.descriptionInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}

            <Pressable style={[styles.submitButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} onPress={handleAddEntry}>
              <Text style={styles.submitButtonText}>Save {entryType}</Text>
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
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    marginRight: 12,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 7, height: 9 },
    elevation: 5,
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  sectionCopy: {
    flex: 1,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  entryCount: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  entryCountText: {
    fontSize: 13,
    fontWeight: '800',
  },
  list: {
    paddingBottom: 116,
  },
  entryCard: {
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 5, height: 7 },
    elevation: 3,
  },
  entryAccent: {
    position: 'absolute',
    top: 17,
    left: 0,
    width: 4,
    height: 36,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  entryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  entryCopy: {
    flex: 1,
    minWidth: 0,
  },
  entryCategory: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 3,
  },
  entryDescription: {
    fontSize: 12,
    lineHeight: 16,
    height: 48,
  },
  entryRight: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  amount: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  positive: {
    color: '#117A4C',
  },
  negative: {
    color: '#B42318',
  },
  date: {
    fontSize: 12,
    color: '#6B7280',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
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
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 12,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 8,
  },
  descriptionInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  formError: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  submitButton: {
    borderRadius: 17,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 4, height: 7 },
    elevation: 5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
});
