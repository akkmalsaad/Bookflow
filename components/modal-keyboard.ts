import { Platform } from 'react-native';

/**
 * The one keyboard contract for every BookFlow modal: the sheet itself never moves when the
 * keyboard opens. No modal wraps its content in a KeyboardAvoidingView — instead the keyboard
 * simply covers the bottom of the screen and only the scroll area inside the modal adapts.
 *
 * Spread onto the scroll view inside any modal so all of them behave identically.
 */
export const modalScrollProps = {
  keyboardShouldPersistTaps: 'handled',
  keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
  // iOS: insets the scroll area by however much the keyboard overlaps it, so the focused field can
  // be scrolled into view without shifting the modal. Android resizes the window instead.
  automaticallyAdjustKeyboardInsets: true,
  showsVerticalScrollIndicator: false,
} as const;
