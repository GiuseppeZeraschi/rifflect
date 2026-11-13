import { dropHandlingNoise } from '@/analysis/playing';
import { detectOnsets } from '@/analysis/timing/onsets';
import { mixAt, mutedNote, onsetTrain, whiteNoise } from '../helpers/synth';

/** A tap on the phone: a 15 ms burst of noise, no pitch. */
const tap = () => whiteNoise(15, 0.3, 21);

describe('handling noise at the edges of a take', () => {
  // Notes from 1.5 s, so the edge windows hold only the taps.
  const { samples, onsetsMs } = onsetTrain({ bpm: 120, beats: 16, startMs: 1500 });
  const endMs = (samples.length / 22050) * 1000;
  mixAt(samples, tap(), 200); // tapping Record
  mixAt(samples, tap(), endMs - 300); // tapping Stop
  mixAt(samples, mutedNote(196, 3), 5250); // a muted strum mid-take: real playing, keep it

  const near = (list: number[], t: number) => list.some((x) => Math.abs(x - t) < 30);

  it('drops unpitched taps in the first and last second', () => {
    const detected = detectOnsets(samples).onsetsMs;
    expect(near(detected, 200)).toBe(true); // the detector does hear the tap…
    const kept = dropHandlingNoise(samples, detected);
    expect(near(kept, 200)).toBe(false); // …and it's dropped
    expect(near(kept, endMs - 300)).toBe(false);
  });

  it('keeps every note and unpitched sounds mid-take', () => {
    const kept = dropHandlingNoise(samples, detectOnsets(samples).onsetsMs);
    for (const t of onsetsMs) expect(near(kept, t)).toBe(true);
    expect(near(kept, 5250)).toBe(true);
  });
});
