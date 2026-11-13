import { createTakeFiles } from '@/data/files/takeFiles';
import { getProfile, upsertProfile } from '@/data/repositories/profileRepo';
import { getTake } from '@/data/repositories/takesRepo';
import { uriToPath } from '@/capture/config';
import { createRecordingController, StorageFullError, type RecorderHandle } from '@/capture/recordingController';
import { MemoryFileStore } from '../../helpers/memoryFileStore';
import { createTestDb } from '../../helpers/testDb';

/** A fake Recorder: stop() finishes asynchronously, like the native one. */
function fakeRecorder() {
  let finished: (() => void) | null = null;
  let failed: ((e: Error) => void) | null = null;
  const handle: RecorderHandle = {
    start: jest.fn(async (onFinished, onError) => {
      finished = onFinished;
      failed = onError;
    }),
    stop: jest.fn(async () => {
      setTimeout(() => finished?.(), 0);
    }),
  };
  return { handle, finish: () => finished?.(), fail: (e: Error) => failed?.(e) };
}

function setup() {
  const t = createTestDb();
  upsertProfile(t.db, { handedness: 'right', skillLevel: 'beginner' });
  const store = new MemoryFileStore();
  const files = createTakeFiles(store);
  const rec = fakeRecorder();
  let clock = 1_000_000;
  const enqueue = jest.fn();
  const createRecorder = jest.fn(async () => rec.handle);
  const ctl = createRecordingController({
    db: t.db,
    files,
    createRecorder,
    enqueue,
    rememberAccompaniment: (s) => upsertProfile(t.db, { lastAccompanimentSetting: s }),
    now: () => clock,
  });
  const advance = (ms: number) => {
    clock += ms;
  };
  return { t, store, files, rec, ctl, enqueue, createRecorder, advance };
}

const opts = { cameraPosition: 'front' as const, accompanimentSetting: 'on' as const, targetTempoBpm: 90 };

describe('recording controller', () => {
  it('records a take into its folder and queues it for analysis', async () => {
    const { t, files, ctl, enqueue, createRecorder, advance } = setup();
    const id = await ctl.start(opts);
    expect(ctl.getSnapshot()).toMatchObject({ state: 'recording', takeId: id });
    const row = getTake(t.db, id)!;
    expect(row).toMatchObject({ captureStatus: 'recording', targetTempoBpm: 90, accompanimentSetting: 'on' });
    expect(createRecorder).toHaveBeenCalledWith(uriToPath(files.toAbsolute(row.videoPath)), 300);
    expect(getProfile(t.db)?.lastAccompanimentSetting).toBe('on');

    advance(42_000);
    const done = await ctl.stop();
    expect(done).toMatchObject({ takeId: id, durationMs: 42_000, analysisStatus: 'pending', interrupted: false, reachedLimit: false });
    expect(getTake(t.db, id)).toMatchObject({ captureStatus: 'complete', durationMs: 42_000 });
    expect(enqueue).toHaveBeenCalledWith(id);
    expect(ctl.getSnapshot()).toMatchObject({ state: 'idle', lastFinished: { takeId: id } });
    t.close();
  });

  it('does not analyse a take shorter than 5 seconds', async () => {
    const { t, ctl, enqueue, advance } = setup();
    const id = await ctl.start(opts);
    advance(3_000);
    const done = await ctl.stop();
    expect(done?.analysisStatus).toBe('too_short');
    expect(getTake(t.db, id)?.analysisStatus).toBe('too_short');
    expect(enqueue).not.toHaveBeenCalled();
    t.close();
  });

  it('reports a take that stopped itself at the 5-minute limit', async () => {
    const { t, rec, ctl, advance } = setup();
    const seen: unknown[] = [];
    ctl.subscribe((s) => seen.push(s.lastFinished));
    await ctl.start(opts);
    advance(300_000);
    rec.finish(); // native maxDuration reached
    expect(ctl.getSnapshot().lastFinished).toMatchObject({ reachedLimit: true, durationMs: 300_000 });
    t.close();
  });

  it('keeps an interrupted take and still analyses it', async () => {
    const { t, ctl, enqueue, advance } = setup();
    const id = await ctl.start(opts);
    advance(20_000);
    const done = await ctl.interrupt();
    expect(done).toMatchObject({ interrupted: true, analysisStatus: 'pending' });
    expect(getTake(t.db, id)).toMatchObject({ captureStatus: 'partial', interrupted: true, durationMs: 20_000 });
    expect(enqueue).toHaveBeenCalledWith(id);
    t.close();
  });

  it('treats a recorder error as an interruption', async () => {
    const { t, rec, ctl, advance } = setup();
    const id = await ctl.start(opts);
    advance(8_000);
    rec.fail(new Error('encoder died'));
    expect(getTake(t.db, id)).toMatchObject({ captureStatus: 'partial', interrupted: true });
    expect(ctl.getSnapshot().state).toBe('idle');
    t.close();
  });

  it('refuses to start when there is no room for a take', async () => {
    const { t, store, ctl, createRecorder } = setup();
    store.freeBytes = 100 * 1024 * 1024;
    await expect(ctl.start(opts)).rejects.toBeInstanceOf(StorageFullError);
    expect(createRecorder).not.toHaveBeenCalled();
    expect(ctl.getSnapshot().state).toBe('idle');
    t.close();
  });

  it('removes the empty take when the recorder fails to start', async () => {
    const { t, ctl, createRecorder } = setup();
    createRecorder.mockRejectedValueOnce(new Error('camera busy'));
    await expect(ctl.start(opts)).rejects.toThrow('camera busy');
    expect(t.db.query.take.findMany().sync()).toHaveLength(0);
    expect(ctl.getSnapshot().state).toBe('idle');
    t.close();
  });

  it('rejects a second start while recording', async () => {
    const { t, ctl } = setup();
    await ctl.start(opts);
    await expect(ctl.start(opts)).rejects.toThrow(/while recording/);
    t.close();
  });

  it('stores the landmarks file when a landmark sink was open', async () => {
    const t = createTestDb();
    upsertProfile(t.db, { handedness: 'right', skillLevel: 'beginner' });
    const files = createTakeFiles(new MemoryFileStore());
    const rec = fakeRecorder();
    let clock = 0;
    const close = jest.fn();
    const ctl = createRecordingController({
      db: t.db,
      files,
      createRecorder: async () => rec.handle,
      enqueue: () => {},
      rememberAccompaniment: () => {},
      openLandmarkSink: (id) => ({ relPath: files.relLandmarksPath(id), close }),
      now: () => clock,
    });
    const id = await ctl.start(opts);
    clock += 10_000;
    await ctl.stop();
    expect(close).toHaveBeenCalled();
    expect(getTake(t.db, id)?.landmarksPath).toBe(files.relLandmarksPath(id));
    t.close();
  });
});
