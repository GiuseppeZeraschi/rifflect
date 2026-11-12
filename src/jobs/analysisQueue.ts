/**
 * In-app analysis job queue (research.md R13, tasks.md T034).
 *
 * - One job at a time, FIFO, keyed by take id (a take is never queued twice).
 * - Status in SQLite: pending → analysing → analysed | no_playing | failed. `retry` re-queues a failed take.
 * - The runner (decode audio → analyse → save report) is injected, so tests can replace it.
 * - `loadPending()` only enqueues takes already `pending`; repairing statuses after a crash or kill
 *   is the job of src/jobs/recovery.ts, which runs first at start-up.
 * - Runs independently of screens, so analysis continues while the user navigates the app.
 */
import { asc, eq } from 'drizzle-orm';

import { take, type AnalysisStatus } from '@/data/db/schema';
import type { Db } from '@/data/db/types';
import { nowIso } from '@/lib/time';

export type RunnerResult = 'analysed' | 'no_playing';
export type Runner = (takeId: string, onProgress: (fraction: number) => void, signal: AbortSignal) => Promise<RunnerResult>;

export type QueueEvent =
  | { takeId: string; type: 'status'; status: AnalysisStatus }
  | { takeId: string; type: 'progress'; progress: number };

export interface AnalysisQueue {
  enqueue(takeId: string): void;
  retry(takeId: string): void;
  loadPending(): void;
  subscribe(listener: (e: QueueEvent) => void): () => void;
  lastError(takeId: string): string | undefined;
  /** Resolves when the queue is empty and nothing is running. */
  idle(): Promise<void>;
  /** Abort the running job (if it's this take) or drop it from the queue. */
  cancel(takeId: string): void;
}

export function createAnalysisQueue({ db, runner }: { db: Db; runner: Runner }): AnalysisQueue {
  const queue: string[] = [];
  const listeners = new Set<(e: QueueEvent) => void>();
  const errors = new Map<string, string>();
  let running: { takeId: string; controller: AbortController } | null = null;
  let idleWaiters: (() => void)[] = [];

  const emit = (e: QueueEvent) => listeners.forEach((l) => l(e));

  const setStatus = (takeId: string, status: AnalysisStatus) => {
    db.update(take).set({ analysisStatus: status, updatedAt: nowIso() }).where(eq(take.id, takeId)).run();
    emit({ takeId, type: 'status', status });
  };

  const settleIdle = () => {
    if (!running && queue.length === 0) {
      const waiters = idleWaiters;
      idleWaiters = [];
      waiters.forEach((w) => w());
    }
  };

  async function pump(): Promise<void> {
    if (running) return;
    const takeId = queue.shift();
    if (takeId === undefined) {
      settleIdle();
      return;
    }
    const controller = new AbortController();
    running = { takeId, controller };
    try {
      setStatus(takeId, 'analysing');
      const result = await runner(takeId, (progress) => emit({ takeId, type: 'progress', progress }), controller.signal);
      errors.delete(takeId);
      setStatus(takeId, controller.signal.aborted ? 'pending' : result);
    } catch (e) {
      errors.set(takeId, e instanceof Error ? e.message : String(e));
      setStatus(takeId, controller.signal.aborted ? 'pending' : 'failed');
    } finally {
      running = null;
      // Continue on the next tick so a long queue never grows the call stack.
      setTimeout(() => void pump(), 0);
    }
  }

  const isQueued = (takeId: string) => running?.takeId === takeId || queue.includes(takeId);

  return {
    enqueue(takeId) {
      if (isQueued(takeId)) return;
      const current = db.select({ s: take.analysisStatus }).from(take).where(eq(take.id, takeId)).get();
      if (!current) return;
      if (current.s !== 'pending') setStatus(takeId, 'pending');
      else emit({ takeId, type: 'status', status: 'pending' });
      queue.push(takeId);
      void pump();
    },
    retry(takeId) {
      this.enqueue(takeId);
    },
    loadPending() {
      const rows = db
        .select({ id: take.id })
        .from(take)
        .where(eq(take.analysisStatus, 'pending'))
        .orderBy(asc(take.recordedAt))
        .all();
      for (const { id } of rows) {
        if (!isQueued(id)) queue.push(id);
      }
      void pump();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    lastError: (takeId) => errors.get(takeId),
    idle() {
      if (!running && queue.length === 0) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
    cancel(takeId) {
      const i = queue.indexOf(takeId);
      if (i >= 0) queue.splice(i, 1);
      if (running?.takeId === takeId) running.controller.abort();
      settleIdle();
    },
  };
}
