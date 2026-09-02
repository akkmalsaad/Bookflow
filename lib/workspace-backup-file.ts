import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import {
  buildBackupFileName,
  serializeBackup,
  type BookflowBackup,
} from '@/lib/workspace-backup';

/**
 * Writing a workspace backup out to a file.
 *
 * Kept apart from `workspace-backup.ts` so the backup format, validation and merge stay pure — they
 * can be reasoned about and exercised without any native module in sight.
 *
 * Deliberately holds no reference to `expo-document-picker`. Creating a backup needs only
 * `expo-file-system` and `expo-sharing`, which the invoice PDF and the report export already use,
 * so this module adds no native surface at all and keeps working on a build that predates the
 * picker. Choosing a file to restore lives in `workspace-backup-import.ts` and is loaded on demand.
 */

export class BackupFileError extends Error {}

/**
 * Writes the backup into the app's cache and hands it to the system share sheet.
 *
 * Nothing is uploaded. The file exists only inside this app's sandbox until the user picks a
 * destination — Files, iCloud Drive, AirDrop, Mail — from the sheet.
 */
export async function shareWorkspaceBackup(backup: BookflowBackup): Promise<{ fileName: string }> {
  const fileName = buildBackupFileName(backup.createdAt);
  const contents = serializeBackup(backup);

  if (Platform.OS === 'web') {
    const blob = new Blob([contents], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { fileName };
  }

  if (!['ExpoSharing', 'FileSystem'].every((moduleName) => requireOptionalNativeModule(moduleName))) {
    throw new BackupFileError(
      'Backups need one native app rebuild. Rebuild and reinstall BookFlow, then try again.',
    );
  }

  const [{ File, Paths }, Sharing] = await Promise.all([import('expo-file-system'), import('expo-sharing')]);

  if (!(await Sharing.isAvailableAsync())) {
    throw new BackupFileError('Saving files is not available on this device.');
  }

  const destination = new File(Paths.cache, fileName);
  if (destination.exists) {
    destination.delete();
  }
  destination.create();
  destination.write(contents);

  await Sharing.shareAsync(destination.uri, {
    dialogTitle: 'Save your BookFlow workspace backup',
    mimeType: 'application/json',
    UTI: 'public.json',
  });

  return { fileName };
}
