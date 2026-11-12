/** Read and parse a take's landmarks.jsonl from app storage (tasks.md T022). */
import { File } from 'expo-file-system';

import { CLOCK_OFFSET_MS } from '@/capture/clockOffset';
import { parseLandmarksJsonl, type ParseResult } from './landmarksParse';

export async function readLandmarksFile(uri: string): Promise<ParseResult> {
  const file = new File(uri);
  if (!file.exists) return { frames: [], skippedLines: 0 };
  return parseLandmarksJsonl(await file.text(), CLOCK_OFFSET_MS);
}
