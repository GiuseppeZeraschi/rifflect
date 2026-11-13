/** App-wide recording controller, wired to the database, files, queue and VisionCamera. */
import { db } from '@/data/db/client';
import { takeFiles } from '@/data/files';
import { upsertProfile } from '@/data/repositories/profileRepo';
import { analysisQueue } from '@/jobs';
import { createVisionRecorder } from './cameraSession';
import { createRecordingController } from './recordingController';

export const recordingController = createRecordingController({
  db,
  files: takeFiles,
  createRecorder: createVisionRecorder,
  enqueue: (id) => analysisQueue.enqueue(id),
  rememberAccompaniment: (setting) => upsertProfile(db, { lastAccompanimentSetting: setting }),
  // openLandmarkSink: added with the native hand-landmarker module (tasks.md T020).
});
