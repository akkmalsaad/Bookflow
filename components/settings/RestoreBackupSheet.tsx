import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { countBackupRecords, type BookflowBackup } from '@/lib/workspace-backup';

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

type Props = {
  backup: BookflowBackup | null;
  /** Records dropped by validation, surfaced so a partly damaged file is never restored silently. */
  discardedRecords: number;
  isRestoring: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * The confirmation step between reading a backup and writing any of it into the workspace.
 *
 * Nothing has touched the workspace by the time this appears — the file has only been read and
 * validated. The counts are the backup's own, so what the sheet promises is what the file holds.
 */
export function RestoreBackupSheet({ backup, discardedRecords, isRestoring, onCancel, onConfirm }: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const counts = backup ? countBackupRecords(backup) : [];

  return (
    <BottomSheetModal visible={backup !== null} onClose={isRestoring ? () => {} : onCancel} heightRatio={0.8}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <Text style={[styles.eyebrow, { color: palette.accent }]}>Workspace backup</Text>
        <Text style={[styles.title, { color: palette.text }]}>Restore workspace backup</Text>

        {backup ? (
          <>
            <View style={[styles.meta, { backgroundColor: soft.inset, borderColor: soft.border }]}>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: palette.muter }]}>Created</Text>
                <Text style={[styles.metaValue, { color: palette.text }]}>{formatCreatedAt(backup.createdAt)}</Text>
              </View>
              {backup.workspace.businessName ? (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: palette.muter }]}>Business</Text>
                  <Text style={[styles.metaValue, { color: palette.text }]} numberOfLines={1}>
                    {backup.workspace.businessName}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.counts, { borderColor: soft.border }]}>
              {counts.map((item, index) => (
                <View
                  key={item.collection}
                  style={[styles.countRow, index < counts.length - 1 && { borderBottomColor: soft.divider, borderBottomWidth: 1 }]}>
                  <Text style={[styles.countLabel, { color: palette.muter }]}>{item.label}</Text>
                  <Text style={[styles.countValue, { color: palette.text }]}>{item.count}</Text>
                </View>
              ))}
            </View>

            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={18} color={palette.muter} />
              <Text style={[styles.noteText, { color: palette.muter }]}>
                These records will be added to your current BookFlow workspace. Nothing you already have is
                changed or removed, and importing the same file twice adds nothing the second time.
              </Text>
            </View>

            {discardedRecords > 0 ? (
              <View style={styles.note}>
                <Ionicons name="alert-circle-outline" size={18} color={palette.warning} />
                <Text style={[styles.noteText, { color: palette.warning }]}>
                  {discardedRecords} {discardedRecords === 1 ? 'record' : 'records'} in this file could not be read
                  and will be skipped.
                </Text>
              </View>
            ) : null}
          </>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={isRestoring}
            onPress={onCancel}
            style={({ pressed }) => [
              styles.secondaryButton,
              { backgroundColor: soft.inset, borderColor: soft.border },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.secondaryText, { color: palette.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isRestoring, busy: isRestoring }}
            disabled={isRestoring}
            onPress={onConfirm}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: palette.accent },
              (pressed || isRestoring) && styles.pressed,
            ]}>
            {isRestoring ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
            <Text style={styles.primaryText}>{isRestoring ? 'Restoring…' : 'Continue'}</Text>
          </Pressable>
        </View>
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 18,
  },
  meta: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
  },
  metaLabel: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  metaValue: {
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: '700',
    marginLeft: 12,
  },
  counts: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  countRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  countLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  countValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  note: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
    marginTop: 14,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
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
    fontWeight: '700',
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 16,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  bottomSpacer: {
    height: 16,
  },
  pressed: {
    opacity: 0.8,
  },
});
