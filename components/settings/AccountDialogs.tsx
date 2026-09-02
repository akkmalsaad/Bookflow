import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardDoneButton } from '@/components/KeyboardDoneButton';
import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';

/** The data a workspace deletion takes with it, spelled out before the user confirms. */
const DELETED_RECORDS = ['Customers', 'Bookings', 'Invoices', 'Income', 'Expenses', 'Payment records', 'Business logo'];

export function SignOutDialog({ visible, onCancel, onConfirm }: { visible: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow }]}>
          <View style={[styles.dialogIcon, { backgroundColor: soft.dangerSoft }]}>
            <Ionicons name="log-out-outline" size={25} color={palette.danger} />
          </View>
          <Text style={[styles.dialogTitle, { color: palette.text }]}>Sign out of BookFlow?</Text>
          <Text style={[styles.dialogCopy, { color: palette.muter }]}>
            You will return to the login screen. Your local business data will stay on this device.
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              style={[styles.secondaryButton, { backgroundColor: soft.inset, borderColor: soft.border }]}
              onPress={onCancel}>
              <Text style={[styles.secondaryButtonText, { color: palette.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.dangerButton, { backgroundColor: palette.danger, shadowColor: palette.danger }]}
              onPress={onConfirm}>
              <Text style={styles.dangerButtonText}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type DeleteProps = {
  visible: boolean;
  password: string;
  error: string;
  isDeleting: boolean;
  onChangePassword: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteAccountDialog({
  visible,
  password,
  error,
  isDeleting,
  onChangePassword,
  onCancel,
  onConfirm,
}: DeleteProps) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        {/* The dialog holds its position when the password keyboard opens. */}
        <View style={styles.avoider}>
          <View style={[styles.dialog, { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow }]}>
            <View style={[styles.dialogIcon, { backgroundColor: soft.dangerSoft }]}>
              <Ionicons name="warning-outline" size={25} color={palette.danger} />
            </View>
            <Text style={[styles.dialogTitle, { color: palette.text }]}>Delete your account?</Text>
            <Text style={[styles.dialogCopy, { color: palette.muter }]}>
              This permanently deletes your account and everything in your BookFlow workspace. It cannot be undone.
            </Text>

            <View style={[styles.recordList, { backgroundColor: soft.inset }]}>
              {DELETED_RECORDS.map((record) => (
                <View key={record} style={styles.recordItem}>
                  <Ionicons name="close-circle" size={14} color={palette.danger} />
                  <Text style={[styles.recordText, { color: palette.text }]}>{record}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Confirm your password</Text>
            <TextInput
              value={password}
              onChangeText={onChangePassword}
              placeholder="Enter your password"
              placeholderTextColor={palette.muter}
              secureTextEntry
              autoCapitalize="none"
              accessibilityLabel="Password"
              style={[styles.input, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }]}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                style={[styles.secondaryButton, { backgroundColor: soft.inset, borderColor: soft.border }]}
                onPress={onCancel}>
                <Text style={[styles.secondaryButtonText, { color: palette.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isDeleting }}
                disabled={isDeleting}
                style={({ pressed }) => [
                  styles.dangerButton,
                  { backgroundColor: palette.danger, shadowColor: palette.danger },
                  (isDeleting || pressed) && styles.pressed,
                ]}
                onPress={onConfirm}>
                <Text style={styles.dangerButtonText}>{isDeleting ? 'Deleting…' : 'Delete account'}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <KeyboardDoneButton />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  avoider: {
    alignItems: 'center',
    width: '100%',
  },
  dialog: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    elevation: 14,
    maxWidth: 440,
    padding: 22,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    width: '100%',
  },
  dialogIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 56,
    justifyContent: 'center',
    marginBottom: 15,
    width: 56,
  },
  dialogTitle: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  dialogCopy: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
    marginTop: 7,
    textAlign: 'center',
  },
  recordList: {
    alignSelf: 'stretch',
    borderRadius: 16,
    gap: 8,
    marginTop: 15,
    padding: 14,
  },
  recordItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  recordText: {
    fontSize: 13,
    fontWeight: '700',
  },
  fieldLabel: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.65,
    marginBottom: 8,
    marginTop: 15,
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
  error: {
    alignSelf: 'flex-start',
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  actions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
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
  dangerButton: {
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
  dangerButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.8,
  },
});
