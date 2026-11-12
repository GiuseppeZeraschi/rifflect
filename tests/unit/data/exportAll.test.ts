import { createTakeFiles } from '@/data/files/takeFiles';
import { exportAll, sanitize, type ExportTarget } from '@/data/files/exportAll';
import { formatBytes, storageStatus, totalTakesBytes } from '@/data/files/storage';
import { findOrCreateItem } from '@/data/repositories/practiceItemsRepo';
import { upsertProfile } from '@/data/repositories/profileRepo';
import { saveReport } from '@/data/repositories/reportsRepo';
import { completeCapture, createTake, saveTake } from '@/data/repositories/takesRepo';
import type { AnalysisResult } from '@/analysis/types';
import { MemoryFileStore } from '../../helpers/memoryFileStore';
import { createTestDb } from '../../helpers/testDb';

/** In-memory export destination; can be told to fail when a given file is written. */
class MemoryTarget implements ExportTarget {
  readonly entries = new Map<string, string>();
  constructor(
    private readonly path = '',
    private readonly failOn?: string,
  ) {}
  private full(name: string) {
    return this.path ? `${this.path}/${name}` : name;
  }
  async createFolder(name: string) {
    this.entries.set(this.full(name) + '/', 'dir');
    const child = new MemoryTarget(this.full(name), this.failOn);
    (child as unknown as { entries: Map<string, string> }).entries = this.entries;
    return child;
  }
  async writeText(name: string, text: string) {
    this.entries.set(this.full(name), text);
  }
  async copyFile(source: string, name: string, onProgress?: (f: number) => void) {
    if (this.failOn && this.full(name).includes(this.failOn)) throw new Error('No space left on the destination');
    onProgress?.(0.5);
    this.entries.set(this.full(name), `copy of ${source}`);
    onProgress?.(1);
  }
}

const report = (summary: string): AnalysisResult => ({
  engineVersion: '1.0.0+t1',
  status: 'analysed',
  timingScore: 81,
  techniqueScore: null,
  summary,
  tempo: { bpm: 90, driftBpm: 0, meanAbsOffsetMs: 15, targetDeltaBpm: null },
  accompaniment: { kind: 'none', loopLengthMs: null, timingReference: 'own_playing', separationConfidence: null, liveOnsetMatchRate: null },
  coverage: { audio: 1, frettingHand: 0, pickingHand: 0, posture: 0 },
  limitations: [{ code: 'landmarks_missing', message: 'Hand tracking wasn’t available.' }],
  points: [{ category: 'timing', aspect: 'rhythm', issueCode: 'timing.rushing', severity: 'minor', confidence: 0.8, startMs: 42_000, observation: 'Beat 4 was early.', suggestion: 'Count it out loud.', metrics: { beat: 4 } }],
});

function setup() {
  const t = createTestDb();
  upsertProfile(t.db, { handedness: 'right', skillLevel: 'beginner' });
  const store = new MemoryFileStore();
  const files = createTakeFiles(store);
  const take = (recordedAt: string, label?: string, save = true) => {
    const tk = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'off', recordedAt });
    completeCapture(t.db, tk.id, { durationMs: 75_000, fileSizeBytes: 2_000_000, landmarksPath: null });
    if (save) saveTake(t.db, tk.id, { practiceItemId: label ? findOrCreateItem(t.db, label).id : null });
    return tk;
  };
  return { t, files, store, take };
}

