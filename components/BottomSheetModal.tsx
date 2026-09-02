import type { ReactNode } from 'react';
import { Keyboard, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDoneButton } from '@/components/KeyboardDoneButton';
import { useModalTransition } from '@/components/modal-transition';
import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';

const OPEN_MS = 300;
const CLOSE_MS = 240;

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Share of the screen the sheet may grow to before its content scrolls. */
  heightRatio?: number;
  /** Fires once the sheet has finished sliding away, for handing off to a follow-up sheet. */
  onClosed?: () => void;
};

/**
 * The app's bottom sheet: dimmed backdrop that fades in while the sheet slides up from below the
 * viewport, rounded top corners, and a drag handle. It runs the same transition as the payment
 * modals — only the travel distance and curve differ, since a full-width sheet reads better on a
 * timing curve than a spring.
 *
 * Closing is driven by `visible` going false, so callers close it exactly as they would an
 * unanimated modal and the sheet unmounts itself once it has slid away.
 */
export function BottomSheetModal({ visible, onClose, children, heightRatio = 0.92, onClosed }: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  // Derived from the live window, never a fixed pixel height, and additionally capped so the sheet
  // can never reach under the status bar on a tall device.
  const sheetMaxHeight = Math.min(screenHeight * heightRatio, screenHeight - insets.top - 12);
  const { mounted, overlayStyle, contentStyle, guard } = useModalTransition({
    visible,
    // Starting a full screen height down guarantees the sheet begins fully off-screen.
    offset: screenHeight,
    motion: 'timing',
    openDuration: OPEN_MS,
    closeDuration: CLOSE_MS,
    // The sheet travels as one piece rather than fading its content in separately.
    fadeContent: false,
    onClosed,
  });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={guard(onClose)}>
      <View style={styles.root} pointerEvents={visible ? 'auto' : 'none'}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]} />
        {/* Matches the app's other sheets: tapping outside puts the keyboard away, it does not close. */}
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={Keyboard.dismiss}
          style={StyleSheet.absoluteFill}
        />

        {/* The sheet stays anchored to the bottom whether or not the keyboard is up; only the
            scroll area inside it reacts. */}
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow, maxHeight: sheetMaxHeight },
            contentStyle,
          ]}>
          <View style={[styles.handle, { backgroundColor: palette.border }]} />
          {children}
        </Animated.View>

        <KeyboardDoneButton />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
  },
  sheet: {
    flexShrink: 1,
    width: '100%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    elevation: 14,
    paddingHorizontal: 20,
    paddingTop: 10,
    shadowOffset: { height: -8, width: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 24,
  },
  handle: {
    alignSelf: 'center',
    borderRadius: 3,
    height: 5,
    marginBottom: 10,
    width: 42,
  },
});
