import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { bookingFormStyles as f, getBookingFormColors } from '@/components/booking/booking-form-styles';
import { modalScrollProps } from '@/components/modal-keyboard';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { canReviseOffer, type BookingOffer } from '@/lib/booking-offers';
import { useTranslation } from '@/lib/use-translation';

type Props = {
  /** The booking form whose change request is shown, or null when the sheet is closed. */
  offer: BookingOffer | null;
  customerLabel: string;
  onClose: () => void;
  onClosed?: () => void;
  onEdit: () => void;
};

/**
 * What the customer asked to change on a booking form. Read-only: viewing it resolves nothing. The
 * request stays until the owner sends the form's link again, the existing way it is answered.
 */
export function ChangeRequestSheet({ offer, customerLabel, onClose, onClosed, onEdit }: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const { softSurface, softBorder, accentSoft } = getBookingFormColors(isDarkMode, palette);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // No request time is shown: the server keeps no dedicated timestamp for it, only a general
  // last-updated time, which is not reliably when the customer asked.
  const notes = offer?.changeRequest?.trim() ?? '';
  // An earlier request (its status since reset) is shown as such, never as one still waiting.
  const pending = offer?.status === 'change_requested';
  // Independent of the notes, so an older request without any can still be acted on.
  const canEdit = Boolean(offer && canReviseOffer(offer));

  return (
    <BottomSheetModal visible={offer !== null} onClose={onClose} onClosed={onClosed} heightRatio={0.85}>
      {offer ? (
        <ScrollView {...modalScrollProps} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
          <View style={[styles.iconTile, { backgroundColor: accentSoft }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={palette.accent} />
          </View>
          <Text style={[styles.eyebrow, { color: palette.accent }]}>{t(pending ? 'of.request.eyebrow' : 'of.request.earlierEyebrow')}</Text>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]} numberOfLines={2}>{offer.details.title}</Text>
          <Text style={[styles.subtitle, { color: palette.muter }]} numberOfLines={1}>{customerLabel}</Text>

          <View style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder }]}>
            <Text selectable style={[styles.notes, { color: notes ? palette.text : palette.muter }]}>
              {notes || t('of.request.noNotes')}
            </Text>
          </View>

          <View style={styles.hintRow}>
            <Ionicons name="information-circle-outline" size={18} color={palette.muter} />
            <Text style={[styles.hintText, { color: palette.muter }]}>{t(pending ? 'of.request.hint' : 'of.request.earlierHint')}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canEdit }}
            disabled={!canEdit}
            onPress={onEdit}
            style={({ pressed }) => [styles.primary, { backgroundColor: palette.accent, shadowColor: palette.accent }, !canEdit && styles.disabled, pressed && f.pressed]}>
            <Ionicons name="create-outline" size={18} color="#FFFFFF" />
            <Text style={styles.primaryText}>{t('of.request.edit')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.done, pressed && f.pressed]}>
            <Text style={[styles.doneText, { color: palette.muter }]}>{t('common.close')}</Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  iconTile: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 12 },
  title: { fontSize: 20, fontWeight: '900', letterSpacing: -0.3, marginTop: 4 },
  subtitle: { fontSize: 13.5, fontWeight: '600', marginTop: 3 },
  card: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 13, marginTop: 14 },
  notes: { fontSize: 14.5, fontWeight: '500', lineHeight: 21 },
  hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 14 },
  hintText: { flex: 1, fontSize: 12.5, fontWeight: '500', lineHeight: 18 },
  primary: { marginTop: 18, borderRadius: 17, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowOpacity: 0.24, shadowRadius: 12, shadowOffset: { width: 4, height: 7 }, elevation: 5 },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  disabled: { opacity: 0.5 },
  done: { marginTop: 8, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 14, fontWeight: '700' },
});
