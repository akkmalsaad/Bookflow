import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode, RefObject } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { useResponsive } from '@/lib/responsive';
import { useTranslation } from '@/lib/use-translation';

type Props = {
  /** Omit for a screen whose title already says everything the eyebrow would. */
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  /** Pinned under the scroll area, for a screen with one primary action. */
  footer?: ReactNode;
  /**
   * For a screen with text fields: the scroll area and the pinned footer rise with the keyboard so
   * the focused field and the primary action stay reachable. Off by default, so every existing
   * settings screen lays out exactly as before.
   */
  avoidKeyboard?: boolean;
  /** Lets a form scroll its own content, e.g. to bring a focused field clear of the keyboard. */
  scrollRef?: RefObject<ScrollView | null>;
};

/**
 * Shared scaffold for every screen behind a settings row: back button, the same header rhythm as
 * the settings hub, and a scroll area that respects the safe areas on both platforms.
 */
export function SettingsDetailScreen({ eyebrow, title, description, children, footer, avoidKeyboard = false, scrollRef }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  // Settings detail screens are mostly rows, toggles and prose, so they use the narrower reading
  // column rather than the full card column the dashboard gets.
  const { readingStyle, isPhone } = useResponsive();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={[styles.header, readingStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('a11y.goBack')}
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="chevron-back" size={21} color={palette.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          {eyebrow ? <Text style={[styles.eyebrow, { color: '#142A3A' }]}>{eyebrow}</Text> : null}
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        </View>
      </View>

      <KeyboardBody enabled={avoidKeyboard}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, readingStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps={avoidKeyboard ? 'handled' : undefined}
          keyboardDismissMode={avoidKeyboard ? (Platform.OS === 'ios' ? 'interactive' : 'on-drag') : undefined}>
          {description ? <Text style={[styles.description, { color: palette.muter }]}>{description}</Text> : null}
          {children}
        </ScrollView>

        {footer ? (
          <SafeAreaView
            edges={['bottom']}
            // The band's own inset moves onto the inner column on tablets, so the two do not stack.
            style={[styles.footer, !isPhone && styles.footerBleed, { borderTopColor: soft.divider }]}>
            {/* The hairline stays edge to edge; only the control inside it follows the column. */}
            <View style={readingStyle}>{footer}</View>
          </SafeAreaView>
        ) : null}
      </KeyboardBody>
    </SafeAreaView>
  );
}

/** Same keyboard behaviour as the sign-in screens (AuthUI), only when a screen opts in. */
function KeyboardBody({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardBody}>
      {children}
    </KeyboardAvoidingView>
  );
}

/** A short informational note explaining how a setting or screen works. */
export function SettingsNotice({ title, body, items }: { title: string; body: string; items?: string[] }) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <View style={[styles.notice, { backgroundColor: soft.surface, borderColor: soft.border }]}>
      <View style={styles.noticeHeader}>
        <Ionicons name="information-circle-outline" size={18} color={palette.accent} />
        <Text style={[styles.noticeTitle, { color: palette.text }]}>{title}</Text>
      </View>
      <Text style={[styles.noticeBody, { color: palette.muter }]}>{body}</Text>
      {items?.length ? (
        <View style={styles.noticeList}>
          {items.map((item) => (
            <View key={item} style={styles.noticeItem}>
              <View style={[styles.noticeBullet, { backgroundColor: palette.muter }]} />
              <Text style={[styles.noticeItemText, { color: palette.muter }]}>{item}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Read-only label/value pair for facts the app knows but does not let you change yet. */
export function SettingsInfoRow({ label, value }: { label: string; value: string }) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <View style={[styles.infoRow, { backgroundColor: soft.inset }]}>
      <Text style={[styles.infoLabel, { color: palette.muter }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: palette.text }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/** Selectable option row, e.g. Light / Dark / System or a currency. */
export function SettingsOptionRow({
  title,
  subtitle,
  selected,
  onPress,
  disabled = false,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        { backgroundColor: soft.surface, borderColor: selected ? palette.accent : soft.border },
        pressed && styles.pressed,
        disabled && styles.optionDisabled,
      ]}>
      <View style={styles.optionCopy}>
        <Text style={[styles.optionTitle, { color: palette.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.optionSubtitle, { color: palette.muter }]}>{subtitle}</Text> : null}
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={21}
        color={selected ? palette.accent : palette.muter}
      />
    </Pressable>
  );
}

export const settingsDetailStyles = StyleSheet.create({
  groupLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginBottom: 10,
    marginTop: 22,
    paddingHorizontal: 4,
    textTransform: 'uppercase',
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 17,
    elevation: 5,
    justifyContent: 'center',
    minHeight: 52,
    shadowOffset: { height: 7, width: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  keyboardBody: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    elevation: 4,
    height: 44,
    justifyContent: 'center',
    marginRight: 14,
    shadowOffset: { height: 6, width: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    width: 44,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  content: {
    paddingBottom: 44,
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 13.5,
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 20,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  footerBleed: {
    paddingHorizontal: 0,
  },
  notice: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  noticeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  noticeTitle: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '800',
  },
  noticeBody: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  noticeList: {
    gap: 7,
    marginTop: 13,
  },
  noticeItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  noticeBullet: {
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  noticeItemText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  infoRow: {
    borderRadius: 16,
    marginBottom: 8,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.55,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  option: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1.5,
    flexDirection: 'row',
    marginBottom: 10,
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  optionCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  optionSubtitle: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 3,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
});
