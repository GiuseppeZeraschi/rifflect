import type { AnalysisResult } from '@/analysis/types';
import { take } from '@/data/db/schema';
import { createTakeFiles } from '@/data/files/takeFiles';
import { deleteItem, findOrCreateItem, listItems, renameItem } from '@/data/repositories/practiceItemsRepo';
import { upsertProfile } from '@/data/repositories/profileRepo';
import { saveReport } from '@/data/repositories/reportsRepo';
import {
  completeCapture,
  createTake,
  DRAFT_TTL_MS,
  listDrafts,
  listLibrary,
  markInterrupted,
  saveTake,
  setPracticeItem,
  updateTitle,
} from '@/data/repositories/takesRepo';
import { createTakeService } from '@/data/takeService';
import { MemoryFileStore } from '../../helpers/memoryFileStore';
import { createTestDb } from '../../helpers/testDb';

const result = (summary: string, timingScore: number): AnalysisResult => ({
    engineVersion: '1.0.0+t1',
    status: 'analysed',
    timingScore,
    techniqueScore: 70,
    summary,
    tempo: { bpm: 90, driftBpm: 0, meanAbsOffsetMs: 15, targetDeltaBpm: null },
    accompaniment: { kind: 'none', loopLengthMs: null, timingReference: 'own_playing', separationConfidence: null, liveOnsetMatchRate: null },
    coverage: { audio: 1, frettingHand: 1, pickingHand: 1, posture: 0 },
    limitations: [],
    points: [],
  });

describe('practice items and the library', () => {
  let t: ReturnType<typeof createTestDb>;
  let n = 0;
  const recorded = () => new Date(Date.UTC(2026, 10, 1, 10, n++)).toISOString();
  function finished(opts: { durationMs?: number } = {}) {
    const tk = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'off', recordedAt: recorded() });
    completeCapture(t.db, tk.id, { durationMs: opts.durationMs ?? 30_000, fileSizeBytes: 1000, landmarksPath: null });
    return tk;
  }
  beforeEach(() => {
    t = createTestDb();
    n = 0;
    upsertProfile(t.db, { handedness: 'right', skillLevel: 'beginner' });
  });
  afterEach(() => t.close());

  it('finds items by name ignoring case and whitespace, creating them once', () => {
    const a = findOrCreateItem(t.db, '  G–C–D strumming ');
    const b = findOrCreateItem(t.db, 'g–c–d STRUMMING');
    expect(b.id).toBe(a.id);
    expect(a.name).toBe('G–C–D strumming');
    expect(() => findOrCreateItem(t.db, '   ')).toThrow(/1–60/);
    expect(() => findOrCreateItem(t.db, 'x'.repeat(61))).toThrow(/1–60/);
  });

  it('renames items, refusing a name another item already has', () => {
    const a = findOrCreateItem(t.db, 'Scales');
    findOrCreateItem(t.db, 'Chords');
    expect(() => renameItem(t.db, a.id, 'chords')).toThrow(/already/);
    expect(renameItem(t.db, a.id, 'Major scales').name).toBe('Major scales');
  });

  it('deleting an item leaves its takes, now unlabelled', () => {
    const item = findOrCreateItem(t.db, 'Riff');
    const tk = finished();
    saveTake(t.db, tk.id, { practiceItemId: item.id });
    deleteItem(t.db, item.id);
    const [row] = listLibrary(t.db);
    expect(row!.id).toBe(tk.id);
    expect(row!.label).toBeNull();
  });

  it('lists only saved takes, newest first, with label, duration, summary and scores', () => {
    const item = findOrCreateItem(t.db, 'Riff');
    const older = finished();
    const draft = finished();
    const newer = finished({ durationMs: 45_000 });
    saveTake(t.db, older.id);
    saveTake(t.db, newer.id, { practiceItemId: item.id });
    saveReport(t.db, newer.id, result('Steady timing.', 88), 900);
    const rows = listLibrary(t.db);
    expect(rows.map((r) => r.id)).toEqual([newer.id, older.id]);
    expect(rows[0]).toMatchObject({ label: 'Riff', durationMs: 45_000, summary: 'Steady timing.', timingScore: 88, techniqueScore: 70 });
    expect(rows[1]).toMatchObject({ label: null, summary: null, timingScore: null });
    expect(rows.find((r) => r.id === draft.id)).toBeUndefined();
  });

  it('searches by label, case-insensitively', () => {
    const riff = findOrCreateItem(t.db, 'Blues riff');
    const scale = findOrCreateItem(t.db, 'Scales');
    const a = finished();
    const b = finished();
    saveTake(t.db, a.id, { practiceItemId: riff.id });
    saveTake(t.db, b.id, { practiceItemId: scale.id });
    expect(listLibrary(t.db, { search: 'RIFF' }).map((r) => r.id)).toEqual([a.id]);
    expect(listLibrary(t.db, { search: '' })).toHaveLength(2);
  });

  it('limits titles to 80 characters and can relabel', () => {
    const tk = finished();
    saveTake(t.db, tk.id);
    expect(() => updateTitle(t.db, tk.id, 'x'.repeat(81))).toThrow(/80/);
    updateTitle(t.db, tk.id, '  Best take so far  ');
    const item = findOrCreateItem(t.db, 'Solo');
    setPracticeItem(t.db, tk.id, item.id);
    expect(listLibrary(t.db)[0]).toMatchObject({ title: 'Best take so far', label: 'Solo' });
  });

  it('lists unsaved, uninterrupted drafts newest first with their removal time', () => {
    const a = finished();
    const b = finished();
    const interrupted = finished();
    markInterrupted(t.db, interrupted.id);
    const saved = finished();
    saveTake(t.db, saved.id);
    const drafts = listDrafts(t.db);
    expect(drafts.map((d) => d.id)).toEqual([b.id, a.id]);
    const created = t.db.select({ c: take.createdAt }).from(take).all()[0]!.c;
    expect(Date.parse(drafts[1]!.removeAt) - Date.parse(created)).toBeLessThanOrEqual(DRAFT_TTL_MS);
  });

  it('records when an item was last used', () => {
    const item = findOrCreateItem(t.db, 'Riff');
    expect(item.lastUsedAt).toBeNull();
    const tk = finished();
    saveTake(t.db, tk.id, { practiceItemId: item.id });
    expect(listItems(t.db)[0]!.lastUsedAt).not.toBeNull();
  });
});

describe('take service (rows + files)', () => {
  it('discards a draft and deletes a saved take, removing their folders', () => {
    const t = createTestDb();
    upsertProfile(t.db, { handedness: 'right', skillLevel: 'beginner' });
    const store = new MemoryFileStore();
    const files = createTakeFiles(store);
    const svc = createTakeService({ db: t.db, files });
    const a = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'off' });
    const b = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'off' });
    for (const tk of [a, b]) {
      completeCapture(t.db, tk.id, { durationMs: 20_000, fileSizeBytes: 10, landmarksPath: null });
      store.addFile(files.toAbsolute(tk.videoPath), 10);
    }
    saveTake(t.db, b.id);
    svc.discardDraft(a.id);
    expect(t.db.select().from(take).all().map((r) => r.id)).toEqual([b.id]);
    expect(store.exists(files.takeDirUri(a.id))).toBe(false);
    expect(() => svc.discardDraft(b.id)).toThrow(/saved/);
    svc.deleteTake(b.id);
    expect(t.db.select().from(take).all()).toHaveLength(0);
    expect(store.files.size).toBe(0);
    t.close();
  });
});
