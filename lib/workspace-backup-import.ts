import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import { BackupFileError } from '@/lib/workspace-backup-file';

/**
 * Choosing a backup file to restore.
 *
 * Split out from the export side and loaded on demand so that `expo-document-picker` — the one
 * native module Workspace Backup adds — is never pulled into the module graph of anything else.
 * Creating a backup therefore keeps working on a build that does not have the picker compiled in,
 * and only this one action reports that a rebuild is needed.
 */

const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

export type PickedBackupFile = { name: string; text: string };

/**
 * Opens the system file picker and reads the chosen file as text.
 *
 * Returns null when the picker is dismissed. The file is only read here — validation is the next
 * step, and nothing reaches the workspace until the user confirms the preview.
 */
export async function pickBackupFile(): Promise<PickedBackupFile | null> {
  if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoDocumentPicker')) {
    throw new BackupFileError(
      'Choosing a backup file needs a new development build. Rebuild and reinstall BookFlow, then try again. Creating a backup works on this build.',
    );
  }

  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    // iOS matches on the UTI behind the MIME type; `.json` files are `public.json`. Some providers
    // hand back a generic octet-stream, so that is accepted too and the content check does the rest.
    type: ['application/json', 'public.json', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];

  if (typeof asset.size === 'number' && asset.size > MAX_BACKUP_BYTES) {
    throw new BackupFileError('That file is too large to be a BookFlow backup.');
  }

  if (Platform.OS === 'web') {
    const response = await fetch(asset.uri);
    return { name: asset.name, text: await response.text() };
  }

  const { File } = await import('expo-file-system');
  const file = new File(asset.uri);

  if (!file.exists) {
    throw new BackupFileError('That file could not be opened.');
  }

  return { name: asset.name, text: await file.text() };
}
