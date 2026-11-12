/**
 * FileStore backed by expo-file-system (SDK 58 object API: Paths / File / Directory).
 * Only imported by app code; tests use tests/helpers/memoryFileStore.ts.
 */
import { Directory, File, Paths } from 'expo-file-system';

import type { FileStore } from './fileStore';

const withSlash = (uri: string) => (uri.endsWith('/') ? uri : `${uri}/`);

function sizeOf(entry: Directory | File): number {
  if (entry instanceof File) return entry.exists ? entry.size : 0;
  if (!entry.exists) return 0;
  return entry.list().reduce((total, child) => total + sizeOf(child), 0);
}

export const expoFileStore: FileStore = {
  get documentUri() {
    return withSlash(Paths.document.uri);
  },
  get cacheUri() {
    return withSlash(Paths.cache.uri);
  },
  exists(uri) {
    return Paths.info(uri).exists;
  },
  ensureDir(uri) {
    new Directory(uri).create({ intermediates: true, idempotent: true });
  },
  deleteDir(uri) {
    const dir = new Directory(uri);
    if (dir.exists) dir.delete();
  },
  deleteFile(uri) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
  dirSizeBytes(uri) {
    return sizeOf(new Directory(uri));
  },
  fileSizeBytes(uri) {
    return sizeOf(new File(uri));
  },
  freeDiskBytes() {
    return Paths.availableDiskSpace;
  },
};
