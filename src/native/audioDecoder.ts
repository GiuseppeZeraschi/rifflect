/**
 * Typed wrapper around the audio decoder native module (contracts/native-modules.md § 2).
 * Mocked in tests: src/native/__mocks__/audioDecoder.ts.
 */
import Native, { type AudioDecoderErrorCode, type DecodeResult } from '../../modules/rifflect-audio-decoder/src';

export type { AudioDecoderErrorCode, DecodeResult };

export interface DecodeOptions {
  sampleRate: 22050;
  mono: true;
}

/** Decode a video's audio track to mono float32 PCM at `pcmUri`. Rejects with a coded error. */
export function decodeAudioTrack(videoUri: string, pcmUri: string, opts: DecodeOptions): Promise<DecodeResult> {
  return Native.decodeAudioTrack(videoUri, pcmUri, opts.sampleRate);
}

/** Read `frames` samples starting at `offsetFrames` (fewer at the end of the file). */
export function readPcmChunk(pcmUri: string, offsetFrames: number, frames: number): Float32Array {
  const bytes = Native.readPcmChunk(pcmUri, offsetFrames, frames);
  // Copy into an aligned buffer: the native byte array's offset may not be a multiple of 4.
  const aligned = new Uint8Array(bytes.byteLength);
  aligned.set(bytes);
  return new Float32Array(aligned.buffer, 0, aligned.byteLength >> 2);
}

/** The error code of a decoder failure, if it is one. */
export function decoderErrorCode(e: unknown): AudioDecoderErrorCode | undefined {
  const code = (e as { code?: unknown })?.code;
  return code === 'E_NO_AUDIO_TRACK' || code === 'E_DECODE_FAILED' || code === 'E_FILE_NOT_FOUND' ? code : undefined;
}
