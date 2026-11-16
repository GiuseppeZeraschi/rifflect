/**
 * App-wide job singletons: the analysis queue (wired to the real runner) and its progress store.
 */
import { useStore } from 'zustand';

import { db } from '@/data/db/client';
import { takeFiles } from '@/data/files';
import { decodeAudioTrack, readPcmChunk } from '@/native/audioDecoder';
import { extractLandmarksFromVideo } from '@/native/handLandmarker';
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
  keepPcm: __DEV__,
  // Hand tracking after the take (tasks.md T021), written to the take's folder.
  extractLandmarksFromVideo: async (takeId, videoUri, fps, onProgress) => {
    const rel = takeFiles.relLandmarksPath(takeId);
    await extractLandmarksFromVideo(videoUri, takeFiles.toAbsolute(rel), fps, onProgress);
    return rel;
  },
});

export const analysisQueue = createAnalysisQueue({ db, runner });

export const analysisProgress = createAnalysisProgressStore();
connectProgressStore(analysisQueue, analysisProgress);

export function useAnalysisProgress<T>(selector: (s: AnalysisProgressState) => T): T {
  return useStore(analysisProgress, selector);
}
