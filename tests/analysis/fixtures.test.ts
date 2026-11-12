/**
 * Real-recording fixture suite (tasks.md T039). Each folder in tests/fixtures/<name>/ holds:
 *   audio.wav          mono or stereo, any sample rate
 *   landmarks.jsonl    optional (from tools/eval/extract_landmarks.py or copied off the phone)
 *   input.json         { player: { handedness, skillLevel }, cameraPosition, targetTempoBpm?, accompaniment }
 *   expected.json      { status?, mustInclude?: string[], mustNotInclude?: string[],
 *                        timingScore?: [min, max], techniqueScore?: [min, max] }
 * With no fixtures yet, the suite passes with a single "no fixtures" test.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { analyseTake, type AnalysisInput } from '@/analysis';
import { parseLandmarksJsonl } from '@/native/landmarksParse';
import { readWav, TARGET_RATE } from '../helpers/wav';

const FIXTURES = path.resolve(__dirname, '../fixtures');

interface Expected {
  status?: 'analysed' | 'no_playing';
  mustInclude?: string[];
  mustNotInclude?: string[];
  timingScore?: [number, number];
  techniqueScore?: [number, number];
}

const names = fs.existsSync(FIXTURES)
  ? fs.readdirSync(FIXTURES).filter((n) => fs.existsSync(path.join(FIXTURES, n, 'audio.wav')))
  : [];

if (names.length === 0) {
  it('has no fixtures yet (add recordings to tests/fixtures/<name>/, see tasks.md T041)', () => {
    expect(names).toEqual([]);
  });
}

(names.length > 0 ? describe.each(names) : () => () => undefined)('fixture %s', (name: string) => {
  const dir = path.join(FIXTURES, name);
  const read = <T,>(file: string): T => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as T;

  it('meets its expectations', async () => {
    const { samples } = readWav(path.join(dir, 'audio.wav'));
    const meta = read<Omit<AnalysisInput, 'audio' | 'landmarks' | 'durationMs'>>('input.json');
    const expected = read<Expected>('expected.json');
    const lmPath = path.join(dir, 'landmarks.jsonl');
    const landmarks = fs.existsSync(lmPath) ? parseLandmarksJsonl(fs.readFileSync(lmPath, 'utf8')).frames : null;

    const result = await analyseTake({
      ...meta,
      audio: { sampleRate: TARGET_RATE, samples },
      landmarks,
      durationMs: Math.round((samples.length / TARGET_RATE) * 1000),
    });
    const codes = result.points.map((p) => p.issueCode as string);

    if (expected.status) expect(result.status).toBe(expected.status);
    for (const c of expected.mustInclude ?? []) expect(codes).toContain(c);
    for (const c of expected.mustNotInclude ?? []) expect(codes).not.toContain(c);
    if (expected.timingScore) {
      expect(result.timingScore).not.toBeNull();
      expect(result.timingScore!).toBeGreaterThanOrEqual(expected.timingScore[0]);
      expect(result.timingScore!).toBeLessThanOrEqual(expected.timingScore[1]);
    }
    if (expected.techniqueScore) {
      expect(result.techniqueScore).not.toBeNull();
      expect(result.techniqueScore!).toBeGreaterThanOrEqual(expected.techniqueScore[0]);
      expect(result.techniqueScore!).toBeLessThanOrEqual(expected.techniqueScore[1]);
    }
  }, 60_000);
});
