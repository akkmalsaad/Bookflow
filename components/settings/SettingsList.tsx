import { Ionicons } from '@expo/vector-icons';
import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ProBadge } from '@/components/ProBadge';
import {
  getSoftTokens,
  SETTINGS_ICON_BACKGROUND_COLOR,
  SETTINGS_ICON_STROKE_COLOR,
} from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/** Uppercase group heading plus the rounded Soft UI container holding the rows. */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.muter }]}>{title}</Text>
      <View
        style={[
          styles.group,
          { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow },
        ]}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: soft.divider }]} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

/** The rounded-square icon tile used at the start of every row. */
export function SettingsIcon({ name }: { name: IoniconName }) {
  return (
    <View style={[styles.icon, { backgroundColor: SETTINGS_ICON_BACKGROUND_COLOR }]}>
      <Ionicons name={name} size={19} color={SETTINGS_ICON_STROKE_COLOR} />
    </View>
  );
}

/** Muted right-aligned current value, e.g. "System" or "MYR · Malaysia". */
export function SettingsValue({ children }: { children: ReactNode }) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);

  return (
    <Text numberOfLines={1} style={[styles.value, { color: palette.muter }]}>
      {children}
    </Text>
  );
}

type RowProps = {
  icon: IoniconName;
  title: string;
  subtitle?: string;
  value?: string;
  /** Marks a Pro feature with the shared badge, in the value position. */
  proBadge?: boolean;
  onPress?: () => void;
  /** Rows without a destination still render, dimmed and unpressable. */
  disabled?: boolean;
  showChevron?: boolean;
  accessibilityHint?: string;
};

export function SettingsRow({
  icon,
  title,
  subtitle,
  value,
  proBadge = false,
  onPress,
  disabled = false,
  showChevron = true,
  accessibilityHint,
}: RowProps) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const hint = accessibilityHint ?? ([subtitle, value, proBadge && 'Pro'].filter(Boolean).join(' · ') || undefined);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      accessibilityState={{ disabled: disabled || !onPress }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        subtitle ? styles.rowWithSubtitle : null,
        pressed && { backgroundColor: soft.inset },
        disabled && styles.rowDisabled,
      ]}>
      <SettingsIcon name={icon} />
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: palette.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: palette.muter }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? <SettingsValue>{value}</SettingsValue> : null}
      {proBadge ? <ProBadge style={styles.proBadge} /> : null}
      {showChevron ? <Ionicons name="chevron-forward" size={17} color={palette.muter} style={styles.chevron} /> : null}
    </Pressable>
  );
}

/** A row with the same layout as SettingsRow, ending in a switch instead of a chevron. */
export function SettingsToggleRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  disabled = false,
}: {
  icon: IoniconName;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <View style={[styles.row, subtitle ? styles.rowWithSubtitle : null]}>
      <SettingsIcon name={icon} />
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: palette.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: palette.muter }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={title}
        accessibilityHint={subtitle}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ true: palette.accent, false: soft.divider }}
        style={styles.toggle}
      />
    </View>
  );
}

/** Destructive row: red icon and label on the same calm surface as everything else. */
export function DangerActionRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: IoniconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        subtitle ? styles.rowWithSubtitle : null,
        pressed && { backgroundColor: soft.inset },
      ]}>
      <SettingsIcon name={icon} />
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: palette.danger }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: palette.muter }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 26,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginBottom: 10,
    paddingHorizontal: 4,
    textTransform: 'uppercase',
  },
  group: {
    borderRadius: 22,
    borderWidth: 1,
    elevation: 3,
    overflow: 'hidden',
    shadowOffset: { height: 7, width: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 68,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowWithSubtitle: {
    minHeight: 76,
  },
  toggle: {
    marginLeft: 12,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  icon: {
    alignItems: 'center',
    borderRadius: 13,
    height: 38,
    justifyContent: 'center',
    marginRight: 14,
    width: 38,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  rowSubtitle: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 3,
  },
  value: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 10,
    maxWidth: 150,
    textAlign: 'right',
  },
  proBadge: {
    marginLeft: 10,
  },
  chevron: {
    marginLeft: 6,
  },
});
