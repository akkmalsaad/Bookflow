import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { bookingFormStyles as f, type BookingFormColors } from '@/components/booking/booking-form-styles';
import { chargeAmountCents, fromCents, MAX_CHARGE_ROWS, parseMoneyInput, parseQuantityInput, type SavedAddOn } from '@/lib/booking-pricing';
import { useTranslation } from '@/lib/use-translation';

/** One row as typed. Held as text so the numeric keyboard can edit it; parsed only on save. */
export type ChargeDraftRow = {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  unit?: string;
  addOnId?: string;
};

let rowSequence = 0;
export function newChargeRow(seed?: Partial<ChargeDraftRow>): ChargeDraftRow {
  rowSequence += 1;
  return { key: `row-${Date.now()}-${rowSequence}`, description: '', quantity: '1', unitPrice: '', ...seed };
}

/** The live amount for a row, or null while it is still incomplete. */
export function draftRowAmount(row: ChargeDraftRow) {
  const quantity = parseQuantityInput(row.quantity);
  const unitPrice = parseMoneyInput(row.unitPrice);
  if (quantity === null || unitPrice === null || unitPrice <= 0) return null;
  return fromCents(chargeAmountCents(quantity, unitPrice));
}

type Props = {
  rows: ChargeDraftRow[];
  onChange: (rows: ChargeDraftRow[]) => void;
  addOns?: SavedAddOn[];
  expanded: boolean;
  onToggle: () => void;
  formatter: Intl.NumberFormat;
  colors: BookingFormColors;
  error?: string;
};

/**
 * The optional "Additional charges" section of the booking modal: collapsed to a single row by
 * default, opening into editable lines (description, quantity, unit price, live amount), with the
 * selected package's saved add-ons offered as one-tap rows.
 */
