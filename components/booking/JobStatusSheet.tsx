import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';
import {
  BOOKING_STATUS_ORDER,
  getBookingStatusVisual,
  resolveBookingStatus,
  type BookingStatus,
} from '@/lib/booking-status';

type Props = {
  visible: boolean;
  /** The booking's current status; drives which row reads as selected. */
  status: string | null | undefined;
  /** Named in the confirmation so a destructive change says which booking it applies to. */
  bookingTitle?: string;
  onSelect: (status: BookingStatus) => void;
  onClose: () => void;
};

/**
 * Job status picker. Five rows in one BookFlow bottom sheet, with the current status checked.
 *
 * Cancelling is held back behind a second sheet: choosing it closes this one and, only once it has
 * finished sliding away, opens the confirmation — two native modals must never be on screen at
 * once. Nothing is written until that confirmation is accepted.
 */
export function JobStatusSheet({ visible, status, bookingTitle, onSelect, onClose }: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const insets = useSafeAreaInsets();
  const selected = resolveBookingStatus(status);
  const [pendingDestructive, setPendingDestructive] = useState<BookingStatus | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  // The picker steps aside for the confirmation without ending the flow, so the caller keeps the
  // booking selected the whole way through and the confirmed change still knows what to apply to.
  const isPickerVisible = visible && !pendingDestructive && !showConfirm;

  // A fresh opening never inherits a half-finished confirmation from the previous one.
  useEffect(() => {
    if (!visible) {
      setPendingDestructive(null);
      setShowConfirm(false);
    }
  }, [visible]);

  const handleRowPress = (next: BookingStatus, destructive: boolean) => {
    if (destructive && next !== selected) {
      // Nothing is written yet — this only hides the picker so the confirmation can take over.
      setPendingDestructive(next);
      return;
    }

    Haptics.selectionAsync().catch(() => {});
    onSelect(next);
  };

  const dismissConfirm = () => {
    setShowConfirm(false);
    setPendingDestructive(null);
    onClose();
  };

  const confirmDestructive = () => {
    if (!pendingDestructive) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    // Local state first: onSelect closes the flow from the caller's side, and the confirmation
    // still needs to play its exit rather than being torn off screen.
    setShowConfirm(false);
    setPendingDestructive(null);
    onSelect(pendingDestructive);
  };

  const confirmVisual = getBookingStatusVisual('Cancelled', isDarkMode);

  return (
    <>
      <BottomSheetModal
        visible={isPickerVisible}
        onClose={onClose}
        heightRatio={0.8}
        onClosed={() => {
          // Handed over only after this sheet is gone, so the two never overlap.
          if (pendingDestructive) setShowConfirm(true);
        }}>
        <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: palette.text }]}>Update Job Status</Text>
            {bookingTitle ? (
              <Text style={[styles.subtitle, { color: palette.muter }]} numberOfLines={1}>
                {bookingTitle}
              </Text>
            ) : null}
          </View>

          <View accessibilityRole="radiogroup">
            {BOOKING_STATUS_ORDER.map((option) => {
              const visual = getBookingStatusVisual(option, isDarkMode);
              const isSelected = option === selected;

              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityLabel={visual.label}
                  accessibilityState={{ selected: isSelected }}
                  accessibilityHint={
                    visual.destructive ? 'Asks you to confirm before cancelling the booking' : undefined
                  }
                  onPress={() => handleRowPress(option, visual.destructive)}
                  style={({ pressed }) => [
                    styles.row,
                    isSelected && { backgroundColor: soft.inset },
                    pressed && styles.pressed,
                  ]}>
                  <View style={[styles.rowIcon, { backgroundColor: visual.colors.tint }]}>
                    <Ionicons name={visual.icon} size={18} color={visual.colors.text} />
                  </View>
                  <Text
                    style={[styles.rowLabel, { color: isSelected ? palette.text : palette.muter }]}
                    numberOfLines={1}>
                    {visual.label}
                  </Text>
                  {isSelected ? <Ionicons name="checkmark" size={20} color={palette.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </BottomSheetModal>

      <BottomSheetModal visible={showConfirm} onClose={dismissConfirm} heightRatio={0.6}>
        <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.header}>
            <Text style={[styles.eyebrow, { color: palette.danger }]}>Cancel</Text>
            <Text style={[styles.title, { color: palette.text }]}>Cancel this booking?</Text>
          </View>

          <View style={[styles.confirmNote, { backgroundColor: confirmVisual.colors.tint }]}>
            <Ionicons name="information-circle-outline" size={17} color={confirmVisual.colors.text} />
            <Text style={[styles.confirmNoteText, { color: palette.text }]}>
              The booking will remain in your records, but its job status will be marked as cancelled.
            </Text>
          </View>

          <View style={styles.confirmActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Keep booking"
              onPress={dismissConfirm}
              style={({ pressed }) => [
                styles.secondaryButton,
                { backgroundColor: soft.inset, borderColor: soft.border },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.secondaryText, { color: palette.text }]}>Keep Booking</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mark this booking as cancelled"
              onPress={confirmDestructive}
              style={({ pressed }) => [
                styles.destructiveButton,
                { backgroundColor: palette.danger, shadowColor: palette.danger },
                pressed && styles.pressed,
              ]}>
              <Ionicons name="close-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.destructiveText} numberOfLines={1}>
                Mark as Cancelled
              </Text>
            </Pressable>
          </View>
        </View>
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingTop: 2,
  },
  header: {
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.35,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  row: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 13,
    // Comfortably clears the 44pt minimum target.
    minHeight: 58,
    paddingHorizontal: 10,
  },
  rowIcon: {
    alignItems: 'center',
    borderRadius: 13,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '700',
  },
  confirmNote: {
    alignItems: 'flex-start',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  confirmNoteText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '800',
  },
  destructiveButton: {
    alignItems: 'center',
    borderRadius: 16,
    elevation: 5,
    flex: 1.25,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 12,
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
  },
  destructiveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.75,
  },
});
