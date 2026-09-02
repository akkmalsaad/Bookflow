import { Ionicons } from '@expo/vector-icons';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export type InvoiceActionSheetItem = {
  key: string;
  icon: IoniconName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Draws the hairline that separates the safe actions from the destructive one. */
  separatedAbove?: boolean;
  accessibilityHint?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  items: InvoiceActionSheetItem[];
  /** Fires once the menu has finished closing, so a follow-up sheet can open cleanly after it. */
  onClosed?: () => void;
};

/**
 * The ••• overflow menu for an invoice. A plain BookFlow bottom sheet holding one column of rows,
 * with the destructive action kept below a divider so it is never the row a stray tap lands on.
 */
export function InvoiceActionSheet({ visible, onClose, title, subtitle, items, onClosed }: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const insets = useSafeAreaInsets();

  return (
    <BottomSheetModal visible={visible} onClose={onClose} heightRatio={0.72} onClosed={onClosed}>
      <>
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: palette.muter }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.list}>
          {items.map((item) => (
            <Fragment key={item.key}>
              {item.separatedAbove ? <View style={[styles.divider, { backgroundColor: soft.divider }]} /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityHint={item.accessibilityHint}
                accessibilityState={{ disabled: Boolean(item.disabled) }}
                disabled={item.disabled}
                onPress={item.onPress}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: soft.inset },
                  item.disabled && styles.disabled,
                ]}>
                <View
                  style={[
                    styles.iconTile,
                    { backgroundColor: item.destructive ? soft.dangerSoft : soft.accentSoft },
                  ]}>
                  <Ionicons
                    name={item.icon}
                    size={19}
                    color={item.destructive ? palette.danger : palette.accent}
                  />
                </View>
                <Text
                  style={[styles.rowLabel, { color: item.destructive ? palette.danger : palette.text }]}
                  numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            </Fragment>
          ))}
        </View>

        <View style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              { backgroundColor: soft.inset, borderColor: soft.border },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.closeText, { color: palette.text }]}>Cancel</Text>
          </Pressable>
        </View>
      </>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 12,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  list: {
    marginBottom: 6,
  },
  row: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    minHeight: 60,
    paddingHorizontal: 8,
  },
  iconTile: {
    alignItems: 'center',
    borderRadius: 13,
    height: 38,
    justifyContent: 'center',
    marginRight: 14,
    width: 38,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 8,
    marginVertical: 7,
  },
  disabled: {
    opacity: 0.45,
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 52,
  },
  closeText: {
    fontSize: 15,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.8,
  },
});
