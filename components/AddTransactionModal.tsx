import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SuccessFeedback } from '@/components/feedback/SuccessFeedback';
import { useConfirmedSave } from '@/components/feedback/useConfirmedSave';
import { DatePickerField } from '@/components/DatePickerField';
import { CurrencyAmountInput, PaymentModalShell, paymentModalStyles } from '@/components/PaymentModalShell';
import { useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { useTranslation } from '@/lib/use-translation';

type Props = {
  visible: boolean;
  /** Reuses the exact Expense form layout without opening a modal or saving anything. */
  onMeasure?: (event: LayoutChangeEvent) => void;
  onClose: () => void;
};

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Manual income / expense entry, sharing the payment modal shell so Finance reads as one family. */
export function AddTransactionModal({ visible, onClose, onMeasure }: Props) {
  const { isDarkMode } = useTheme();
  const { addFinanceEntry, currency } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const { t } = useTranslation();

  const [entryType, setEntryType] = useState<'income' | 'expense'>(onMeasure ? 'expense' : 'income');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayKey);
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [showIncomeSuccess, setShowIncomeSuccess] = useState(false);
  const incomeSuccessActive = useRef(false);
  const feedback = useConfirmedSave(visible);
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

  const handleAddEntry = () => feedback.run(() => {
    if (incomeSuccessActive.current) return false;
    const numericAmount = Number(amount);
    const trimmedCategory = category.trim();
    const trimmedDescription = description.trim();
    const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(`${date}T00:00:00`).getTime());

    if (!trimmedCategory || !trimmedDescription || Number.isNaN(numericAmount) || numericAmount <= 0 || !isValidDate) {
      setFormError('Enter a category, positive amount, valid date, and description.');
      return false;
    }

    addFinanceEntry({
      category: trimmedCategory,
      amount: numericAmount,
      date,
      description: trimmedDescription,
      type: entryType,
      sourceType: entryType === 'income' ? 'manual_income' : 'manual_expense',
    });
    if (entryType === 'income') {
      incomeSuccessActive.current = true;
      setShowIncomeSuccess(true);
      handleClose();
      // Close the form now; retain its modal host only for the shared success overlay.
      return false;
    }
    return true;
  });

  const isIncome = entryType === 'income';

  return (
    <PaymentModalShell
      visible={visible || showIncomeSuccess}
      onMeasure={onMeasure}
      eyebrow={t('transaction.eyebrow')}
      title={t('transaction.title')}
      description={t('transaction.description')}
      primaryLabel={feedback.saving ? t('payment.saving') : feedback.pending ? t('payment.retry') : isIncome ? t('transaction.saveIncome') : t('transaction.saveExpense')}
      primaryDisabled={feedback.saving || feedback.success || showIncomeSuccess}
      closeDisabled={feedback.saving || feedback.success || showIncomeSuccess}
      formDisabled={feedback.pending || showIncomeSuccess}
      saveError={feedback.error}
      feedbackActive={feedback.success || showIncomeSuccess}
      feedback={(
        <SuccessFeedback
          visible={showIncomeSuccess || (feedback.success && entryType === 'expense')}
          title={showIncomeSuccess ? t('transaction.income.added') : t('transaction.expense.added')}
          message={showIncomeSuccess ? t('transaction.income.body') : t('transaction.expense.body')}
          onComplete={showIncomeSuccess ? () => {
            incomeSuccessActive.current = false;
            setShowIncomeSuccess(false);
          } : handleClose}
        />
      )}
      onPrimary={handleAddEntry}
      onClose={handleClose}
      palette={palette}
      isDarkMode={isDarkMode}
      bodyRef={bodyRef}>
      <Text style={[paymentModalStyles.fieldLabel, styles.firstLabel, { color: palette.muter }]}>{t('transaction.type')}</Text>
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
          <Text style={[styles.typeButtonText, { color: isIncome ? palette.success : palette.text }]}>{t('transaction.income')}</Text>
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
          <Text style={[styles.typeButtonText, { color: !isIncome ? palette.danger : palette.text }]}>{t('transaction.expense')}</Text>
        </Pressable>
      </View>

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>{t('transaction.category')}</Text>
      <TextInput
        value={category}
        onChangeText={setCategory}
        placeholder={isIncome ? t('transaction.category.income') : t('transaction.category.expense')}
        placeholderTextColor={palette.muter}
        selectionColor={palette.accent}
        style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
      />

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>{t('transaction.amount')}</Text>
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

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>{t('transaction.description.label')}</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        onFocus={revealDescription}
        placeholder={t('transaction.description.placeholder')}
        placeholderTextColor={palette.muter}
        selectionColor={palette.accent}
        multiline
        style={[
          styles.input,
          styles.descriptionInput,
          { backgroundColor: softInset, borderColor: softBorder, color: palette.text },
        ]}
      />

      {formError ? <Text accessibilityRole="alert" style={[paymentModalStyles.error, { color: palette.danger }]}>{formError}</Text> : null}
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
