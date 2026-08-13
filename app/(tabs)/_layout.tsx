import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/theme-context';

type TabIconName = React.ComponentProps<typeof Ionicons>['name'];

type MirrorTabIconProps = {
  activeName: TabIconName;
  color: string;
  focused: boolean;
  inactiveName: TabIconName;
  size: number;
};

function MirrorTabIcon({
  activeName,
  color,
  focused,
  inactiveName,
  size,
}: MirrorTabIconProps) {
  const lift = React.useRef(new Animated.Value(focused ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.spring(lift, {
      toValue: focused ? 1 : 0,
      speed: 18,
      bounciness: 7,
      useNativeDriver: true,
    }).start();
  }, [focused, lift]);

  const iconTransform = {
    transform: [
      {
        translateY: lift.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -7],
        }),
      },
      {
        scale: lift.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.08],
        }),
      },
    ],
  };

  return (
    <View style={styles.iconStage}>
      <Animated.View style={iconTransform}>
        <Ionicons name={focused ? activeName : inactiveName} size={size} color={color} />
      </Animated.View>
    </View>
  );
}

export default function TabLayout() {
  const { isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const tabSceneStyleInterpolator = React.useCallback(
    ({ current }: { current: { progress: Animated.AnimatedInterpolation<number> } }) => ({
      sceneStyle: {
        transform: [
          {
            translateX: current.progress.interpolate({
              inputRange: [-1, 0, 1],
              outputRange: [-screenWidth, 0, screenWidth],
            }),
          },
        ],
      },
    }),
    [screenWidth]
  );

  const palette = isDarkMode
    ? {
        active: '#E2E8F0',
        inactive: '#94A3B8',
        border: 'rgba(255, 255, 255, 0.24)',
        glass: 'rgba(15, 23, 42, 0.30)',
        highlight: 'rgba(255, 255, 255, 0.32)',
        shadow: '#020617',
      }
    : {
        active: '#111827',
        inactive: '#6B7280',
        border: 'rgba(255, 255, 255, 0.92)',
        glass: 'rgba(255, 255, 255, 0.32)',
        highlight: 'rgba(255, 255, 255, 0.96)',
        shadow: '#111827',
      };

  const safeBottomOffset = Math.max(10, insets.bottom);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: palette.active,
        tabBarInactiveTintColor: palette.inactive,
        tabBarBackground: () => (
          <View style={styles.mirrorBackground}>
            <BlurView
              experimentalBlurMethod="dimezisBlurView"
              intensity={70}
              tint={isDarkMode ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.glass }]} />
            <View style={[styles.mirrorHighlight, { backgroundColor: palette.highlight }]} />
          </View>
        ),
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: safeBottomOffset,
          height: 68,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: 30,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: 'transparent',
          shadowColor: palette.shadow,
          shadowOpacity: isDarkMode ? 0.34 : 0.14,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 10 },
          elevation: 10,
        },
        tabBarItemStyle: {
          borderRadius: 16,
          marginHorizontal: 4,
        },
        sceneStyleInterpolator: tabSceneStyleInterpolator,
        transitionSpec: {
          animation: 'timing',
          config: {
            duration: 280,
            easing: Easing.out(Easing.cubic),
          },
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused, size, color }) => (
            <MirrorTabIcon
              activeName="home"
              color={color}
              focused={focused}
              inactiveName="home-outline"
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          tabBarIcon: ({ focused, size, color }) => (
            <MirrorTabIcon
              activeName="calendar"
              color={color}
              focused={focused}
              inactiveName="calendar-outline"
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          tabBarIcon: ({ focused, size, color }) => (
            <MirrorTabIcon
              activeName="people"
              color={color}
              focused={focused}
              inactiveName="people-outline"
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          tabBarIcon: ({ focused, size, color }) => (
            <MirrorTabIcon
              activeName="receipt"
              color={color}
              focused={focused}
              inactiveName="receipt-outline"
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          tabBarIcon: ({ focused, size, color }) => (
            <MirrorTabIcon
              activeName="wallet"
              color={color}
              focused={focused}
              inactiveName="wallet-outline"
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused, size, color }) => (
            <MirrorTabIcon
              activeName="settings"
              color={color}
              focused={focused}
              inactiveName="settings-outline"
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconStage: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mirrorBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    overflow: 'hidden',
  },
  mirrorHighlight: {
    position: 'absolute',
    top: 1,
    left: 22,
    right: 22,
    height: 1,
    borderRadius: 1,
  },
});
