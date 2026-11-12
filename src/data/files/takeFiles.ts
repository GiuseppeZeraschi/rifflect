/**
 * Take folder management (data-model.md § File layout):
 *
 *   <documents>/takes/<takeId>/video.mp4 | landmarks.jsonl | thumb.jpg
 *   <cache>/analysis/<takeId>.f32          (decoded PCM, deleted after analysis)
 *
 * Paths stored in the database are relative to the documents directory, so they survive the
 * documents directory moving (e.g. after a restore on another device in future).
 */
import { type FileStore, joinUri } from './fileStore';
import { relTakePaths } from './takePaths';

const assertTakeId = (id: string) => void relTakePaths(id);

export function createTakeFiles(store: FileStore) {
  const relTakeDir = (id: string) => relTakePaths(id).dir;

  const api = {
    relTakeDir,
    relVideoPath: (id: string) => relTakePaths(id).video,
    relLandmarksPath: (id: string) => relTakePaths(id).landmarks,
    relThumbPath: (id: string) => relTakePaths(id).thumb,

    /** Absolute URI for a path stored in the database. */
    toAbsolute: (relPath: string) => joinUri(store.documentUri, relPath),
    takeDirUri: (id: string) => joinUri(store.documentUri, relTakeDir(id)),
    pcmCacheUri: (id: string) => {
      assertTakeId(id);
      return joinUri(store.cacheUri, 'analysis', `${id}.f32`);
    },

    ensureTakeDir(id: string): string {
      const uri = api.takeDirUri(id);
      store.ensureDir(uri);
      return uri;
    },
    deleteTakeDir(id: string): void {
      store.deleteDir(api.takeDirUri(id));
    },
    takeDirSizeBytes(id: string): number {
      return store.dirSizeBytes(api.takeDirUri(id));
    },
    ensurePcmCacheDir(): void {
      store.ensureDir(joinUri(store.cacheUri, 'analysis'));
    },
    deletePcmCache(id: string): void {
      store.deleteFile(api.pcmCacheUri(id));
    },
    exists: (uri: string) => store.exists(uri),
    freeDiskBytes: () => store.freeDiskBytes(),
  };
  return api;
}

export type TakeFiles = ReturnType<typeof createTakeFiles>;
