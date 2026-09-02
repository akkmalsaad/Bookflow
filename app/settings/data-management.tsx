import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ProBadge } from '@/components/business-insights/BusinessInsightsVisuals';
import { SettingsDetailScreen, settingsDetailStyles } from '@/components/settings/SettingsDetailScreen';
import { RestoreBackupSheet } from '@/components/settings/RestoreBackupSheet';
import { getSoftTokens } from '@/components/settings/tokens';
import { useAppData } from '@/context/app-data-context';
import { useSnackbar } from '@/context/snackbar-context';
import { useSubscription } from '@/context/subscription-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import {
  BACKUP_REJECTION_MESSAGES,
  createWorkspaceBackup,
  parseWorkspaceBackup,
  type BookflowBackup,
} from '@/lib/workspace-backup';
import { BackupFileError, shareWorkspaceBackup } from '@/lib/workspace-backup-file';

type IconName = ComponentProps<typeof Ionicons>['name'];

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function DataManagementScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const { showSnackbar } = useSnackbar();
  const { isPro } = useSubscription();
  const {
    customers,
    bookings,
    invoices,
    payments,
    financeEntries,
    packages,
    readWorkspaceSnapshot,
    restoreWorkspaceBackup,
  } = useAppData();

  const [isCreating, setIsCreating] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [pending, setPending] = useState<{ backup: BookflowBackup; discarded: number } | null>(null);

  const counts: { label: string; value: number }[] = [
    { label: 'Customers', value: customers.length },
    { label: 'Bookings', value: bookings.length },
    { label: 'Invoices', value: invoices.length },
    { label: 'Payment records', value: payments.length },
    { label: 'Finance entries', value: financeEntries.length },
    { label: 'Services & packages', value: packages.length },
  ];

  /**
   * The gate, checked in the handler rather than only in what is rendered.
   *
   * `isPro` comes from the app's one RevenueCat entitlement — the same value the paywall, the plan
   * screen and Business Insights read — so an entitlement that lapses while this screen is open
   * stops the next action rather than being trusted from when the screen mounted.
   */
  const requirePro = useCallback(() => {
    if (isPro) return true;
    router.push('/paywall');
    return false;
  }, [isPro, router]);

  const reportFailure = (title: string, error: unknown, fallback: string) => {
    if (__DEV__) {
      console.error(`[workspace-backup] ${title}`, error);
    }
    // Only messages written for a person are shown; anything else would be a stack trace.
    Alert.alert(title, error instanceof BackupFileError ? error.message : fallback);
  };

  const handleCreateBackup = async () => {
    if (isCreating || !requirePro()) return;

    setIsCreating(true);
    try {
      // Let the row repaint as "Creating backup…" before the workspace is serialised.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const backup = createWorkspaceBackup(readWorkspaceSnapshot(), { appVersion: APP_VERSION });
      const { fileName } = await shareWorkspaceBackup(backup);
      showSnackbar({ message: `${fileName} is ready`, tone: 'success' });
    } catch (error) {
      reportFailure('Backup creation failed', error, 'Your backup could not be created. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handlePickBackup = async () => {
    if (isReading || !requirePro()) return;

    setIsReading(true);
    try {
      // Loaded only when the user actually chooses to import, so the file picker's native module is
      // never reached by any other part of the screen.
      const { pickBackupFile } = await import('@/lib/workspace-backup-import');
      const picked = await pickBackupFile();
      if (!picked) return;

      const result = parseWorkspaceBackup(picked.text);
      if (!result.ok) {
        Alert.alert('Unable to read backup', BACKUP_REJECTION_MESSAGES[result.reason]);
        return;
      }

      setPending({ backup: result.backup, discarded: result.discardedRecords });
    } catch (error) {
      reportFailure('Unable to read backup', error, 'That file could not be opened. Please try again.');
    } finally {
      setIsReading(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!pending || isRestoring) return;
    // Re-checked at the moment of writing, not just when the sheet was opened.
    if (!isPro) {
      setPending(null);
      router.push('/paywall');
      return;
    }

    setIsRestoring(true);
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const result = restoreWorkspaceBackup(pending.backup);
      setPending(null);
      showSnackbar({
        message: result.totalAdded
          ? `${result.totalAdded} ${result.totalAdded === 1 ? 'record' : 'records'} restored`
          : 'Everything in this backup is already in your workspace',
        tone: 'success',
      });
    } catch (error) {
      reportFailure('Unable to restore records', error, 'These records could not be restored. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <SettingsDetailScreen
      eyebrow="Data"
      title="Data management"
      description="Your BookFlow workspace and data controls.">
      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter, marginTop: 4 }]}>Your workspace</Text>
      <View style={[styles.card, { backgroundColor: soft.surface, borderColor: soft.border }]}>
        {counts.map((item, index) => (
          <View
            key={item.label}
            style={[
              styles.countRow,
              index < counts.length - 1 && { borderBottomColor: soft.divider, borderBottomWidth: 1 },
            ]}>
            <Text style={[styles.countLabel, { color: palette.muter }]}>{item.label}</Text>
            <Text style={[styles.countValue, { color: palette.text }]}>{item.value}</Text>
          </View>
        ))}
      </View>

      <View
        style={[
          styles.card,
          styles.syncCard,
          {
            backgroundColor: isDarkMode ? '#161F35' : '#F6F7FE',
            borderColor: isDarkMode ? 'rgba(129, 140, 248, 0.16)' : '#E6E8F8',
          },
        ]}>
        <View style={styles.syncHeader}>
          <Ionicons name="cloud-done-outline" size={19} color={palette.accent} />
          <Text style={[styles.cardTitle, { color: palette.text }]}>Your data is synced</Text>
        </View>
        <Text style={[styles.cardBody, { color: palette.muter }]}>
          Your customers, bookings, invoices and financial records are securely synced with your BookFlow
          account.
        </Text>
        <Text style={[styles.cardFootnote, { color: palette.muter }]}>
          Sign in to BookFlow on your other supported devices to reach your latest synced data.
        </Text>
      </View>

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>Export</Text>
      <ActionRow
        icon="download-outline"
        title="Export data & reports"
        subtitle="Download business reports and records for accounting, analysis or your own files."
        onPress={() => router.push('/settings/export')}
        isDarkMode={isDarkMode}
      />

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>Backup & restore</Text>
      <View style={[styles.card, { backgroundColor: soft.surface, borderColor: soft.border }]}>
        <View style={styles.backupHeader}>
          <Ionicons name="cloud-download-outline" size={19} color={palette.accent} />
          <Text style={[styles.cardTitle, { color: palette.text }]}>Workspace Backup</Text>
          <View style={styles.badgeGroup}>
            {!isPro ? <Ionicons name="lock-closed-outline" size={15} color={palette.muter} /> : null}
            <ProBadge />
          </View>
        </View>

        <Text style={[styles.cardBody, styles.backupBody, { color: palette.muter }]}>
          {isPro
            ? 'Portable backup and restore for your BookFlow workspace. Cloud sync keeps your live data — a backup is an extra copy you keep yourself.'
            : 'Create a portable backup of your customers, bookings, invoices, payments, finances and settings, and restore it to BookFlow later.'}
        </Text>

        <View style={[styles.divider, styles.dividerSpaced, { backgroundColor: soft.divider }]} />

        {isPro ? (
          <>
            <BackupRow
              icon="archive-outline"
              label={isCreating ? 'Creating backup…' : 'Create backup'}
              busy={isCreating}
              disabled={isCreating || isReading}
              onPress={handleCreateBackup}
              isDarkMode={isDarkMode}
            />
            <View style={[styles.divider, { backgroundColor: soft.divider }]} />
            <BackupRow
              icon="cloud-upload-outline"
              label={isReading ? 'Opening…' : 'Import backup'}
              busy={isReading}
              disabled={isCreating || isReading}
              onPress={handlePickBackup}
              isDarkMode={isDarkMode}
            />
          </>
        ) : (
          <BackupRow
            icon="lock-closed-outline"
            label="Unlock with Pro"
            accent
            onPress={() => router.push('/paywall')}
            isDarkMode={isDarkMode}
          />
        )}
      </View>

      <RestoreBackupSheet
        backup={pending?.backup ?? null}
        discardedRecords={pending?.discarded ?? 0}
        isRestoring={isRestoring}
        onCancel={() => setPending(null)}
        onConfirm={handleConfirmRestore}
      />
    </SettingsDetailScreen>
  );
}

