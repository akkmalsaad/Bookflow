import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { modalScrollProps } from '@/components/modal-keyboard';
import { getSoftTokens } from '@/components/settings/tokens';
import type { InvoiceSettings } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import {
  formatPaymentTerms,
  generateInvoiceNumber,
  MAX_PAYMENT_INSTRUCTIONS,
  MAX_PAYMENT_TERM_DAYS,
  PAYMENT_TERM_PRESETS,
  validateInvoiceNumberFormat,
} from '@/lib/invoice-numbering';

export type InvoiceSettingField = 'numberFormat' | 'paymentTerms' | 'paymentInstructions';

type Props = {
  field: InvoiceSettingField | null;
  settings: InvoiceSettings;
  onClose: () => void;
  onSave: (updates: Partial<InvoiceSettings>) => void;
};

const TITLES: Record<InvoiceSettingField, { title: string; description: string }> = {
  numberFormat: {
    title: 'Invoice number format',
    description: 'New invoices are numbered with this format. Invoices already created keep their number.',
  },
  paymentTerms: {
    title: 'Default payment terms',
    description: 'Applied to new invoices. Invoices already created keep the terms they were issued with.',
  },
  paymentInstructions: {
    title: 'Payment instructions',
    description: 'Shown on new invoices so customers know how to pay you.',
  },
};

