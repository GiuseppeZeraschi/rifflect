import { eq } from 'drizzle-orm';

import { take } from '@/data/db/schema';
import { createAnalysisQueue, type QueueEvent, type Runner } from '@/jobs/analysisQueue';
import { createTestDb } from '../../helpers/testDb';

function insertTake(db: ReturnType<typeof createTestDb>['db'], id: string, recordedAt: string, analysisStatus: 'pending' | 'failed' | 'analysed' = 'pending') {
  db.insert(take)
    .values({
      id,
      recordedAt,
      cameraPosition: 'front',
      handednessAtRecording: 'right',
      skillLevelAtRecording: 'beginner',
      videoPath: `takes/${id}/video.mp4`,
      captureStatus: 'complete',
      analysisStatus,
      createdAt: recordedAt,
      updatedAt: recordedAt,
    })
    .run();
}

const statusOf = (db: ReturnType<typeof createTestDb>['db'], id: string) =>
  db.select({ s: take.analysisStatus }).from(take).where(eq(take.id, id)).get()?.s;

/** A runner whose jobs finish only when the test resolves them. */
function controllableRunner() {
  const pending = new Map<string, { resolve: (r: 'analysed' | 'no_playing') => void; reject: (e: Error) => void }>();
  const started: string[] = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  const runner: Runner = (takeId, onProgress) =>
    new Promise((resolve, reject) => {
      started.push(takeId);
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      onProgress(0.5);
      pending.set(takeId, {
        resolve: (r) => {
          concurrent--;
          resolve(r);
        },
        reject: (e) => {
          concurrent--;
          reject(e);
        },
      });
    });
  return { runner, pending, started, maxConcurrent: () => maxConcurrent };
}

const tick = () => new Promise((r) => setImmediate(r));

/** Wait (up to ~1 s) until a condition holds; avoids depending on exact scheduler tick counts. */
async function waitFor(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
  if (!cond()) throw new Error('waitFor timed out');
}

describe('analysis queue', () => {
  let t: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    t = createTestDb();
  });
  afterEach(() => t.close());

  it('runs jobs one at a time in FIFO order and moves statuses pending → analysing → result', async () => {
    insertTake(t.db, 'a', '2026-11-12T10:00:00.000Z');
    insertTake(t.db, 'b', '2026-11-12T10:01:00.000Z');
    const c = controllableRunner();
    const q = createAnalysisQueue({ db: t.db, runner: c.runner });
    q.enqueue('a');
    q.enqueue('b');
    await tick();
    expect(c.started).toEqual(['a']);
    expect(statusOf(t.db, 'a')).toBe('analysing');
    expect(statusOf(t.db, 'b')).toBe('pending');

    c.pending.get('a')!.resolve('analysed');
    await waitFor(() => c.started.length === 2);
    expect(statusOf(t.db, 'a')).toBe('analysed');
    expect(c.started).toEqual(['a', 'b']);

    c.pending.get('b')!.resolve('no_playing');
    await q.idle();
    expect(statusOf(t.db, 'b')).toBe('no_playing');
    expect(c.maxConcurrent()).toBe(1);
  });

  it('marks a failing job as failed, keeps going, and lets it be retried', async () => {
    insertTake(t.db, 'a', '2026-11-12T10:00:00.000Z');
    insertTake(t.db, 'b', '2026-11-12T10:01:00.000Z');
    let failA = true;
    const runner: Runner = async (id) => {
      if (id === 'a' && failA) throw new Error('E_DECODE_FAILED');
      return 'analysed';
    };
    const q = createAnalysisQueue({ db: t.db, runner });
    q.enqueue('a');
    q.enqueue('b');
    await q.idle();
    expect(statusOf(t.db, 'a')).toBe('failed');
    expect(statusOf(t.db, 'b')).toBe('analysed');
    expect(q.lastError('a')).toMatch(/E_DECODE_FAILED/);

    failA = false;
    q.retry('a');
    await q.idle();
    expect(statusOf(t.db, 'a')).toBe('analysed');
  });

  it('does not queue the same take twice', async () => {
    insertTake(t.db, 'a', '2026-11-12T10:00:00.000Z');
    let runs = 0;
    const q = createAnalysisQueue({ db: t.db, runner: async () => (runs++, 'analysed') });
    q.enqueue('a');
    q.enqueue('a');
    await q.idle();
    expect(runs).toBe(1);
  });

  it('loadPending enqueues pending takes by recordedAt and never changes other statuses', async () => {
    insertTake(t.db, 'late', '2026-11-12T12:00:00.000Z');
    insertTake(t.db, 'early', '2026-11-12T09:00:00.000Z');
    insertTake(t.db, 'done', '2026-11-12T08:00:00.000Z', 'analysed');
    insertTake(t.db, 'broken', '2026-11-12T07:00:00.000Z', 'failed');
    const order: string[] = [];
    const q = createAnalysisQueue({ db: t.db, runner: async (id) => (order.push(id), 'analysed') });
    q.loadPending();
    await q.idle();
    expect(order).toEqual(['early', 'late']);
    expect(statusOf(t.db, 'done')).toBe('analysed');
    expect(statusOf(t.db, 'broken')).toBe('failed');
  });

  it('emits progress and status events per take', async () => {
    insertTake(t.db, 'a', '2026-11-12T10:00:00.000Z');
    const events: QueueEvent[] = [];
    const q = createAnalysisQueue({
      db: t.db,
      runner: async (_id, onProgress) => {
        onProgress(0.25);
        onProgress(1);
        return 'analysed';
      },
    });
    q.subscribe((e) => events.push(e));
    q.enqueue('a');
    await q.idle();
    expect(events).toEqual([
      { takeId: 'a', type: 'status', status: 'pending' },
      { takeId: 'a', type: 'status', status: 'analysing' },
      { takeId: 'a', type: 'progress', progress: 0.25 },
      { takeId: 'a', type: 'progress', progress: 1 },
      { takeId: 'a', type: 'status', status: 'analysed' },
    ]);
  });
});