describe('Export all', () => {
  it('writes takes.json and a folder per saved take with the video and readable feedback', async () => {
    const { t, files, take } = setup();
    const a = take(new Date(2026, 10, 10, 9, 5).toISOString(), 'G–C–D strumming');
    saveReport(t.db, a.id, report('Focus: Rushing beat 4.'), 900);
    take(new Date(2026, 10, 11, 18, 30).toISOString());
    take(new Date(2026, 10, 12, 8, 0).toISOString(), undefined, false); // draft: excluded

    const target = new MemoryTarget();
    const progress: string[] = [];
    const r = await exportAll({
      db: t.db,
      files,
      target,
      now: () => new Date(2026, 10, 12, 21, 7).toISOString(),
      onProgress: (p) => progress.push(`${p.done}/${p.total}`),
    });

    expect(r).toEqual({ folderName: 'rifflect-export-2026-11-12-2107', total: 2, exported: 2 });
    const json = JSON.parse(target.entries.get('rifflect-export-2026-11-12-2107/takes.json')!);
    expect(json).toHaveLength(2);
    expect(json[0]).toMatchObject({ label: 'G–C–D strumming', timingScore: 81, techniqueScore: null, summary: 'Focus: Rushing beat 4.', engineVersion: '1.0.0+t1' });
    expect(json[0].points[0]).toEqual({ category: 'timing', issueCode: 'timing.rushing', startMs: 42_000, observation: 'Beat 4 was early.', suggestion: 'Count it out loud.' });
    expect(json[0]).not.toHaveProperty('videoPath');

    const keys = [...target.entries.keys()];
    expect(keys).toContain('rifflect-export-2026-11-12-2107/2026-11-10_0905_G-C-D-strumming/video.mp4');
    expect(keys).toContain('rifflect-export-2026-11-12-2107/2026-11-11_1830_untitled/video.mp4');
    const txt = target.entries.get('rifflect-export-2026-11-12-2107/2026-11-10_0905_G-C-D-strumming/feedback.txt')!;
    expect(txt).toContain('Timing score: 81');
    expect(txt).toContain('Technique score: not enough data');
    expect(txt).toContain('[0:42] Beat 4 was early. — Count it out loud.');
    expect(txt).toContain('Hand tracking wasn’t available.');
    expect(progress[progress.length - 1]).toBe('2/2');
    t.close();
  });

  it('stops cleanly and reports how far it got when a write fails', async () => {
    const { t, files, take } = setup();
    take(new Date(2026, 10, 10, 9, 0).toISOString(), 'First');
    const second = take(new Date(2026, 10, 11, 9, 0).toISOString(), 'Second');
    const r = await exportAll({ db: t.db, files, target: new MemoryTarget('', 'Second/video.mp4') });
    expect(r.exported).toBe(1);
    expect(r.error).toEqual({ takeId: second.id, message: 'No space left on the destination' });
    t.close();
  });

  it('gives same-minute takes distinct folder names', async () => {
    const { t, files, take } = setup();
    const at = new Date(2026, 10, 10, 9, 0).toISOString();
    take(at, 'Riff');
    take(at, 'Riff');
    const target = new MemoryTarget();
    await exportAll({ db: t.db, files, target, now: () => at });
    const folders = [...target.entries.keys()].filter((k) => k.endsWith('/video.mp4'));
    expect(new Set(folders).size).toBe(2);
    t.close();
  });

  it('sanitises folder names', () => {
    expect(sanitize('Café solo / take #2')).toBe('Cafe-solo-take-2');
    expect(sanitize('   ')).toBe('untitled');
    expect(sanitize('x'.repeat(80))).toHaveLength(40);
  });
});

describe('storage accounting', () => {
  it('sums take sizes and flags low space', () => {
    const { t, store, files, take } = setup();
    take(new Date().toISOString());
    take(new Date().toISOString(), undefined, false);
    expect(totalTakesBytes(t.db)).toBe(4_000_000);
    store.freeBytes = 500 * 1024 * 1024;
    expect(storageStatus(t.db, files)).toMatchObject({ low: true, cannotRecord: false, takesBytes: 4_000_000 });
    store.freeBytes = 100 * 1024 * 1024;
    expect(storageStatus(t.db, files).cannotRecord).toBe(true);
    expect(formatBytes(1536)).toBe('2 KB');
    expect(formatBytes(4_000_000)).toBe('3.8 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB');
    t.close();
  });
});
