/**
 * App-wide job singletons: the analysis queue (wired to the real runner) and its progress store.
 */
import { useStore } from 'zustand';

import { db } from '@/data/db/client';
import { takeFiles } from '@/data/files';
import { decodeAudioTrack, readPcmChunk } from '@/native/audioDecoder';
import { readLandmarksFile } from '@/native/landmarksFile';
import { createAnalysisQueue } from './analysisQueue';
import {
  connectProgressStore,
  createAnalysisProgressStore,
  type AnalysisProgressState,
} from './analysisProgressStore';
import { createRunner } from './runAnalysis';

const runner = createRunner({
  db,
  files: takeFiles,
  decodeAudioTrack,
  readPcmChunk,
  readLandmarks: async (uri) => (await readLandmarksFile(uri)).frames,
  // extractLandmarksFromVideo: added with the native hand-landmarker module (tasks.md T021).
});

export const analysisQueue = createAnalysisQueue({ db, runner });

export const analysisProgress = createAnalysisProgressStore();
connectProgressStore(analysisQueue, analysisProgress);

export function useAnalysisProgress<T>(selector: (s: AnalysisProgressState) => T): T {
  return useStore(analysisProgress, selector);
}
