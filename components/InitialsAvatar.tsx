import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { getInitials } from '@/lib/customer-metrics';

type InitialsAvatarProps = {
  name: string;
  size?: number;
  backgroundColor: string;
  color: string;
  style?: StyleProp<ViewStyle>;
};

export function InitialsAvatar({ name, size = 46, backgroundColor, color, style }: InitialsAvatarProps) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size * 0.34, backgroundColor },
        style,
      ]}>
      <Text style={[styles.text, { color, fontSize: size * 0.36 }]}>{getInitials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