export function BookingChargesEditor({ rows, onChange, addOns = [], expanded, onToggle, formatter, colors, error }: Props) {
  const { t } = useTranslation();
  const { palette, softInset, softBorder, softSurface, accentSoft } = colors;
  const totalCents = rows.reduce((sum, row) => sum + Math.round((draftRowAmount(row) ?? 0) * 100), 0);
  const canAdd = rows.length < MAX_CHARGE_ROWS;

  const update = (key: string, patch: Partial<ChargeDraftRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={t('bm.charges')}
        onPress={onToggle}
        style={[f.sectionButton, { backgroundColor: softInset, borderColor: softBorder }, expanded && { borderColor: palette.accent, backgroundColor: accentSoft }]}>
        <View style={styles.headerCopy}>
          <Text style={[f.sectionTitle, { color: palette.text }]}>{t('bm.charges')}</Text>
          <Text style={[f.sectionMeta, { color: palette.muter }]}>
            {rows.length ? t('bm.charges.count', { count: rows.length, amount: formatter.format(fromCents(totalCents)) }) : t('bm.charges.hint')}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={palette.text} />
      </Pressable>

      {expanded ? (
        <View style={[styles.panel, { backgroundColor: softInset, borderColor: softBorder }]}>
          {rows.map((row, index) => {
            const amount = draftRowAmount(row);
            return (
              <View key={row.key} style={[styles.row, { backgroundColor: softSurface, borderColor: softBorder }]}>
                <View style={styles.rowHeader}>
                  <TextInput
                    value={row.description}
                    onChangeText={(value) => update(row.key, { description: value })}
                    placeholder={t('bm.charges.description')}
                    placeholderTextColor={palette.muter}
                    accessibilityLabel={`${t('bm.charges.description')} ${index + 1}`}
                    maxLength={120}
                    style={[f.input, styles.descriptionInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('bm.charges.remove')} ${index + 1}`}
                    hitSlop={8}
                    onPress={() => onChange(rows.filter((item) => item.key !== row.key))}
                    style={({ pressed }) => [styles.removeButton, { backgroundColor: softInset }, pressed && f.pressed]}>
                    <Ionicons name="trash-outline" size={17} color={palette.danger} />
                  </Pressable>
                </View>
                <View style={styles.numbersRow}>
                  <View style={styles.quantityField}>
                    <Text style={[styles.miniLabel, { color: palette.muter }]}>{t('bm.charges.quantity')}</Text>
                    <TextInput
                      value={row.quantity}
                      onChangeText={(value) => update(row.key, { quantity: value })}
                      keyboardType="decimal-pad"
                      accessibilityLabel={`${t('bm.charges.quantity')} ${index + 1}`}
                      style={[f.input, styles.compactInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                    />
                  </View>
                  <View style={styles.priceField}>
                    <Text style={[styles.miniLabel, { color: palette.muter }]}>{t('bm.charges.unitPrice')}{row.unit ? ` / ${row.unit}` : ''}</Text>
                    <TextInput
                      value={row.unitPrice}
                      onChangeText={(value) => update(row.key, { unitPrice: value })}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={palette.muter}
                      accessibilityLabel={`${t('bm.charges.unitPrice')} ${index + 1}`}
                      style={[f.input, styles.compactInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                    />
                  </View>
                  <View style={styles.amountField}>
                    <Text style={[styles.miniLabel, { color: palette.muter }]} numberOfLines={1}>{t('doc.amount')}</Text>
                    <Text style={[styles.amount, { color: amount === null ? palette.muter : palette.text }]} numberOfLines={1} adjustsFontSizeToFit>
                      {amount === null ? '—' : formatter.format(amount)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}

          {addOns.length ? (
            <>
              <Text style={[f.fieldLabel, styles.addOnLabel, { color: palette.muter }]}>{t('bm.charges.fromPackage')}</Text>
              <View style={styles.chips}>
                {addOns.map((addOn) => (
                  <Pressable
                    key={addOn.id}
                    accessibilityRole="button"
                    disabled={!canAdd}
                    onPress={() => onChange([...rows, newChargeRow({ description: addOn.name, unitPrice: String(addOn.unitPrice), unit: addOn.unit, addOnId: addOn.id })])}
                    style={({ pressed }) => [f.chip, { backgroundColor: softSurface, borderColor: softBorder }, pressed && f.pressed]}>
                    <Text style={[f.chipText, { color: palette.text }]}>
                      + {addOn.name} · {formatter.format(addOn.unitPrice)}{addOn.unit ? `/${addOn.unit}` : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={!canAdd}
            onPress={() => onChange([...rows, newChargeRow()])}
            style={({ pressed }) => [styles.addButton, { borderColor: palette.accent }, pressed && f.pressed, !canAdd && styles.disabled]}>
            <Ionicons name="add" size={17} color={palette.accent} />
            <Text style={[styles.addText, { color: palette.accent }]}>{rows.length ? t('bm.charges.add') : t('bm.charges.custom')}</Text>
          </Pressable>
          {!canAdd ? <Text style={[f.hint, { color: palette.muter }]}>{t('bm.charges.error.max', { count: MAX_CHARGE_ROWS })}</Text> : null}
          {error ? <Text accessibilityRole="alert" style={f.error}>{error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerCopy: { flex: 1 },
  panel: { borderWidth: 1, borderRadius: 18, padding: 8, marginTop: 8 },
  row: { borderWidth: 1, borderRadius: 14, padding: 10, marginBottom: 8 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  descriptionInput: { flex: 1, paddingVertical: 10 },
  removeButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  numbersRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-end' },
  quantityField: { width: 64 },
  priceField: { flex: 1 },
  amountField: { flex: 1, alignItems: 'flex-end', paddingBottom: 11 },
  miniLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 5 },
  compactInput: { paddingVertical: 10 },
  amount: { fontSize: 14, fontWeight: '800' },
  addOnLabel: { marginTop: 6, marginLeft: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 11 },
  addText: { fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.5 },
});