/** A settings row that leads somewhere: icon, copy, chevron. */
function ActionRow({
  icon,
  title,
  subtitle,
  onPress,
  isDarkMode,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  isDarkMode: boolean;
}) {
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        styles.actionRow,
        { backgroundColor: soft.surface, borderColor: soft.border },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.actionIcon, { backgroundColor: soft.accentSoft }]}>
        <Ionicons name={icon} size={19} color={palette.accent} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.cardBody, { color: palette.muter }]}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.muter} />
    </Pressable>
  );
}

/** One action inside the Workspace Backup card. */
function BackupRow({
  icon,
  label,
  busy,
  disabled,
  accent,
  onPress,
  isDarkMode,
}: {
  icon: IconName;
  label: string;
  busy?: boolean;
  disabled?: boolean;
  accent?: boolean;
  onPress: () => void;
  isDarkMode: boolean;
}) {
  const palette = getThemePalette(isDarkMode);
  const color = accent ? palette.accent : palette.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(busy) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.backupRow, pressed && styles.pressed, disabled && !busy && styles.disabled]}>
      <Ionicons name={icon} size={19} color={accent ? palette.accent : palette.muter} />
      <Text style={[styles.backupLabel, { color }]}>{label}</Text>
      {busy ? (
        <ActivityIndicator size="small" color={palette.accent} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={palette.muter} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  countRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
  },
  countLabel: {
    fontSize: 13.5,
    fontWeight: '500',
  },
  countValue: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  syncCard: {
    marginTop: 14,
    paddingBottom: 16,
    paddingTop: 15,
  },
  syncHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  cardBody: {
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 18,
  },
  cardFootnote: {
    fontSize: 11.5,
    fontWeight: '500',
    lineHeight: 17,
    marginTop: 8,
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
  },
  actionIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  actionCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  backupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    paddingTop: 15,
  },
  backupBody: {
    marginTop: 9,
  },
  badgeGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginLeft: 'auto',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -16,
  },
  dividerSpaced: {
    marginTop: 14,
  },
  backupRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 52,
  },
  backupLabel: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.75,
  },
});
