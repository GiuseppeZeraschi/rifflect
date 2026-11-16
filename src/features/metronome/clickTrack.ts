/**
 * Metronome click track as a 16-bit mono WAV, generated in memory.
 *
 * Why a file rather than timers: clicks scheduled from JavaScript drift by several milliseconds,
 * which is too much for a metronome. A rendered file plays every click at an exact sample, and it
 * is longer than the longest take (5:00) so looping (whose gaplessness isn't guaranteed) is only a
 * fallback.
 *
 * The click is what the analysis engine recognises as a click track
 * (src/analysis/accompaniment/detect.ts): a short burst above the guitar's range (3.5 kHz; the
 * accented beat 1 at 4.5 kHz), gone within ~15 ms. The phone's microphone records it, and timing
 * is then measured against the clicks as heard, which already includes any playback delay.
 */
export const CLICK_SAMPLE_RATE = 22_050;
/** Longer than the 5-minute maximum take, plus time to get going before pressing Record. */
export const MIN_TRACK_SECONDS = 330;

const CLICK_MS = 15;
const DECAY_S = 0.004;
const BEAT_HZ = 3_500;
const ACCENT_HZ = 4_500;
const BEAT_AMP = 0.6;
const ACCENT_AMP = 0.9;

export interface ClickTrackOptions {
  bpm: number;
  beatsPerBar: number;
  /** At least this long; rounded up to whole bars so a loop restarts on beat 1. */
  minSeconds?: number;
  sampleRate?: number;
}

/** Sample index of every click (beat 0 at sample 0) and whether it's an accented beat 1. */
export function clickPositions({
  bpm,
  beatsPerBar,
  minSeconds = MIN_TRACK_SECONDS,
  sampleRate = CLICK_SAMPLE_RATE,
}: ClickTrackOptions) {
  if (!(bpm >= 30 && bpm <= 300)) throw new Error(`Metronome tempo must be 30–300 BPM, got ${bpm}`);
  if (!Number.isInteger(beatsPerBar) || beatsPerBar < 1)
    throw new Error(`Invalid beats per bar: ${beatsPerBar}`);
  const beatSeconds = 60 / bpm;
  const bars = Math.ceil(minSeconds / (beatSeconds * beatsPerBar));
  const beats = bars * beatsPerBar;
  const totalSamples = Math.round(beats * beatSeconds * sampleRate);
  // Positions from the exact beat time (not accumulated), so there is no rounding drift.
  const clicks = Array.from({ length: beats }, (_, k) => ({
    at: Math.round(k * beatSeconds * sampleRate),
    accent: k % beatsPerBar === 0,
  }));
  return { clicks, totalSamples, sampleRate };
}

/** The whole track as WAV bytes. */
export function clickTrackWav(opts: ClickTrackOptions): Uint8Array {
  const { clicks, totalSamples, sampleRate } = clickPositions(opts);
  const clickLen = Math.round((CLICK_MS / 1000) * sampleRate);
  const shape = (hz: number, amp: number) =>
    Int16Array.from({ length: clickLen }, (_, i) =>
      Math.round(
        32767 *
          amp *
          Math.sin((2 * Math.PI * hz * i) / sampleRate) *
          Math.exp(-i / (DECAY_S * sampleRate)),
      ),
    );
  const beat = shape(BEAT_HZ, BEAT_AMP);
  const accent = shape(ACCENT_HZ, ACCENT_AMP);

  const bytes = new Uint8Array(44 + totalSamples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  const pcm = new Int16Array(bytes.buffer, 44, totalSamples);
  for (const { at, accent: isAccent } of clicks) {
    const src = isAccent ? accent : beat;
    for (let i = 0; i < src.length && at + i < totalSamples; i++) pcm[at + i] = src[i]!;
  }
  return bytes;
}
