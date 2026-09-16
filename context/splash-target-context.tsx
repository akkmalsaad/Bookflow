import { usePathname } from 'expo-router';
import { createContext, useCallback, useContext, useRef } from 'react';
import { View } from 'react-native';

export type SplashTarget = { x: number; y: number; size: number };
export const SplashTargetContext = createContext<((pathname: string, target: SplashTarget) => void) | null>(null);

/** Measure the existing logo's slot, including safe-area and responsive offsets. */
export function useSplashTarget() {
  const reportTarget = useContext(SplashTargetContext);
  const pathname = usePathname();
  const ref = useRef<View>(null);
  const onLayout = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        reportTarget?.(pathname, { x: x + width / 2, y: y + height / 2, size: width });
      }
    });
  }, [pathname, reportTarget]);

  return { ref, onLayout, collapsable: false as const };
}
