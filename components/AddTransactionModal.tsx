import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DatePickerField } from '@/components/DatePickerField';
import { CurrencyAmountInput, PaymentModalShell, paymentModalStyles } from '@/components/PaymentModalShell';
import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { useSnackbar } from '@/context/snackbar-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Manual income / expense entry, sharing the payment modal shell so Finance reads as one family. */
export function AddTransactionModal({ visible, onClose }: Props) {
  const { isDarkMode } = useTheme();
  const { addFinanceEntry, currency } = useAppData();
  const { showSnackbar } = useSnackbar();
  const palette = getThemePalette(isDarkMode);

  const [entryType, setEntryType] = useState<'income' | 'expense'>('income');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayKey);
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const bodyRef = useRef<ScrollView>(null);

  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';

  useEffect(() => {
    if (!visible) return;

    setEntryType('income');
    setCategory('');
    setAmount('');
    setDate(todayKey());
    setDescription('');
    setFormError('');
  }, [visible]);

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  // The description sits last in the body, so scroll it clear of the keyboard once it focuses.
  const revealDescription = () => {
    setTimeout(() => {
      bodyRef.current?.scrollToEnd({ animated: true });
    }, 300);
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
      sourceType: entryType === 'income' ? 'manual_income' : 'manual_expense',
    });
    showSnackbar({
      message: `${entryType === 'income' ? 'Income' : 'Expense'} of ${getCurrencyFormatter(currency).format(numericAmount)} saved`,
      tone: 'success',
    });
    handleClose();
  };

  const isIncome = entryType === 'income';

  return (
    <PaymentModalShell
      visible={visible}
      eyebrow="Manual entry"
      title="Add transaction"
      description="Record income or expenses manually."
      primaryLabel={`Save ${entryType}`}
      onPrimary={handleAddEntry}
      onClose={handleClose}
      palette={palette}
      isDarkMode={isDarkMode}
      bodyRef={bodyRef}>
      <Text style={[paymentModalStyles.fieldLabel, styles.firstLabel, { color: palette.muter }]}>Transaction type</Text>
      <View style={styles.typeRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: isIncome }}
          onPress={() => {
            setEntryType('income');
            setFormError('');
          }}
          style={({ pressed }) => [
            styles.typeButton,
            { backgroundColor: softInset, borderColor: softBorder },
            isIncome && { backgroundColor: isDarkMode ? '#173A35' : '#DFF7EF', borderColor: palette.success },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="trending-up" size={17} color={isIncome ? palette.success : palette.muter} />
          <Text style={[styles.typeButtonText, { color: isIncome ? palette.success : palette.text }]}>Income</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: !isIncome }}
          onPress={() => {
            setEntryType('expense');
            setFormError('');
          }}
          style={({ pressed }) => [
            styles.typeButton,
            { backgroundColor: softInset, borderColor: softBorder },
            !isIncome && { backgroundColor: isDarkMode ? '#422129' : '#FDE8EC', borderColor: palette.danger },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="trending-down" size={17} color={!isIncome ? palette.danger : palette.muter} />
          <Text style={[styles.typeButtonText, { color: !isIncome ? palette.danger : palette.text }]}>Expense</Text>
        </Pressable>
      </View>

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>Category</Text>
      <TextInput
        value={category}
        onChangeText={setCategory}
        placeholder={isIncome ? 'Client payment' : 'Equipment'}
        placeholderTextColor={palette.muter}
        selectionColor={palette.accent}
        style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
      />

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>Amount</Text>
      <CurrencyAmountInput
        hideReturnKey
        currency={currency}
        isDarkMode={isDarkMode}
        onChangeText={setAmount}
        palette={palette}
        value={amount}
      />

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>Date</Text>
      <DatePickerField value={date} onChange={setDate} isDarkMode={isDarkMode} palette={palette} />

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>Description</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        onFocus={revealDescription}
        placeholder="Add transaction details"
        placeholderTextColor={palette.muter}
        selectionColor={palette.accent}
        multiline
        style={[
          styles.input,
          styles.descriptionInput,
          { backgroundColor: softInset, borderColor: softBorder, color: palette.text },
        ]}
      />

      {formError ? <Text style={[paymentModalStyles.error, { color: palette.danger }]}>{formError}</Text> : null}
    </PaymentModalShell>
  );
}

const styles = StyleSheet.create({
  firstLabel: {
    marginTop: 0,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 48,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 7,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  descriptionInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  pressed: {
    opacity: 0.78,
  },
});