/** Editors for the invoice defaults, in the app's standard bottom sheet. */
export function InvoiceSettingSheet({ field, settings, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  const [format, setFormat] = useState(settings.numberFormat);
  const [termDays, setTermDays] = useState(settings.paymentTermDays);
  const [customDays, setCustomDays] = useState(
    PAYMENT_TERM_PRESETS.includes(settings.paymentTermDays as (typeof PAYMENT_TERM_PRESETS)[number])
      ? ''
      : String(settings.paymentTermDays),
  );
  const [isCustom, setIsCustom] = useState(
    !PAYMENT_TERM_PRESETS.includes(settings.paymentTermDays as (typeof PAYMENT_TERM_PRESETS)[number]),
  );
  const [instructions, setInstructions] = useState(settings.paymentInstructions);
  const [error, setError] = useState('');

  const copy = field ? TITLES[field] : null;
  const inputStyle = [styles.input, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }];

  const handleSave = () => {
    if (field === 'numberFormat') {
      const message = validateInvoiceNumberFormat(format);
      if (message) {
        setError(message);
        return;
      }
      onSave({ numberFormat: format.trim() });
      return;
    }

    if (field === 'paymentTerms') {
      if (!isCustom) {
        onSave({ paymentTermDays: termDays });
        return;
      }

      const parsed = Number(customDays);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_PAYMENT_TERM_DAYS) {
        setError(`Enter a whole number of days between 1 and ${MAX_PAYMENT_TERM_DAYS}.`);
        return;
      }
      onSave({ paymentTermDays: parsed });
      return;
    }

    onSave({ paymentInstructions: instructions.trim() });
  };

  const formatError = field === 'numberFormat' ? validateInvoiceNumberFormat(format) : null;

  return (
    <BottomSheetModal visible={field !== null} onClose={onClose}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: palette.accent }]}>Invoices</Text>
          <Text style={[styles.title, { color: palette.text }]}>{copy?.title ?? ''}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close editor"
          onPress={onClose}
          style={[styles.closeButton, { backgroundColor: soft.inset }]}>
          <Ionicons name="close" size={22} color={palette.text} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} {...modalScrollProps}>
        <Text style={[styles.description, { color: palette.muter }]}>{copy?.description ?? ''}</Text>

        {field === 'numberFormat' ? (
          <>
            <TextInput
              value={format}
              onChangeText={(value) => {
                setFormat(value);
                setError('');
              }}
              style={inputStyle}
              placeholder="INV-{YYYY}-{####}"
              placeholderTextColor={palette.muter}
              accessibilityLabel="Invoice number format"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Text style={[styles.preview, { color: palette.muter }]}>
              Preview:{' '}
              <Text style={{ color: palette.text }}>
                {formatError ? '—' : generateInvoiceNumber(format, settings.nextInvoiceSequence, new Date())}
              </Text>
            </Text>
            <View style={[styles.tokenCard, { backgroundColor: soft.inset }]}>
              {[
                ['{YYYY}', '4-digit year'],
                ['{YY}', '2-digit year'],
                ['{MM}', 'Month'],
                ['{####}', 'Sequence, padded to the number of #'],
              ].map(([token, meaning]) => (
                <View key={token} style={styles.tokenRow}>
                  <Text style={[styles.token, { color: palette.accent }]}>{token}</Text>
                  <Text style={[styles.tokenMeaning, { color: palette.muter }]}>{meaning}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {field === 'paymentTerms' ? (
          <>
            {PAYMENT_TERM_PRESETS.map((preset) => {
              const selected = !isCustom && termDays === preset;
              return (
                <Pressable
                  key={preset}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={formatPaymentTerms(preset)}
                  onPress={() => {
                    setIsCustom(false);
                    setTermDays(preset);
                    setError('');
                  }}
                  style={[styles.option, { backgroundColor: soft.inset, borderColor: selected ? palette.accent : soft.border }]}>
                  <Text style={[styles.optionText, { color: palette.text }]}>
                    {preset === 0 ? 'Due on receipt' : `${preset} days`}
                  </Text>
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={selected ? palette.accent : palette.muter}
                  />
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: isCustom }}
              accessibilityLabel="Custom payment terms"
              onPress={() => {
                setIsCustom(true);
                setError('');
              }}
              style={[styles.option, { backgroundColor: soft.inset, borderColor: isCustom ? palette.accent : soft.border }]}>
              <Text style={[styles.optionText, { color: palette.text }]}>Custom</Text>
              <Ionicons
                name={isCustom ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={isCustom ? palette.accent : palette.muter}
              />
            </Pressable>
            {isCustom ? (
              <TextInput
                value={customDays}
                onChangeText={(value) => {
                  setCustomDays(value.replace(/[^0-9]/g, ''));
                  setError('');
                }}
                style={[...inputStyle, styles.spaced]}
                placeholder="Number of days"
                placeholderTextColor={palette.muter}
                accessibilityLabel="Custom number of days"
                keyboardType="number-pad"
              />
            ) : null}
          </>
        ) : null}

        {field === 'paymentInstructions' ? (
          <>
            <TextInput
              value={instructions}
              onChangeText={(value) => {
                setInstructions(value.slice(0, MAX_PAYMENT_INSTRUCTIONS));
                setError('');
              }}
              style={[...inputStyle, styles.multiline]}
              placeholder="Example: Please transfer payment to Maybank 1234567890 and include the invoice number as your payment reference."
              placeholderTextColor={palette.muter}
              accessibilityLabel="Payment instructions"
              multiline
              textAlignVertical="top"
              maxLength={MAX_PAYMENT_INSTRUCTIONS}
            />
            <Text style={[styles.counter, { color: palette.muter }]}>
              {instructions.length} / {MAX_PAYMENT_INSTRUCTIONS}
            </Text>
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: soft.divider, paddingBottom: Math.max(insets.bottom, 16) }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={[styles.secondaryButton, { backgroundColor: soft.inset, borderColor: soft.border }]}>
            <Text style={[styles.secondaryButtonText, { color: palette.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={handleSave}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: palette.accent, shadowColor: palette.accent },
              pressed && styles.pressed,
            ]}>
            <Text style={styles.primaryButtonText}>Save</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  title: { fontSize: 20, fontWeight: '900', letterSpacing: -0.35 },
  closeButton: {
    alignItems: 'center',
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingBottom: 10, paddingTop: 8 },
  description: { fontSize: 13, fontWeight: '500', lineHeight: 19, marginBottom: 16 },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '100%',
  },
  spaced: { marginTop: 10 },
  multiline: { minHeight: 132 },
  preview: { fontSize: 13, fontWeight: '700', marginTop: 12 },
  tokenCard: { borderRadius: 16, gap: 8, marginTop: 16, padding: 14 },
  tokenRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  token: { fontSize: 12.5, fontWeight: '800', width: 72 },
  tokenMeaning: { flex: 1, fontSize: 12.5, fontWeight: '500' },
  option: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  optionText: { fontSize: 14.5, fontWeight: '700' },
  counter: { fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'right' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  error: { color: '#DC2626', fontSize: 12, fontWeight: '600', marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 10 },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryButtonText: { fontWeight: '800' },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 16,
    elevation: 4,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    shadowOffset: { height: 6, width: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  pressed: { opacity: 0.8 },
});
