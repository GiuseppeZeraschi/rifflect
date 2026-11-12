/**
 * Live analysis state for the UI (tasks.md T034, T064): progress and status per take, plus the takes
 * whose analysing screen the user left (so a notice can appear when they finish).
 * Built on zustand's vanilla store so it works outside React (the queue) and in Node tests.
 */
import { createStore } from 'zustand/vanilla';

import type { AnalysisStatus } from '@/data/db/schema';
import type { AnalysisQueue } from './analysisQueue';

export interface AnalysisProgressState {
  progress: Record<string, number>;
  status: Record<string, AnalysisStatus>;
  /** Takes whose analysing screen the user left ("we'll let you know"). */
  leftTakeIds: string[];
  markLeft(takeId: string): void;
  clearLeft(takeId: string): void;
}

export function createAnalysisProgressStore() {
  return createStore<AnalysisProgressState>()((set) => ({
    progress: {},
    status: {},
    leftTakeIds: [],
    markLeft: (takeId) =>
      set((s) => (s.leftTakeIds.includes(takeId) ? s : { leftTakeIds: [...s.leftTakeIds, takeId] })),
    clearLeft: (takeId) => set((s) => ({ leftTakeIds: s.leftTakeIds.filter((id) => id !== takeId) })),
  }));
}

export type AnalysisProgressStore = ReturnType<typeof createAnalysisProgressStore>;

/** Mirror queue events into the store. Returns an unsubscribe function. */
export function connectProgressStore(queue: AnalysisQueue, store: AnalysisProgressStore): () => void {
  return queue.subscribe((e) => {
    if (e.type === 'progress') {
      store.setState((s) => ({ progress: { ...s.progress, [e.takeId]: e.progress } }));
    } else {
      store.setState((s) => ({
        status: { ...s.status, [e.takeId]: e.status },
        progress: e.status === 'analysing' ? { ...s.progress, [e.takeId]: 0 } : s.progress,
      }));
    }
  });
}
