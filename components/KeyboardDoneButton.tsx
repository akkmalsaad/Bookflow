import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';

/**
 * The floating checkmark that finishes keyboard input inside a modal. It only dismisses the
 * keyboard — saving stays with the form's own buttons.
 *
 * Drop one into the full-screen container inside a modal. It positions itself above the keyboard
 * and renders nothing while the keyboard is closed, so it never takes part in the form layout.
 */
export function KeyboardDoneButton({ accessibilityLabel = 'Close keyboard' }: { accessibilityLabel?: string }) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // iOS reports the keyboard before it animates, so the button rides up with it.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => setKeyboardHeight(event.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (keyboardHeight === 0) return null;

  // Android resizes the window for the keyboard, so its bottom edge already sits above it.
  const bottom = Platform.OS === 'ios' ? keyboardHeight + 16 : 16;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={8}
        onPress={Keyboard.dismiss}
        style={({ pressed }) => [styles.button, { bottom }, pressed && styles.pressed]}>
        <Ionicons name="checkmark" size={27} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 20,
    elevation: 5,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: 24,
    shadowColor: '#1D4ED8',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.34,
    shadowRadius: 8,
    width: 58,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.94 }],
  },
});
