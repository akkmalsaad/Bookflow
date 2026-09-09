import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { modalScrollProps } from '@/components/modal-keyboard';
import { getSoftTokens } from '@/components/settings/tokens';
import type { PackageOption } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { MAX_DEPOSIT_PERCENT, type ServiceDepositType } from '@/lib/service-defaults';
import type { TranslationKey } from '@/lib/i18n';
import { useTranslation } from '@/lib/use-translation';

export type ServiceFormValues = Omit<PackageOption, 'id'>;

type Props = {
  mode: 'create' | 'edit';
  initialValues?: ServiceFormValues;
  onSubmit: (values: ServiceFormValues) => void;
  onCancel: () => void;
};

const EMPTY: ServiceFormValues = { name: '', details: '', duration: '', price: 0, info: '' };

// The stored key is unchanged; only the label follows the language.
const DEPOSIT_OPTIONS: { key: ServiceDepositType | 'none'; labelKey: TranslationKey }[] = [
  { key: 'none', labelKey: 'service.deposit.none' },
  { key: 'percent', labelKey: 'service.deposit.percent' },
  { key: 'fixed', labelKey: 'service.deposit.fixed' },
];

/**
 * The one service/package form, used for both adding and editing. The fields scroll on their own
 * while Cancel and Save stay pinned to the bottom of the sheet, clear of the home indicator.
 */
export function ServiceForm({ mode, initialValues, onSubmit, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const { t } = useTranslation();
  const soft = getSoftTokens(isDarkMode);
  const seed = initialValues ?? EMPTY;

  const [name, setName] = useState(seed.name);
  const [details, setDetails] = useState(seed.details);
  const [duration, setDuration] = useState(seed.duration);
  // Held as text so the numeric keyboard can edit it; only parsed on submit.
  const [price, setPrice] = useState(seed.price ? String(seed.price) : '');
  const [info, setInfo] = useState(seed.info);
  const [depositMode, setDepositMode] = useState<ServiceDepositType | 'none'>(seed.defaultDepositType ?? 'none');
  const [depositValue, setDepositValue] = useState(
    seed.defaultDepositValue ? String(seed.defaultDepositValue) : '',
  );
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const parsedPrice = Number(price);

    // Name and price are what a booking cannot be created without. Details, time and deposit are
    // prefill conveniences, so a service is allowed to leave any of them blank.
    if (!name.trim() || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      setError(t('service.error.name'));
      return;
    }

    const parsedDeposit = Number(depositValue);
    if (depositMode !== 'none') {
      if (!depositValue.trim() || Number.isNaN(parsedDeposit) || parsedDeposit <= 0) {
        setError(t('service.error.deposit'));
        return;
      }
      if (depositMode === 'percent' && parsedDeposit > MAX_DEPOSIT_PERCENT) {
        setError(`A percentage deposit cannot be more than ${MAX_DEPOSIT_PERCENT}%.`);
        return;
      }
      if (depositMode === 'fixed' && parsedDeposit > parsedPrice) {
        setError('A fixed deposit cannot be more than the service price.');
        return;
      }
    }

    onSubmit({
      name: name.trim(),
      details: details.trim(),
      duration: duration.trim(),
      price: parsedPrice,
      info: info.trim(),
      // Sent as a pair or not at all; the context normalises and can clear it from here.
      defaultDepositType: depositMode === 'none' ? undefined : depositMode,
      defaultDepositValue: depositMode === 'none' ? undefined : parsedDeposit,
    });
  };

  const inputStyle = [styles.input, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }];
  const labelStyle = [styles.fieldLabel, { color: palette.muter }];

  return (
    <>
      {/* Only the fields scroll; the actions below stay pinned to the bottom of the sheet. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} {...modalScrollProps}>
        <Text style={labelStyle}>{t('service.name')}</Text>
        <TextInput
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError('');
          }}
          style={inputStyle}
          placeholder={t('service.name.placeholder')}
          placeholderTextColor={palette.muter}
          accessibilityLabel={t('service.name')}
        />

        <Text style={labelStyle}>{t('service.details')}</Text>
        <TextInput
          value={details}
          onChangeText={(value) => {
            setDetails(value);
            setError('');
          }}
          style={[...inputStyle, styles.multilineInput]}
          placeholder={t('service.details.placeholder')}
          placeholderTextColor={palette.muter}
          accessibilityLabel={t('service.details')}
          multiline
          textAlignVertical="top"
        />

        <Text style={labelStyle}>{t('service.price')}</Text>
        <TextInput
          value={price}
          onChangeText={(value) => {
            setPrice(value);
            setError('');
          }}
          style={inputStyle}
          placeholder="1200"
          placeholderTextColor={palette.muter}
          accessibilityLabel={t('service.price')}
          keyboardType="numeric"
        />

        <Text style={labelStyle}>{t('service.duration')}</Text>
        <TextInput
          value={duration}
          onChangeText={(value) => {
            setDuration(value);
            setError('');
          }}
          style={inputStyle}
          placeholder="e.g. 4 hours"
          placeholderTextColor={palette.muter}
          accessibilityLabel={t('service.duration')}
        />

        <Text style={labelStyle}>{t('service.defaultDeposit')}</Text>
        <View style={styles.depositModeRow}>
          {DEPOSIT_OPTIONS.map((option) => {
            const selected = depositMode === option.key;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={t(option.labelKey)}
                onPress={() => {
                  setDepositMode(option.key);
                  if (option.key === 'none') setDepositValue('');
                  setError('');
                }}
                style={[
                  styles.depositModeButton,
                  { backgroundColor: soft.inset, borderColor: soft.border },
                  selected && { backgroundColor: soft.accentSoft, borderColor: palette.accent },
                ]}>
                <Text
                  numberOfLines={1}
                  style={[styles.depositModeText, { color: selected ? palette.accent : palette.text }]}>
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {depositMode === 'none' ? null : (
          <TextInput
            value={depositValue}
            onChangeText={(value) => {
              setDepositValue(value);
              setError('');
            }}
            style={[...inputStyle, styles.depositInput]}
            placeholder={depositMode === 'percent' ? '30' : '500'}
            placeholderTextColor={palette.muter}
            accessibilityLabel={depositMode === 'percent' ? t('service.deposit.percentLabel') : t('service.deposit.amountLabel')}
            keyboardType="numeric"
          />
        )}
        <Text style={[styles.helperText, { color: palette.muter }]}>
          Duration and deposit only pre-fill a new booking. Bookings you have already created keep
          the values they were saved with.
        </Text>

        <Text style={labelStyle}>{t('service.terms')}</Text>
        <TextInput
          value={info}
          onChangeText={setInfo}
          style={[...inputStyle, styles.termsInput]}
          placeholder={t('service.terms.placeholder')}
          placeholderTextColor={palette.muter}
          accessibilityLabel={t('a11y.serviceTerms')}
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
            <Text style={[styles.secondaryButtonText, { color: palette.text }]}>{t('service.cancel')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.submitButton,
              { backgroundColor: palette.accent, shadowColor: palette.accent },
              pressed && styles.pressed,
            ]}
            onPress={handleSubmit}>
            <Text style={styles.submitButtonText}>{mode === 'edit' ? t('service.saveChanges') : t('service.save')}</Text>
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
  depositModeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  depositModeButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  depositModeText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  depositInput: {
    marginTop: 10,
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
