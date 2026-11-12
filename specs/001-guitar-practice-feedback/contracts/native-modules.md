# Contract: Local Native Modules (`modules/`)

There are two local Expo modules, each with one TypeScript interface. v1 implements them in Kotlin (Android) only. Swift (iOS) implementations are deferred and must match the same interface. JS code accesses them only through the typed wrappers in `src/native/`, so tests can replace them with mocks.

## 1. `rifflect-hand-landmarker`: VisionCamera frame-processor plugin

Registered plugin name: `detectHands`.

```ts
// Called inside a VisionCamera frame processor (worklet).
detectHands(frame: Frame, opts: { maxHands: 2; minScore: number /* 0.5 */ }): HandsResult

interface HandsResult {
  tMs: number;            // frame presentation time on the recording clock, in ms
  hands: { side: 'Left' | 'Right'; score: number; pts: [number, number, number][] }[]; // 21 normalised points each
  brightness: number;     // 0..1 mean luma, used for the framing check (low light)
}
```

**Behaviour**
- **Model**: MediaPipe Hand Landmarker `.task`, bundled with the app (no download). Runs in **VIDEO** running mode (synchronous `detectForVideo(image, timestampMs)`) on iOS and Android. The frame processor needs the result back in the same call; LIVE_STREAM mode only returns results asynchronously via a callback.
- **Frame rate**: the JS caller throttles it to `targetFps` (12; a single constant, as there is no device tiering in v1). The plugin itself never blocks for more than 40 ms.
- **Coordinates**: normalised to the upright, un-mirrored image. `side` is MediaPipe's raw label; mirror correction happens in the engine (contract guarantee 5).

**Companion functions**

`openLandmarkWriter(takeId): WriterHandle`, `append(handle, HandsResult)`, `close(handle)`
- Writes `landmarks.jsonl` from native code, buffered, so a crash loses at most 1 s of frames.

`extractLandmarksFromVideo(videoPath, fps): Promise<string /* landmarksPath */>`
- The fallback used when `landmarksPath` is null ([research R3](../research.md#r3-on-device-handpose-tracking-technique-analysis)).

## 2. `rifflect-audio-decoder`

```ts
decodeAudioTrack(videoPath: string, opts: { sampleRate: 22050; mono: true }):
  Promise<{ pcmPath: string; sampleRate: number; frames: number; durationMs: number; peak: number }>

readPcmChunk(pcmPath: string, offsetFrames: number, frames: number): Float32Array  // JSI/ArrayBuffer, zero-copy where supported
```

**Behaviour**
- **Platform decoders**: Android uses `MediaExtractor` + `MediaCodec`, then resamples. iOS (deferred) will use `AVAssetReader` (Linear PCM float32 output settings).
- **Partial recordings**: a cleanly stopped interrupted recording (phone call, backgrounding) is a normal file and decodes normally. A file left by a crash or power loss may be unreadable (e.g. a missing MP4 index); the decoder MUST return `E_DECODE_FAILED` or `E_NO_AUDIO_TRACK` for it rather than crash, and recovery then deletes the take (spec edge case).
- **Errors**: `E_NO_AUDIO_TRACK`, `E_DECODE_FAILED`, `E_FILE_NOT_FOUND`. All are surfaced to the job queue as `analysisStatus = failed` with a retry option.

## Third-party modules used directly (no wrapper contract)

- **react-native-vision-camera**: preview, recording (`startRecording` / `stopRecording`), frame processors.
- **expo-sqlite**, **expo-file-system**, **expo-media-library**, **expo-video**, **expo-sharing**.
