import { StyleSheet, Text, View } from 'react-native';

import type { Invoice } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

/**
 * Compact status pill for the invoice list.
 *
 * Screen-local on purpose: the shared `StatusPill` is used by seven other screens, and refining it
 * here would have changed all of them. Same status values, same meaning — only the presentation is
 * tightened for this card.
 */
export function InvoiceStatusBadge({ status }: { status: Invoice['status'] }) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);

  const tone =
    status === 'Paid'
      ? { bg: isDarkMode ? '#12362B' : '#E7F7EF', fg: palette.success }
      : status === 'Overdue' || status === 'Partially Paid'
        ? { bg: isDarkMode ? '#3A2E12' : '#FDF3E2', fg: palette.warning }
        : status === 'Declined' || status === 'Cancelled' || status === 'Void'
          ? { bg: isDarkMode ? '#3B1F2B' : '#FDECEC', fg: palette.danger }
          : status === 'Accepted' || status === 'Sent'
            ? { bg: isDarkMode ? '#29284B' : '#EEF0FE', fg: palette.accent }
            : { bg: isDarkMode ? '#1E293B' : '#F1F3F7', fg: palette.muter };

  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.label, { color: tone.fg }]} numberOfLines={1}>
        {status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: 11,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
