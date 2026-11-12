/**
 * JS binding for the RifflectAudioDecoder native module (contracts/native-modules.md § 2).
 * App code uses the typed wrapper in src/native/audioDecoder.ts, not this file directly.
 */
import { NativeModule, requireNativeModule } from 'expo';

export interface DecodeResult {
  /** file:// URI of the little-endian float32 PCM file. */
  pcmPath: string;
  sampleRate: number;
  frames: number;
  durationMs: number;
  peak: number;
}

export const AUDIO_DECODER_ERRORS = ['E_NO_AUDIO_TRACK', 'E_DECODE_FAILED', 'E_FILE_NOT_FOUND'] as const;
export type AudioDecoderErrorCode = (typeof AUDIO_DECODER_ERRORS)[number];

declare class RifflectAudioDecoderModule extends NativeModule {
  decodeAudioTrack(videoUri: string, pcmUri: string, sampleRate: number): Promise<DecodeResult>;
  /** Raw little-endian float32 bytes. */
  readPcmChunk(pcmUri: string, offsetFrames: number, frames: number): Uint8Array;
}

export default requireNativeModule<RifflectAudioDecoderModule>('RifflectAudioDecoder');
