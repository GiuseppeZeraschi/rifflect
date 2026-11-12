/**
 * Minimal file-system port used by the data layer. The app uses the expo-file-system adapter
 * (expoFileStore.ts); tests use an in-memory one. All URIs are absolute `file://` URIs.
 */
export interface FileStore {
  /** App-private documents directory URI, ending in `/`. */
  readonly documentUri: string;
  /** App cache directory URI, ending in `/`. */
  readonly cacheUri: string;
  exists(uri: string): boolean;
  /** Create a directory and any missing parents; no-op if it exists. */
  ensureDir(uri: string): void;
  /** Delete a directory and everything in it; no-op if it doesn't exist. */
  deleteDir(uri: string): void;
  /** Delete a file; no-op if it doesn't exist. */
  deleteFile(uri: string): void;
  /** Total size of all files under a directory (0 if missing). */
  dirSizeBytes(uri: string): number;
  /** Size of a file (0 if missing). */
  fileSizeBytes(uri: string): number;
  /** Free space on the volume holding the app's documents. */
  freeDiskBytes(): number;
}

/** Join URI segments with single slashes. */
export function joinUri(base: string, ...parts: string[]): string {
  let out = base.replace(/\/+$/, '');
  for (const p of parts) out += '/' + p.replace(/^\/+|\/+$/g, '');
  return out;
}
