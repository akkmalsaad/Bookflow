import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BookingFormColors } from '@/components/booking/booking-form-styles';
import type { Booking } from '@/context/app-data-context';
import { formatTime } from '@/components/booking/EventTimePicker';
import type { ScheduleConflict } from '@/lib/booking-conflicts';
import { useTranslation } from '@/lib/use-translation';

type Props = {
  conflicts: ScheduleConflict<Booking>[];
  override: boolean;
  onOverrideChange: (value: boolean) => void;
  colors: BookingFormColors;
  formatDate: (date: string) => string;
};

/**
 * Names every booking the chosen time clashes with, and lets the owner deliberately keep both.
 * A real overlap needs that explicit "Book anyway"; a clash with buffer time only is a warning.
 */
export function ScheduleConflictNotice({ conflicts, override, onOverrideChange, colors, formatDate }: Props) {
  const { t } = useTranslation();
  if (conflicts.length === 0) return null;
  const { palette } = colors;
  const hasOverlap = conflicts.some((item) => item.kind === 'overlap');
  const amber = '#B26C00';

  return (
    <View accessibilityRole="alert" style={[styles.card, { borderColor: hasOverlap ? '#DC2626' : amber, backgroundColor: hasOverlap ? 'rgba(220, 38, 38, 0.08)' : 'rgba(245, 158, 11, 0.1)' }]}>
      <View style={styles.header}>
        <Ionicons name="warning-outline" size={17} color={hasOverlap ? '#DC2626' : amber} />
        <Text style={[styles.title, { color: palette.text }]}>{t('bm.conflict.title')}</Text>
      </View>
      {conflicts.slice(0, 4).map(({ booking, kind }) => {
        const start = booking.startTime ?? booking.time;
        const time = start ? `${formatTime(start)}${booking.endTime ? ` – ${formatTime(booking.endTime)}` : ''}` : '';
        return (
          <Text key={booking.id} style={[styles.line, { color: palette.text }]}>
            • {t(kind === 'overlap' ? 'bm.conflict.overlap' : 'bm.conflict.buffer', { title: booking.title, date: formatDate(booking.date), time })}
          </Text>
        );
      })}
      {hasOverlap ? (
        <>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: override }}
            onPress={() => onOverrideChange(!override)}
            style={({ pressed }) => [styles.override, pressed && { opacity: 0.7 }]}>
            <Ionicons name={override ? 'checkbox' : 'square-outline'} size={20} color={override ? palette.accent : palette.muter} />
            <Text style={[styles.overrideText, { color: palette.text }]}>{t('bm.conflict.override')}</Text>
          </Pressable>
          {!override ? <Text style={[styles.hint, { color: palette.muter }]}>{t('bm.conflict.hint')}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  title: { fontSize: 13, fontWeight: '800' },
  line: { fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  override: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, minHeight: 32 },
  overrideText: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 11.5, lineHeight: 16, marginTop: 2 },
});
