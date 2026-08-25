import { Ionicons } from '@expo/vector-icons';
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';

export const TRANSACTION_KEYBOARD_ACCESSORY_ID = 'transaction-keyboard-accessory';
export const PAYMENT_KEYBOARD_ACCESSORY_ID = 'payment-keyboard-accessory';

type Props = {
  nativeID: string;
  accessibilityLabel?: string;
};

/**
 * The checkmark button that finishes numeric keyboard input. It only dismisses the keyboard —
 * saving stays with the form's own button. iOS only; Android keyboards have their own dismiss key.
 */
export function KeyboardDoneAccessory({ nativeID, accessibilityLabel = 'Close keyboard' }: Props) {
  if (Platform.OS !== 'ios') return null;

  return (
    <InputAccessoryView nativeID={nativeID} backgroundColor="transparent" style={styles.host}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          hitSlop={8}
          onPress={Keyboard.dismiss}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Ionicons name="checkmark" size={27} color="#FFFFFF" />
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  host: {
    backgroundColor: 'transparent',
  },
  bar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  button: {
    width: 58,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.34,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.94 }],
  },
});
