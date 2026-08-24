import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppPalette } from '@/context/theme-context';

type Props = {
  value: string;
  onChange: (date: string) => void;
  isDarkMode: boolean;
  palette: AppPalette;
};

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function formatDisplayDate(key: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(parseDateKey(key));
}

export function DatePickerField({ value, onChange, isDarkMode, palette }: Props) {
  const [visible, setVisible] = useState(false);
  const selectedDate = useMemo(() => parseDateKey(value), [value]);
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';
  const todayKey = toDateKey(new Date());

  const open = () => {
    setViewYear(selectedDate.getFullYear());
    setViewMonth(selectedDate.getMonth());
    setVisible(true);
  };

  const goToMonth = (offset: number) => {
    const next = new Date(viewYear, viewMonth + offset, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const weeks = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const gridStart = new Date(viewYear, viewMonth, 1 - firstOfMonth.getDay());

    return Array.from({ length: 6 }, (_, weekIndex) =>
      Array.from({ length: 7 }, (_, dayIndex) => {
        const cellDate = new Date(
          gridStart.getFullYear(),
          gridStart.getMonth(),
          gridStart.getDate() + weekIndex * 7 + dayIndex,
        );
        return {
          date: cellDate,
          key: toDateKey(cellDate),
          inMonth: cellDate.getMonth() === viewMonth,
        };
      }),
    );
  }, [viewYear, viewMonth]);

  const selectDay = (key: string) => {
    onChange(key);
    setVisible(false);
  };

  return (
    <>
      <Pressable
        onPress={open}
        style={[styles.trigger, { backgroundColor: softInset, borderColor: softBorder }]}
        accessibilityRole="button"
        accessibilityLabel="Select date">
        <Ionicons name="calendar-outline" size={17} color={palette.muter} />
        <Text style={[styles.triggerText, { color: palette.text }]}>{formatDisplayDate(value)}</Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable
            style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}
            onPress={(event) => event.stopPropagation()}>
            <View style={styles.header}>
              <Pressable
                onPress={() => goToMonth(-1)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                style={[styles.navButton, { backgroundColor: softInset }]}>
                <Ionicons name="chevron-back" size={18} color={palette.text} />
              </Pressable>
              <Text style={[styles.headerTitle, { color: palette.text }]}>
                {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(viewYear, viewMonth, 1))}
              </Text>
              <Pressable
                onPress={() => goToMonth(1)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Next month"
                style={[styles.navButton, { backgroundColor: softInset }]}>
                <Ionicons name="chevron-forward" size={18} color={palette.text} />
              </Pressable>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((label) => (
                <Text key={label} style={[styles.weekdayLabel, { color: palette.muter }]}>
                  {label}
                </Text>
              ))}
            </View>

            {weeks.map((week, weekIndex) => (
              <View key={weekIndex} style={styles.weekRow}>
                {week.map((cell) => {
                  const isSelected = cell.key === value;
                  const isToday = cell.key === todayKey;
                  return (
                    <Pressable
                      key={cell.key}
                      onPress={() => selectDay(cell.key)}
                      style={styles.dayCell}
                      accessibilityRole="button"
                      accessibilityLabel={cell.key}>
                      <View
                        style={[
                          styles.dayCircle,
                          !isSelected && isToday && { borderWidth: 1.5, borderColor: palette.accent },
                          isSelected && { backgroundColor: palette.accent },
                        ]}>
                        <Text
                          style={[
                            styles.dayText,
                            { color: palette.text },
                            !cell.inMonth && styles.dayTextDim,
                            isSelected && styles.dayTextSelected,
                          ]}>
                          {cell.date.getDate()}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <Pressable onPress={() => selectDay(todayKey)} style={[styles.todayButton, { backgroundColor: softInset }]}>
              <Text style={[styles.todayButtonText, { color: palette.accent }]}>Today</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  triggerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dayTextDim: {
    opacity: 0.35,
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  todayButton: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 13,
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
