import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { getThemePalette, useTheme } from '@/context/theme-context';

type Props = {
  visible: boolean;
  onAllow: () => void;
  onDismiss: () => void;
};

export function NotificationPermissionPrompt({ visible, onAllow, onDismiss }: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const softSurface = isDarkMode ? '#172033' : '#FFFFFF';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';
  const iconBackground = isDarkMode ? 'rgba(129, 140, 248, 0.18)' : 'rgba(79, 70, 229, 0.1)';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
          <View style={[styles.iconWrap, { backgroundColor: iconBackground }]}>
            <Ionicons name="notifications" size={26} color={palette.accent} />
          </View>
          <Text style={[styles.title, { color: palette.text }]}>Allow Notifications</Text>
          <Text style={[styles.copy, { color: palette.muter }]}>
            Bookflow would like to send you reminders for today&apos;s priority bookings so you never miss an appointment.
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              style={[styles.button, styles.dismissButton, { backgroundColor: softInset, borderColor: softBorder }]}
              onPress={onDismiss}>
              <Text style={[styles.dismissText, { color: palette.text }]}>Not Now</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.button, styles.allowButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]}
              onPress={onAllow}>
              <Text style={styles.allowText}>Allow</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  copy: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
    marginTop: 8,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    width: '100%',
  },
  button: {
    flex: 1,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 12,
  },
  dismissButton: {
    borderWidth: 1,
  },
  dismissText: {
    fontSize: 15,
    fontWeight: '700',
  },
  allowButton: {
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 4, height: 6 },
    elevation: 4,
  },
  allowText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
