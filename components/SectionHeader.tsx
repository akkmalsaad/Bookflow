import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getThemePalette, useTheme } from '@/context/theme-context';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  /** Ionicons outline name, matching the family the booking card's metadata rows already use. */
  icon: IoniconName;
  /** Small label above the title, for a heading whose title is the stronger value (e.g. a date). */
  eyebrow?: string;
  title: string;
  /** Optional second line, kept visually stronger than the label above it where used. */
  subtitle?: string;
  /** Count pill, link, or any trailing control the section already had. */
  rightElement?: ReactNode;
  /**
   * Reserved for a section that genuinely is the active one. Default is neutral grey — the icon is
   * the quietest element in the header, never the loudest.
   */
  tone?: 'neutral' | 'accent';
};

/**
 * A section heading with a small outline icon sitting directly beside it: no tinted container, no
 * fill, no shadow.
 *
 * Sizing and colour follow the booking card's metadata rows (16pt outline, `palette.muter`), scaled
 * up just enough for a heading. Icon and title read as one unit and share a baseline, and the icon
 * stays the quietest element — content first, heading second, icon last.
 */
export function SectionHeader({ icon, eyebrow, title, subtitle, rightElement, tone = 'neutral' }: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);

  return (
    <View style={styles.header}>
      <View style={styles.titleGroup}>
        <Ionicons
          name={icon}
          size={20}
          color={tone === 'accent' ? palette.accent : palette.muter}
          // The heading already names the section; the glyph is decoration for sighted scanning.
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={styles.icon}
        />
        <View style={styles.copy}>
          {eyebrow ? (
            <Text style={[styles.eyebrow, { color: palette.muter }]} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: palette.muter }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {rightElement}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  titleGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    minWidth: 0,
  },
  icon: {
    // Optical centring: the glyph box sits a hair low against a bold cap-height title.
    marginRight: 8,
    marginTop: -1,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.25,
  },
  subtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 2,
  },
});
