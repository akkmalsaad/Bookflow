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
        <View>
          <Text style={[styles.eyebrow, { color: palette.accent }]}>Finance</Text>
          <Text style={[styles.title, { color: palette.text }]}>Cash flow</Text>
        </View>
        <Pressable
          style={styles.primaryButton}
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
            { backgroundColor: isDarkMode ? '#142B3E' : '#EAFBF2', opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="View income breakdown">
          <View style={styles.statLabelRow}>
            <Text style={[styles.statLabel, { color: isDarkMode ? '#B8D4FF' : '#4B5563' }]}>Income</Text>
            <Ionicons name="chevron-forward" size={14} color={isDarkMode ? '#B8D4FF' : '#4B5563'} />
          </View>
          <Text style={[styles.statValue, { color: isDarkMode ? '#E2E8F0' : '#111827' }]}>{currencyFormatter.format(totalIncome)}</Text>
        </Pressable>
        <View style={[styles.statCard, { backgroundColor: isDarkMode ? '#2B1A1A' : '#FDECEC', marginRight: 0 }]}>
          <Text style={[styles.statLabel, { color: isDarkMode ? '#FDB8A8' : '#4B5563' }]}>Expense</Text>
          <Text style={[styles.statValue, { color: isDarkMode ? '#F8FAFC' : '#111827' }]}>{currencyFormatter.format(totalExpenses)}</Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: palette.text }]}>Recent entries</Text>
      <FlatList
        data={financeEntries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.entryCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.entryLeft}>
              <View style={[styles.iconBadge, item.type === 'income' ? styles.greenBadge : styles.redBadge]}>
                <Ionicons name={item.type === 'income' ? 'trending-up' : 'trending-down'} size={16} color="#fff" />
              </View>
              <View>
                <Text style={[styles.entryCategory, { color: palette.text }]}>{item.category}</Text>
                <Text style={[styles.entryDescription, { color: palette.muter }]}>{item.description}</Text>
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
          <View style={[styles.modalCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalEyebrow, { color: palette.accent }]}>Manual entry</Text>
                <Text style={[styles.modalTitle, { color: palette.text }]}>Add transaction</Text>
              </View>
              <Pressable onPress={closeComposer} accessibilityLabel="Close transaction form">
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
                  { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
                  entryType === 'income' && styles.incomeTypeButton,
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
                  { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
                  entryType === 'expense' && styles.expenseTypeButton,
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
              style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Amount</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={palette.muter}
              style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Date</Text>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.muter}
              autoCapitalize="none"
              style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Add transaction details"
              placeholderTextColor={palette.muter}
              multiline
              style={[styles.input, styles.descriptionInput, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
            />

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}

            <Pressable style={styles.submitButton} onPress={handleAddEntry}>
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
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  eyebrow: {
    textTransform: 'uppercase',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    padding: 16,
    marginRight: 12,
  },
  greenCard: {
    backgroundColor: '#EAFBF2',
  },
  redCard: {
    backgroundColor: '#FDECEC',
    marginRight: 0,
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#4B5563',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  list: {
    paddingBottom: 100,
  },
  entryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#101828',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  entryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  greenBadge: {
    backgroundColor: '#1DAA72',
  },
  redBadge: {
    backgroundColor: '#E11D48',
  },
  entryCategory: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  entryDescription: {
    fontSize: 12,
  },
  entryRight: {
    alignItems: 'flex-end',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 21,
    fontWeight: '800',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 7,
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
    borderRadius: 12,
    paddingVertical: 11,
  },
  incomeTypeButton: {
    backgroundColor: '#EAFBF2',
    borderColor: '#1DAA72',
  },
  expenseTypeButton: {
    backgroundColor: '#FDECEC',
    borderColor: '#E11D48',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 13,
  },
  descriptionInput: {
    minHeight: 78,
    textAlignVertical: 'top',
  },
  formError: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  submitButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 2,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
});
