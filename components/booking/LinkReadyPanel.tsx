import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { bookingFormStyles as f, type BookingFormColors } from '@/components/booking/booking-form-styles';
import { toWhatsAppNumber } from '@/lib/booking-messages';
import { useTranslation } from '@/lib/use-translation';

type Props = {
  title: string;
  body: string;
  url: string;
  expiresAt?: string;
  /** Customer phone, when known, for a WhatsApp shortcut — the same channel invoices use. */
  phone?: string;
  /**
   * Opens the customer's details to add or fix their phone number. Given only when the link is for
   * a known customer; it is offered when that customer has no number WhatsApp can use.
   */
  onEditPhone?: () => void;
  message?: string;
  colors: BookingFormColors;
  onDone: () => void;
};

/**
 * Shown once a private link exists. The owner shares it deliberately: through the system share
 * sheet (which also offers Copy) or straight to WhatsApp. Nothing is sent by BookFlow itself.
 */
export function LinkReadyPanel({ title, body, url, expiresAt, phone, onEditPhone, message, colors, onDone }: Props) {
  const { t, intlLocale } = useTranslation();
  const { palette, softInset, softBorder } = colors;
  // Null for a missing number and for one WhatsApp cannot dial (no country code), so WhatsApp is
  // never opened without a usable recipient.
  const whatsapp = toWhatsAppNumber(phone);
  const hasPhone = Boolean(phone?.trim());
  const text = message ? `${message}\n\n${url}` : url;
  const expires = expiresAt
    ? new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(expiresAt))
    : '';

  const shareLink = () => {
    Share.share(Platform.OS === 'ios' ? { url, message: message ?? undefined } : { message: text }).catch(() => {});
  };
  const openWhatsApp = async () => {
    if (!whatsapp) return;
    const encoded = encodeURIComponent(text);
    try {
      await Linking.openURL(Platform.OS === 'web' ? `https://wa.me/${whatsapp}?text=${encoded}` : `whatsapp://send?phone=${whatsapp}&text=${encoded}`);
    } catch {
      await Linking.openURL(`https://wa.me/${whatsapp}?text=${encoded}`).catch(() => {});
    }
  };

  return (
    <View>
      <View style={[styles.iconTile, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="link-outline" size={22} color={palette.accent} />
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.body, { color: palette.muter }]}>{body}</Text>
      <TextInput
        value={url}
        editable={false}
        selectTextOnFocus
        multiline
        accessibilityLabel={url}
        style={[f.input, styles.url, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
      />
      {expires ? <Text style={[f.hint, { color: palette.muter }]}>{t('link.expires', { date: expires })}</Text> : null}
      <Pressable accessibilityRole="button" onPress={shareLink} style={({ pressed }) => [styles.primary, { backgroundColor: palette.accent, shadowColor: palette.accent }, pressed && f.pressed]}>
        <Ionicons name="share-outline" size={18} color="#FFFFFF" />
        <Text style={styles.primaryText}>{t('link.share')}</Text>
      </Pressable>
      {whatsapp ? (
        <Pressable accessibilityRole="button" onPress={openWhatsApp} style={({ pressed }) => [styles.secondary, { borderColor: palette.accent }, pressed && f.pressed]}>
          <Ionicons name="logo-whatsapp" size={18} color={palette.accent} />
          <Text style={[styles.secondaryText, { color: palette.accent }]}>{t('msg.whatsapp')}</Text>
        </Pressable>
      ) : onEditPhone ? (
        <View style={[styles.phoneNotice, { backgroundColor: softInset, borderColor: softBorder }]}>
          <Ionicons name="call-outline" size={18} color={palette.muter} />
          <View style={styles.phoneCopy}>
            <Text style={[styles.phoneText, { color: palette.text }]}>{t(hasPhone ? 'link.phone.invalid' : 'link.phone.missing')}</Text>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onEditPhone} style={({ pressed }) => [styles.phoneAction, pressed && f.pressed]}>
              <Text style={[f.textLink, { color: palette.accent }]}>{t(hasPhone ? 'link.phone.edit' : 'link.phone.add')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <Pressable accessibilityRole="button" onPress={onDone} style={({ pressed }) => [styles.done, pressed && f.pressed]}>
        <Text style={[styles.doneText, { color: palette.muter }]}>{t('link.done')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  iconTile: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  title: { fontSize: 20, fontWeight: '900', letterSpacing: -0.3, marginTop: 12 },
  body: { fontSize: 13.5, lineHeight: 20, marginTop: 6, marginBottom: 12 },
  url: { fontSize: 13, minHeight: 48 },
  primary: { marginTop: 16, borderRadius: 17, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowOpacity: 0.24, shadowRadius: 12, shadowOffset: { width: 4, height: 7 }, elevation: 5 },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  secondary: { marginTop: 10, borderRadius: 17, borderWidth: 1, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryText: { fontWeight: '800', fontSize: 14 },
  phoneNotice: { marginTop: 10, borderRadius: 17, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  phoneCopy: { flex: 1, gap: 6 },
  phoneText: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  phoneAction: { alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center' },
  done: { marginTop: 8, paddingVertical: 12, alignItems: 'center' },
  doneText: { fontSize: 14, fontWeight: '700' },
});
