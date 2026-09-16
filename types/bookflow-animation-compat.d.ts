import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue as ReanimatedSharedValue } from 'react-native-reanimated';
import 'react-native-reanimated/lib/typescript/Animated';
import 'react-native-svg';

// The supplied brand components use the older Animated.SharedValue spelling.
// Keep them unchanged; this alias only affects TypeScript, never animation code.
declare module 'react-native-reanimated/lib/typescript/Animated' {
  export type SharedValue<Value> = ReanimatedSharedValue<Value>;
}

// SVG's Path renderer flattens props.style at runtime, but PolygonProps omits it.
// Reanimated supplies that style for the supplied folding facets.
declare module 'react-native-svg' {
  interface PolygonProps {
    style?: StyleProp<ViewStyle>;
  }
}
