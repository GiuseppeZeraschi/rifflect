/**
 * App-wide job singletons: the analysis queue and its progress store.
 *
 * The runner is set once the analysis pipeline exists (src/jobs/runAnalysis.ts, tasks.md T060).
 * Until then, queued takes fail with a clear message rather than silently doing nothing.
 */
import { useStore } from 'zustand';

import { db } from '@/data/db/client';
import { createAnalysisQueue, type Runner } from './analysisQueue';
import {
  connectProgressStore,
  createAnalysisProgressStore,
  type AnalysisProgressState,
} from './analysisProgressStore';

let runner: Runner = async () => {
  throw new Error('Analysis is not available yet in this build');
};

/** Install the real analysis runner (called once at start-up). */
export function setAnalysisRunner(r: Runner) {
  runner = r;
}

export const analysisQueue = createAnalysisQueue({
  db,
  runner: (takeId, onProgress, signal) => runner(takeId, onProgress, signal),
});

export const analysisProgress = createAnalysisProgressStore();
connectProgressStore(analysisQueue, analysisProgress);

export function useAnalysisProgress<T>(selector: (s: AnalysisProgressState) => T): T {
  return useStore(analysisProgress, selector);
}
