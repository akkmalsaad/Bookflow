import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

import { toWhatsAppNumber } from '@/lib/booking-messages';

/** Opens WhatsApp with the text ready to send — the same channel invoices are shared through. */
export async function openWhatsAppWithText(phone: string | undefined, text: string) {
  const number = toWhatsAppNumber(phone);
  if (!number) return false;
  const encoded = encodeURIComponent(text);
  try {
    await Linking.openURL(Platform.OS === 'web' ? `https://wa.me/${number}?text=${encoded}` : `whatsapp://send?phone=${number}&text=${encoded}`);
  } catch {
    await Linking.openURL(`https://wa.me/${number}?text=${encoded}`).catch(() => {});
  }
  return true;
}

/** The system share sheet, which also offers Copy. Nothing is sent without the owner choosing to. */
export function shareText(text: string) {
  return Share.share({ message: text }).catch(() => undefined);
}
