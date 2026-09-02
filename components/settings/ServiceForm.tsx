import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { modalScrollProps } from '@/components/modal-keyboard';
import { getSoftTokens } from '@/components/settings/tokens';
import type { PackageOption } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

export type ServiceFormValues = Omit<PackageOption, 'id'>;

type Props = {
  mode: 'create' | 'edit';
  initialValues?: ServiceFormValues;
  onSubmit: (values: ServiceFormValues) => void;
  onCancel: () => void;
};

const EMPTY: ServiceFormValues = { name: '', details: '', duration: '', price: 0, info: '' };

/**
 * The one service/package form, used for both adding and editing. The fields scroll on their own
 * while Cancel and Save stay pinned to the bottom of the sheet, clear of the home indicator.
 */
export function ServiceForm({ mode, initialValues, onSubmit, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const seed = initialValues ?? EMPTY;

  const [name, setName] = useState(seed.name);
  const [details, setDetails] = useState(seed.details);
  const [duration, setDuration] = useState(seed.duration);
  // Held as text so the numeric keyboard can edit it; only parsed on submit.
  const [price, setPrice] = useState(seed.price ? String(seed.price) : '');
  const [info, setInfo] = useState(seed.info);
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const parsedPrice = Number(price);

    if (!name.trim() || !details.trim() || !duration.trim() || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      setError('Add a service name, details, time, and a price greater than zero.');
      return;
    }

    onSubmit({
      name: name.trim(),
      details: details.trim(),
      duration: duration.trim(),
      price: parsedPrice,
      info: info.trim(),
    });
  };

  const inputStyle = [styles.input, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }];
  const labelStyle = [styles.fieldLabel, { color: palette.muter }];

  return (
    <>
      {/* Only the fields scroll; the actions below stay pinned to the bottom of the sheet. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} {...modalScrollProps}>
        <Text style={labelStyle}>Service name</Text>
        <TextInput
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError('');
          }}
          style={inputStyle}
          placeholder="Wedding photography"
          placeholderTextColor={palette.muter}
          accessibilityLabel="Service name"
        />

        <Text style={labelStyle}>Details of service</Text>
        <TextInput
          value={details}
          onChangeText={(value) => {
            setDetails(value);
            setError('');
          }}
          style={[...inputStyle, styles.multilineInput]}
          placeholder="Describe what is included"
          placeholderTextColor={palette.muter}
          accessibilityLabel="Details of service"
          multiline
          textAlignVertical="top"
        />

        <Text style={labelStyle}>Time</Text>
        <TextInput
          value={duration}
          onChangeText={(value) => {
            setDuration(value);
            setError('');
          }}
          style={inputStyle}
          placeholder="e.g. 4 hours"
          placeholderTextColor={palette.muter}
          accessibilityLabel="Time"
        />

        <Text style={labelStyle}>Price</Text>
        <TextInput
          value={price}
          onChangeText={(value) => {
            setPrice(value);
            setError('');
          }}
          style={inputStyle}
          placeholder="1200"
          placeholderTextColor={palette.muter}
          accessibilityLabel="Price"
          keyboardType="numeric"
        />

        <Text style={labelStyle}>Info / invoice terms</Text>
        <TextInput
          value={info}
          onChangeText={setInfo}
          style={[...inputStyle, styles.termsInput]}
          placeholder="Add payment, cancellation, delivery, or other customer-facing terms"
          placeholderTextColor={palette.muter}
          accessibilityLabel="Info or invoice terms"
          multiline
          textAlignVertical="top"
        />
        <Text style={[styles.helperText, { color: palette.muter }]}>
          This information will be included in invoices that use this service.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: soft.divider, paddingBottom: Math.max(insets.bottom, 16) }]}>
        {/* Kept out of the scroll area so a validation message is never scrolled out of sight. */}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.formActions}>
          <Pressable
            accessibilityRole="button"
            style={[styles.secondaryButton, { backgroundColor: soft.inset, borderColor: soft.border }]}
            onPress={onCancel}>
            <Text style={[styles.secondaryButtonText, { color: palette.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.submitButton,
              { backgroundColor: palette.accent, shadowColor: palette.accent },
              pressed && styles.pressed,
            ]}
            onPress={handleSubmit}>
            <Text style={styles.submitButtonText}>{mode === 'edit' ? 'Save Changes' : 'Save service'}</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    // Grows with its content, then shrinks so the sheet's max height wins over the form's length.
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 10,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.65,
    marginBottom: 8,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '100%',
  },
  multilineInput: {
    minHeight: 84,
  },
  termsInput: {
    minHeight: 112,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
  },
  error: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryButtonText: {
    fontWeight: '800',
  },
  submitButton: {
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
  submitButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.8,
  },
});
