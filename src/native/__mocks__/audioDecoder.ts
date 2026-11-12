/**
 * Jest mock for src/native/audioDecoder.ts. Tests register PCM with `__setPcm(uri, samples)` and
 * failures with `__failDecode(videoUri, code)`.
 */
import type { DecodeOptions, DecodeResult } from '../audioDecoder';

const pcm = new Map<string, Float32Array>();
const sources = new Map<string, Float32Array>();
const failures = new Map<string, string>();

export function __setSource(videoUri: string, samples: Float32Array) {
  sources.set(videoUri, samples);
}
export function __failDecode(videoUri: string, code: 'E_NO_AUDIO_TRACK' | 'E_DECODE_FAILED' | 'E_FILE_NOT_FOUND') {
  failures.set(videoUri, code);
}
export function __reset() {
  pcm.clear();
  sources.clear();
  failures.clear();
}

export async function decodeAudioTrack(videoUri: string, pcmUri: string, opts: DecodeOptions): Promise<DecodeResult> {
  const code = failures.get(videoUri);
  if (code) throw Object.assign(new Error(code), { code });
  const samples = sources.get(videoUri);
  if (!samples) throw Object.assign(new Error('E_FILE_NOT_FOUND'), { code: 'E_FILE_NOT_FOUND' });
  pcm.set(pcmUri, samples);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  return { pcmPath: pcmUri, sampleRate: opts.sampleRate, frames: samples.length, durationMs: (samples.length / opts.sampleRate) * 1000, peak };
}

export function readPcmChunk(pcmUri: string, offsetFrames: number, frames: number): Float32Array {
  const all = pcm.get(pcmUri);
  if (!all) throw Object.assign(new Error('E_FILE_NOT_FOUND'), { code: 'E_FILE_NOT_FOUND' });
  return all.slice(offsetFrames, offsetFrames + frames);
}

export function decoderErrorCode(e: unknown) {
  return (e as { code?: string })?.code;
}
