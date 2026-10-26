import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  const { addFinanceEntry, currency, bookings, customers } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const { t } = useTranslation();

  const [entryType, setEntryType] = useState<'income' | 'expense'>(onMeasure ? 'expense' : 'income');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayKey);
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  // One message per field, shown under that field.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'category' | 'amount' | 'date' | 'description', string>>>({});
  const clearFieldError = (field: 'category' | 'amount' | 'date' | 'description') =>
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  // Optional: links an expense to one job so its job money can show it. The entry itself is the
  // same single Finance record either way, so it is never counted twice.
  const [linkedBookingId, setLinkedBookingId] = useState('');
  const [showBookingPicker, setShowBookingPicker] = useState(false);
  const [bookingQuery, setBookingQuery] = useState('');
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
    setFieldErrors({});
    setLinkedBookingId('');
    setShowBookingPicker(false);
    setBookingQuery('');
  }, [visible]);

  const linkedBooking = bookings.find((booking) => booking.id === linkedBookingId) ?? null;
  const bookingOptions = useMemo(() => {
    const query = bookingQuery.trim().toLowerCase();
    const customerNames = new Map(customers.map((customer) => [customer.id, customer.name]));
    return [...bookings]
      .sort((first, second) => second.date.localeCompare(first.date))
      .filter((booking) => {
        if (!query) return true;
        return [booking.title, booking.date, customerNames.get(booking.customerId) ?? ''].some((value) => value.toLowerCase().includes(query));
      })
      .slice(0, 40)
      .map((booking) => ({ booking, customerName: customerNames.get(booking.customerId) ?? '' }));
  }, [bookingQuery, bookings, customers]);

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

    // A description is optional on an expense; income keeps requiring one, as it always has.
    const errors: Partial<Record<'category' | 'amount' | 'date' | 'description', string>> = {
      ...(!trimmedCategory ? { category: t('tx.error.category') } : {}),
      ...(Number.isNaN(numericAmount) || numericAmount <= 0 ? { amount: t('tx.error.amount') } : {}),
      ...(!isValidDate ? { date: t('tx.error.date') } : {}),
      ...(entryType === 'income' && !trimmedDescription ? { description: t('tx.error.description') } : {}),
    };
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setFormError('');
      return false;
    }
    setFormError('');

    addFinanceEntry({
      category: trimmedCategory,
      amount: numericAmount,
      date,
      description: trimmedDescription,
      type: entryType,
      sourceType: entryType === 'income' ? 'manual_income' : 'manual_expense',
      ...(entryType === 'expense' && linkedBooking ? { bookingId: linkedBooking.id, customerId: linkedBooking.customerId } : {}),
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
            setFieldErrors({});
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
            setFieldErrors({});
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
        onChangeText={(value) => { setCategory(value); clearFieldError('category'); }}
        placeholder={isIncome ? t('transaction.category.income') : t('transaction.category.expense')}
        placeholderTextColor={palette.muter}
        selectionColor={palette.accent}
        accessibilityLabel={t('transaction.category')}
        style={[styles.input, { backgroundColor: softInset, borderColor: fieldErrors.category ? palette.danger : softBorder, color: palette.text }]}
      />
      {fieldErrors.category ? <Text accessibilityRole="alert" style={[paymentModalStyles.error, { color: palette.danger }]}>{fieldErrors.category}</Text> : null}

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>{t('transaction.amount')}</Text>
      <CurrencyAmountInput
        hideReturnKey
        currency={currency}
        isDarkMode={isDarkMode}
        onChangeText={(value) => { setAmount(value); clearFieldError('amount'); }}
        palette={palette}
        value={amount}
      />
      {fieldErrors.amount ? <Text accessibilityRole="alert" style={[paymentModalStyles.error, { color: palette.danger }]}>{fieldErrors.amount}</Text> : null}

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>Date</Text>
      <DatePickerField value={date} onChange={(value) => { setDate(value); clearFieldError('date'); }} isDarkMode={isDarkMode} palette={palette} />
      {fieldErrors.date ? <Text accessibilityRole="alert" style={[paymentModalStyles.error, { color: palette.danger }]}>{fieldErrors.date}</Text> : null}

      <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>{isIncome ? t('transaction.description.label') : t('tx.description.optional')}</Text>
      <TextInput
        value={description}
        onChangeText={(value) => { setDescription(value); clearFieldError('description'); }}
        onFocus={revealDescription}
        placeholder={t('transaction.description.placeholder')}
        placeholderTextColor={palette.muter}
        selectionColor={palette.accent}
        multiline
        style={[
          styles.input,
          styles.descriptionInput,
          { backgroundColor: softInset, borderColor: fieldErrors.description ? palette.danger : softBorder, color: palette.text },
        ]}
      />
      {fieldErrors.description ? <Text accessibilityRole="alert" style={[paymentModalStyles.error, { color: palette.danger }]}>{fieldErrors.description}</Text> : null}

      {!isIncome && bookings.length ? (
        <>
          <Text style={[paymentModalStyles.fieldLabel, { color: palette.muter }]}>{t('tx.booking')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showBookingPicker }}
            accessibilityLabel={t('tx.booking')}
            onPress={() => setShowBookingPicker((current) => !current)}
            style={[styles.input, styles.pickerButton, { backgroundColor: softInset, borderColor: showBookingPicker ? palette.accent : softBorder }]}>
            <Text style={[styles.pickerText, { color: linkedBooking ? palette.text : palette.muter }]} numberOfLines={1}>
              {linkedBooking ? `${linkedBooking.title} · ${linkedBooking.date}` : t('tx.booking.none')}
            </Text>
            <Ionicons name={showBookingPicker ? 'chevron-up' : 'chevron-down'} size={17} color={palette.text} />
          </Pressable>
          {showBookingPicker ? (
            <View style={[styles.pickerPanel, { backgroundColor: softInset, borderColor: softBorder }]}>
              <TextInput
                value={bookingQuery}
                onChangeText={setBookingQuery}
                placeholder={t('tx.booking.search')}
                placeholderTextColor={palette.muter}
                selectionColor={palette.accent}
                style={[styles.input, styles.pickerSearch, { borderColor: softBorder, color: palette.text }]}
              />
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.pickerList}>
                <Pressable accessibilityRole="button" onPress={() => { setLinkedBookingId(''); setShowBookingPicker(false); }} style={styles.pickerOption}>
                  <Text style={[styles.pickerOptionText, { color: palette.muter }]}>{t('tx.booking.none')}</Text>
                </Pressable>
                {bookingOptions.map(({ booking, customerName }) => (
                  <Pressable
                    key={booking.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: booking.id === linkedBookingId }}
                    onPress={() => { setLinkedBookingId(booking.id); setShowBookingPicker(false); setBookingQuery(''); }}
                    style={[styles.pickerOption, booking.id === linkedBookingId && { backgroundColor: isDarkMode ? '#29284B' : '#E9E8FF' }]}>
                    <Text style={[styles.pickerOptionText, { color: palette.text }]} numberOfLines={1}>{booking.title}</Text>
                    <Text style={[styles.pickerOptionMeta, { color: palette.muter }]} numberOfLines={1}>{[booking.date, customerName].filter(Boolean).join(' · ')}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <Text style={[styles.pickerHint, { color: palette.muter }]}>{t('tx.booking.hint')}</Text>
        </>
      ) : null}

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
  pickerButton: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  pickerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  pickerPanel: {
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
    padding: 8,
  },
  pickerSearch: {
    paddingVertical: 10,
  },
  pickerList: {
    maxHeight: 220,
    marginTop: 6,
  },
  pickerOption: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  pickerOptionText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  pickerOptionMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  pickerHint: {
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 6,
  },
});
