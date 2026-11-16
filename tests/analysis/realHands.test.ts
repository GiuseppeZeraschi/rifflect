/**
 * Hand roles on real tracking data (first 5 s of a front-camera take, right-handed player, phone in
 * landscape; recorded mirrored like a selfie). In that take's video the fretting hand is upper left
 * and the picking hand lower right, and MediaPipe labelled the fretting (true left) hand "Right".
 * The engine first assumed the opposite and analysed each hand as the other one.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { assignHands } from '@/analysis/technique/hands';
import { parseLandmarksJsonl } from '@/native/landmarksParse';

const median = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1]!;

describe('hand roles on a real front-camera take', () => {
  const { frames } = parseLandmarksJsonl(
    fs.readFileSync(
      path.resolve(__dirname, '../fixtures-landmarks/front-camera-right-handed.jsonl'),
      'utf8',
    ),
  );

  it('has both hands in most frames', () => {
    expect(frames.length).toBeGreaterThan(50);
    expect(frames.filter((f) => f.hands.length === 2).length / frames.length).toBeGreaterThan(0.8);
  });

  it('takes the hand on the neck as the fretting hand', () => {
    const tracks = assignHands(frames, { handedness: 'right', mirrored: true });
    const wrists = (t: (typeof tracks)['fretting']) =>
      t.filter((p) => p !== null).map((p) => p![0]!);
    const fret = wrists(tracks.fretting);
    const pick = wrists(tracks.picking);
    expect(fret.length).toBeGreaterThan(40);
    expect(pick.length).toBeGreaterThan(40);
    // The fretting hand is higher up the image (on the neck) than the picking hand (at the body)…
    expect(median(fret.map((p) => p[1]))).toBeLessThan(median(pick.map((p) => p[1])));
    // …and, un-mirrored, a right-handed player's fretting hand is on the image right.
    expect(median(fret.map((p) => p[0]))).toBeGreaterThan(0.5);
    expect(median(pick.map((p) => p[0]))).toBeLessThan(0.5);
  });
});
