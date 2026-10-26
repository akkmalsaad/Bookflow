import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { modalScrollProps } from '@/components/modal-keyboard';
import { getSoftTokens } from '@/components/settings/tokens';
import type { PackageOption } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { MAX_DEPOSIT_PERCENT, type ServiceDepositType } from '@/lib/service-defaults';
import { normalizeIncludedServices, parseMoneyInput, type SavedAddOn } from '@/lib/booking-pricing';
import type { TranslationKey } from '@/lib/i18n';
import { useTranslation } from '@/lib/use-translation';

type AddOnDraft = { key: string; id?: string; name: string; unitPrice: string; unit: string };
let addOnSequence = 0;
const newAddOnDraft = (seed?: Partial<AddOnDraft>): AddOnDraft => {
  addOnSequence += 1;
  return { key: `addon-${Date.now()}-${addOnSequence}`, name: '', unitPrice: '', unit: '', ...seed };
};

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
  const [includedText, setIncludedText] = useState((seed.includedServices ?? []).join('\n'));
  const [addOns, setAddOns] = useState<AddOnDraft[]>(() =>
    (seed.addOns ?? []).map((addOn) => newAddOnDraft({ id: addOn.id, name: addOn.name, unitPrice: String(addOn.unitPrice), unit: addOn.unit ?? '' })),
  );
  const [bufferText, setBufferText] = useState(seed.bufferMinutes ? String(seed.bufferMinutes) : '');
  // Optional extras stay folded away unless the service already uses them.
  const [showExtras, setShowExtras] = useState(Boolean(seed.includedServices?.length || seed.addOns?.length || seed.bufferMinutes));

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

    const savedAddOns: SavedAddOn[] = [];
    for (const draft of addOns) {
      if (!draft.name.trim() && !draft.unitPrice.trim()) continue;
      const unitPrice = parseMoneyInput(draft.unitPrice);
      if (!draft.name.trim() || unitPrice === null || unitPrice <= 0) {
        setShowExtras(true);
        setError(t('service.addOns.error'));
        return;
      }
      savedAddOns.push({ id: draft.id ?? `addon-${Date.now()}-${savedAddOns.length}`, name: draft.name.trim(), unitPrice, ...(draft.unit.trim() ? { unit: draft.unit.trim() } : {}) });
    }
    const buffer = bufferText.trim() ? Number(bufferText) : 0;
    if (!Number.isFinite(buffer) || buffer < 0 || buffer > 720) {
      setShowExtras(true);
      setError(t('service.buffer.error'));
      return;
    }

    onSubmit({
      // Prefill-only defaults, like the deposit: a booking copies them when it is made and keeps
      // its own copy, so editing them here never changes an existing booking, quote or invoice.
      includedServices: normalizeIncludedServices(includedText),
      addOns: savedAddOns,
      bufferMinutes: Math.round(buffer),
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

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showExtras }}
          onPress={() => setShowExtras((current) => !current)}
          style={[styles.extrasButton, { backgroundColor: soft.inset, borderColor: soft.border }, showExtras && { borderColor: palette.accent, backgroundColor: soft.accentSoft }]}>
          <View style={styles.extrasCopy}>
            <Text style={[styles.extrasTitle, { color: palette.text }]}>{t('service.extras')}</Text>
            <Text style={[styles.helperText, styles.extrasHint, { color: palette.muter }]}>{t('service.extras.hint')}</Text>
          </View>
          <Ionicons name={showExtras ? 'chevron-up' : 'chevron-down'} size={18} color={palette.text} />
        </Pressable>
        {showExtras ? (
          <View>
            <Text style={labelStyle}>{t('service.included')}</Text>
            <TextInput
              value={includedText}
              onChangeText={setIncludedText}
              style={[...inputStyle, styles.multilineInput]}
              placeholder={t('service.included.placeholder')}
              placeholderTextColor={palette.muter}
              accessibilityLabel={t('service.included')}
              multiline
              textAlignVertical="top"
            />

            <Text style={labelStyle}>{t('service.addOns')}</Text>
            {addOns.map((draft, index) => (
              <View key={draft.key} style={[styles.addOnRow, { backgroundColor: soft.inset, borderColor: soft.border }]}>
                <View style={styles.addOnHeader}>
                  <TextInput
                    value={draft.name}
                    onChangeText={(value) => { setAddOns(addOns.map((item) => (item.key === draft.key ? { ...item, name: value } : item))); setError(''); }}
                    style={[...inputStyle, styles.addOnName, { backgroundColor: soft.surface }]}
                    placeholder={t('service.addOns.name')}
                    placeholderTextColor={palette.muter}
                    accessibilityLabel={`${t('service.addOns.name')} ${index + 1}`}
                    maxLength={120}
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel={`${t('service.addOns.remove')} ${index + 1}`} hitSlop={8} onPress={() => setAddOns(addOns.filter((item) => item.key !== draft.key))} style={styles.addOnRemove}>
                    <Ionicons name="trash-outline" size={17} color={palette.danger} />
                  </Pressable>
                </View>
                <View style={styles.addOnNumbers}>
                  <TextInput
                    value={draft.unitPrice}
                    onChangeText={(value) => { setAddOns(addOns.map((item) => (item.key === draft.key ? { ...item, unitPrice: value } : item))); setError(''); }}
                    style={[...inputStyle, styles.flex, { backgroundColor: soft.surface }]}
                    placeholder={t('service.addOns.price')}
                    placeholderTextColor={palette.muter}
                    accessibilityLabel={`${t('service.addOns.price')} ${index + 1}`}
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    value={draft.unit}
                    onChangeText={(value) => setAddOns(addOns.map((item) => (item.key === draft.key ? { ...item, unit: value } : item)))}
                    style={[...inputStyle, styles.flex, { backgroundColor: soft.surface }]}
                    placeholder={t('service.addOns.unit')}
                    placeholderTextColor={palette.muter}
                    accessibilityLabel={`${t('service.addOns.unit')} ${index + 1}`}
                    maxLength={24}
                  />
                </View>
              </View>
            ))}
            <Pressable accessibilityRole="button" onPress={() => setAddOns([...addOns, newAddOnDraft()])} style={({ pressed }) => [styles.addOnAdd, { borderColor: palette.accent }, pressed && styles.pressed]}>
              <Ionicons name="add" size={16} color={palette.accent} />
              <Text style={[styles.addOnAddText, { color: palette.accent }]}>{t('service.addOns.add')}</Text>
            </Pressable>

            <Text style={labelStyle}>{t('service.buffer')}</Text>
            <TextInput
              value={bufferText}
              onChangeText={(value) => { setBufferText(value); setError(''); }}
              style={inputStyle}
              placeholder="0"
              placeholderTextColor={palette.muter}
              accessibilityLabel={t('service.buffer')}
              keyboardType="number-pad"
            />
          </View>
        ) : null}

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
  extrasButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  extrasCopy: {
    flex: 1,
  },
  extrasTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  extrasHint: {
    marginTop: 2,
  },
  addOnRow: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
    padding: 8,
  },
  addOnHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  addOnName: {
    flex: 1,
    width: undefined,
  },
  addOnRemove: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 36,
  },
  addOnNumbers: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  flex: {
    flex: 1,
    width: undefined,
  },
  addOnAdd: {
    alignItems: 'center',
    borderRadius: 14,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  addOnAddText: {
    fontSize: 13,
    fontWeight: '800',
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
