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

const TAKE_ID = /^[0-9A-Za-z_-]+$/;

function assertTakeId(id: string): void {
  if (!TAKE_ID.test(id)) throw new Error(`Invalid take id: ${JSON.stringify(id)}`);
}

export function createTakeFiles(store: FileStore) {
  const relTakeDir = (id: string) => {
    assertTakeId(id);
    return `takes/${id}`;
  };

  const api = {
    relTakeDir,
    relVideoPath: (id: string) => `${relTakeDir(id)}/video.mp4`,
    relLandmarksPath: (id: string) => `${relTakeDir(id)}/landmarks.jsonl`,
    relThumbPath: (id: string) => `${relTakeDir(id)}/thumb.jpg`,

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
