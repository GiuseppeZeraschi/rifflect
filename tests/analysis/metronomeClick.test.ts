/**
 * The app's metronome (src/features/metronome/clickTrack.ts) must be recognised by the engine as a
 * click track, so timing is measured against it.
 */
import { analyseTake } from '@/analysis';
import { detectAccompaniment } from '@/analysis/accompaniment/detect';
import { CLICK_SAMPLE_RATE, clickPositions, clickTrackWav } from '@/features/metronome/clickTrack';
import { onsetTrain, rmsOf } from '../helpers/synth';

/** WAV bytes → Float32 samples. */
function decode(wav: Uint8Array): Float32Array {
  const pcm = new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.byteLength - 44) / 2);
  return Float32Array.from(pcm, (v) => v / 32768);
}

describe('metronome click track', () => {
  it('places every click on the exact beat, in whole bars, longer than a take', () => {
    const { clicks, totalSamples } = clickPositions({ bpm: 160, beatsPerBar: 3 });
    expect(totalSamples / CLICK_SAMPLE_RATE).toBeGreaterThanOrEqual(330);
    expect(clicks.length % 3).toBe(0);
    expect(clicks.filter((c) => c.accent).length).toBe(clicks.length / 3);
    const beat = (60 / 160) * CLICK_SAMPLE_RATE;
    clicks.forEach((c, k) => expect(Math.abs(c.at - k * beat)).toBeLessThanOrEqual(0.5));
  });

  it('writes a valid 16-bit mono WAV header', () => {
    const wav = clickTrackWav({ bpm: 120, beatsPerBar: 4, minSeconds: 2 });
    const text = (a: number, b: number) => String.fromCharCode(...wav.slice(a, b));
    const view = new DataView(wav.buffer);
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 12)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(CLICK_SAMPLE_RATE);
    expect(view.getUint32(40, true)).toBe(wav.byteLength - 44);
  });

  it('rejects tempos outside 30–300', () => {
    expect(() => clickPositions({ bpm: 20, beatsPerBar: 4 })).toThrow();
  });

  it.each([
    [160, 3],
    [96, 4],
  ])(
    'is detected as a click under guitar playing (%i BPM, %i/4)',
    async (bpm, beatsPerBar) => {
      const click = decode(clickTrackWav({ bpm, beatsPerBar, minSeconds: 24 }));
      // Guitar notes on the beat, louder than the click (as when the phone plays it quietly).
      const { samples: guitar } = onsetTrain({
        bpm,
        beats: Math.floor((20 * bpm) / 60),
        startMs: 0,
        seed: 5,
      });
      const n = Math.min(click.length, guitar.length);
      const gain = (0.5 * rmsOf(guitar)) / rmsOf(click);
      const mix = Float32Array.from({ length: n }, (_, i) => guitar[i]! + gain * click[i]!);

      const d = detectAccompaniment(mix, { metronomeBpm: bpm });
      expect(d.kind).toBe('click');
      expect(Math.abs(d.clickPeriodMs! - 60000 / bpm)).toBeLessThan(1);

      const r = await analyseTake({
        audio: { sampleRate: CLICK_SAMPLE_RATE, samples: mix },
        landmarks: null,
        durationMs: (n / CLICK_SAMPLE_RATE) * 1000,
        player: { handedness: 'right', skillLevel: 'intermediate' },
        cameraPosition: 'front',
        accompaniment: 'off',
        metronomeBpm: bpm,
        beatsPerBar,
      });
      expect(r.status).toBe('analysed');
      expect(r.accompaniment).toMatchObject({ kind: 'click', timingReference: 'accompaniment' });
    },
    60_000,
  );
});
