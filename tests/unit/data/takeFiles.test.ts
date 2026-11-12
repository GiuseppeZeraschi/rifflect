import { createTakeFiles } from '@/data/files/takeFiles';
import { MemoryFileStore } from '../../helpers/memoryFileStore';

describe('takeFiles (data-model.md § File layout)', () => {
  let store: MemoryFileStore;
  let files: ReturnType<typeof createTakeFiles>;
  beforeEach(() => {
    store = new MemoryFileStore();
    files = createTakeFiles(store);
  });

  it('uses the documented layout with paths relative to the documents directory', () => {
    expect(files.relVideoPath('abc')).toBe('takes/abc/video.mp4');
    expect(files.relLandmarksPath('abc')).toBe('takes/abc/landmarks.jsonl');
    expect(files.relThumbPath('abc')).toBe('takes/abc/thumb.jpg');
    expect(files.toAbsolute('takes/abc/video.mp4')).toBe(
      'file:///data/user/0/com.rifflect.app/files/takes/abc/video.mp4',
    );
    expect(files.pcmCacheUri('abc')).toBe('file:///data/user/0/com.rifflect.app/cache/analysis/abc.f32');
  });

  it('creates and deletes a take folder, including everything inside', () => {
    files.ensureTakeDir('abc');
    expect(store.exists(files.takeDirUri('abc'))).toBe(true);
    store.addFile(files.toAbsolute(files.relVideoPath('abc')), 5_000);
    store.addFile(files.toAbsolute(files.relLandmarksPath('abc')), 300);
    files.deleteTakeDir('abc');
    expect(store.exists(files.takeDirUri('abc'))).toBe(false);
    expect(store.files.size).toBe(0);
  });

  it('measures a take folder and leaves other takes alone', () => {
    store.addFile(files.toAbsolute(files.relVideoPath('a')), 1_000);
    store.addFile(files.toAbsolute(files.relThumbPath('a')), 50);
    store.addFile(files.toAbsolute(files.relVideoPath('ab')), 9_999); // prefix must not match
    expect(files.takeDirSizeBytes('a')).toBe(1_050);
    files.deleteTakeDir('a');
    expect(files.takeDirSizeBytes('ab')).toBe(9_999);
  });

  it('rejects take ids that could escape the takes folder', () => {
    expect(() => files.relVideoPath('../x')).toThrow();
    expect(() => files.ensureTakeDir('a/b')).toThrow();
    expect(() => files.deleteTakeDir('')).toThrow();
  });

  it('reports free disk space and deletes the PCM cache file', () => {
    store.freeBytes = 123;
    expect(files.freeDiskBytes()).toBe(123);
    store.addFile(files.pcmCacheUri('abc'), 4_000);
    files.deletePcmCache('abc');
    expect(store.exists(files.pcmCacheUri('abc'))).toBe(false);
  });
});
