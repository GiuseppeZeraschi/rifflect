import { eq } from 'drizzle-orm';

import { take } from '@/data/db/schema';
import { createTakeFiles } from '@/data/files/takeFiles';
import { upsertProfile } from '@/data/repositories/profileRepo';
import { completeCapture, createTake, getTake, markInterrupted, saveTake, setAnalysisStatus } from '@/data/repositories/takesRepo';
import { runRecovery, type ProbeResult } from '@/jobs/recovery';
import { MemoryFileStore } from '../../helpers/memoryFileStore';
import { createTestDb } from '../../helpers/testDb';

const NOW = Date.parse('2026-11-12T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function setup() {
  const t = createTestDb();
  upsertProfile(t.db, { handedness: 'right', skillLevel: 'beginner' });
  const store = new MemoryFileStore();
  const files = createTakeFiles(store);
  const make = (createdHoursAgo: number) => {
    const tk = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'off', recordedAt: hoursAgo(createdHoursAgo) });
    t.db.update(take).set({ createdAt: hoursAgo(createdHoursAgo) }).where(eq(take.id, tk.id)).run();
    store.addFile(files.toAbsolute(tk.videoPath), 5_000);
    return tk;
  };
  return { t, store, files, make };
}

describe('start-up recovery', () => {
  it('turns a crashed recording with a readable file into an interrupted take', async () => {
    const { t, files, make } = setup();
    const tk = make(1); // still "recording": the app died mid-take
    const probe = jest.fn(async (): Promise<ProbeResult> => ({ ok: true, durationMs: 42_000 }));
    const r = await runRecovery({ db: t.db, files, probe, now: () => NOW });
    expect(probe).toHaveBeenCalledWith(files.toAbsolute(tk.videoPath));
    expect(getTake(t.db, tk.id)).toMatchObject({ captureStatus: 'partial', interrupted: true, durationMs: 42_000, analysisStatus: 'pending' });
    expect(r.interruptedDraftIds).toEqual([tk.id]);
    expect(r.lostCount).toBe(0);
    t.close();
  });

  it('deletes a crashed recording whose file can’t be read and reports it as lost', async () => {
    const { t, store, files, make } = setup();
    const tk = make(1);
    const r = await runRecovery({ db: t.db, files, probe: async () => ({ ok: false }), now: () => NOW });
    expect(getTake(t.db, tk.id)).toBeUndefined();
    expect(store.exists(files.takeDirUri(tk.id))).toBe(false);
    expect(r.lostCount).toBe(1);
    t.close();
  });

  it('puts analyses that were running back to pending', async () => {
    const { t, files, make } = setup();
    const tk = make(1);
    completeCapture(t.db, tk.id, { durationMs: 30_000, fileSizeBytes: 1, landmarksPath: null });
    setAnalysisStatus(t.db, tk.id, 'analysing');
    const r = await runRecovery({ db: t.db, files, probe: async () => ({ ok: true }), now: () => NOW });
    expect(getTake(t.db, tk.id)!.analysisStatus).toBe('pending');
    expect(r.requeued).toBe(1);
    t.close();
  });

  it('lists interrupted drafts for /recover and keeps them past 24 h', async () => {
    const { t, files, make } = setup();
    const tk = make(30);
    markInterrupted(t.db, tk.id, { durationMs: 12_000 });
    const r = await runRecovery({ db: t.db, files, probe: async () => ({ ok: true }), now: () => NOW });
    expect(r.interruptedDraftIds).toEqual([tk.id]);
    expect(getTake(t.db, tk.id)).toBeDefined();
    t.close();
  });

  it('deletes other drafts older than 24 h (row and folder) but keeps newer ones', async () => {
    const { t, store, files, make } = setup();
    const old = make(25);
    const fresh = make(2);
    for (const tk of [old, fresh]) completeCapture(t.db, tk.id, { durationMs: 30_000, fileSizeBytes: 1, landmarksPath: null });
    const r = await runRecovery({ db: t.db, files, probe: async () => ({ ok: true }), now: () => NOW });
    expect(getTake(t.db, old.id)).toBeUndefined();
    expect(store.exists(files.takeDirUri(old.id))).toBe(false);
    expect(getTake(t.db, fresh.id)).toBeDefined();
    expect(r.deletedDrafts).toBe(1);
    t.close();
  });

  it('never touches saved takes', async () => {
    const { t, store, files, make } = setup();
    const tk = make(500);
    completeCapture(t.db, tk.id, { durationMs: 30_000, fileSizeBytes: 1, landmarksPath: null });
    saveTake(t.db, tk.id);
    const before = getTake(t.db, tk.id);
    await runRecovery({ db: t.db, files, probe: async () => ({ ok: false }), now: () => NOW });
    expect(getTake(t.db, tk.id)).toEqual(before);
    expect(store.exists(files.toAbsolute(tk.videoPath))).toBe(true);
    t.close();
  });
});
