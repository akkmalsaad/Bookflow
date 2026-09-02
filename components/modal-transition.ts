import { useCallback, useEffect, useRef, useState } from 'react';
import { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
export const EASE_IN = Easing.bezier(0.4, 0, 1, 1);

const REDUCED_FADE_MS = 160;

type Options = {
  visible: boolean;
  /** How far below its resting place the content starts. A sheet uses its own height. */
  offset: number;
  /** Springs suit a small card; a full-width sheet reads better on a timing curve. */
  motion?: 'spring' | 'timing';
  openDuration?: number;
  closeDuration?: number;
  /** Sheets slide as one piece, so they opt out of fading their content with the backdrop. */
  fadeContent?: boolean;
  /**
   * Fires once the exit has finished and the content has unmounted. Lets a caller hand off to a
   * second modal without presenting it while this one is still on screen.
   */
  onClosed?: () => void;
};

/**
 * The one enter/exit transition behind every BookFlow modal: the backdrop fades while the content
 * rises from below, and the reverse on close.
 *
 * Closing is driven by `visible` going false — the caller closes the modal exactly as it would
 * without any animation, and `mounted` stays true just long enough for the exit to finish.
 */
export function useModalTransition({
  visible,
  offset,
  motion = 'spring',
  openDuration = 260,
  closeDuration = 220,
  fadeContent = true,
  onClosed,
}: Options) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(reduced ? 0 : offset);
  const fade = useSharedValue(0);
  // Held in a ref so an inline callback cannot restart the transition by changing identity.
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  const finishClose = useCallback(() => {
    setMounted(false);
    onClosedRef.current?.();
  }, []);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;

    if (visible) {
      // A fully closed sheet may still be parked at 0 if Reduce Motion was on for the last close.
      if (!reduced && fade.get() === 0) translateY.set(offset);
      fade.set(withTiming(1, { duration: reduced ? REDUCED_FADE_MS : openDuration, easing: EASE_OUT }));
      // Reduced motion keeps the content still and lets the fade carry the transition.
      translateY.set(
        reduced
          ? 0
          : motion === 'spring'
            ? withSpring(0, { damping: 22, stiffness: 220, mass: 0.8 })
            : withTiming(0, { duration: openDuration, easing: EASE_OUT }),
      );
      return;
    }

    const duration = reduced ? REDUCED_FADE_MS : closeDuration;
    if (reduced) translateY.set(0);
    else translateY.set(withTiming(offset, { duration, easing: EASE_IN }));
    fade.set(
      withTiming(0, { duration, easing: EASE_IN }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(finishClose);
      }),
    );
  }, [visible, mounted, reduced, offset, motion, openDuration, closeDuration, fade, finishClose, translateY]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: fadeContent || reduced ? fade.get() : 1,
    transform: [{ translateY: translateY.get() }],
  }));

  /**
   * While the content is sliding out the caller has already closed: swallow taps so a second press
   * cannot fire the same action again.
   */
  const guard = (action: () => void) => () => {
    if (!visible) return;
    action();
  };

  return { mounted, overlayStyle, contentStyle, guard };
}
