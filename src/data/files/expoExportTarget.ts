/**
 * Export destination on top of Android's folder picker (expo-file-system SDK 58 object API).
 * Videos are copied in 1 MB chunks so a long take never has to fit in memory.
 */
import { Directory, File, FileMode } from 'expo-file-system';

import type { ExportTarget } from './exportAll';

const CHUNK = 1024 * 1024;

function dirTarget(dir: Directory): ExportTarget {
  return {
    async createFolder(name) {
      return dirTarget(dir.createDirectory(name));
    },
    async writeText(name, text) {
      const file = dir.createFile(name, name.endsWith('.json') ? 'application/json' : 'text/plain');
      file.write(text);
    },
    async copyFile(sourceUri, name, onProgress) {
      const source = new File(sourceUri);
      const total = source.size || 1;
      const dest = dir.createFile(name, 'video/mp4');
      const input = source.open(FileMode.ReadOnly);
      const output = dest.open(FileMode.Truncate);
      try {
        let copied = 0;
        for (;;) {
          const bytes = await input.readBytes(CHUNK);
          if (bytes.length === 0) break;
          await output.writeBytes(bytes);
          copied += bytes.length;
          onProgress?.(Math.min(1, copied / total));
        }
      } finally {
        input.close();
        output.close();
      }
    },
  };
}

/** Ask the user for a destination folder. Returns null if they cancel. */
export async function pickExportTarget(): Promise<ExportTarget | null> {
  try {
    return dirTarget(await Directory.pickDirectoryAsync());
  } catch {
    return null;
  }
}
