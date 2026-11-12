# Contract: Local Native Modules (`modules/`)

There are two local native modules, each with one TypeScript interface. v1 implements them in Kotlin (Android) only. Swift (iOS) implementations are deferred and must match the same interface. JS code accesses them only through the typed wrappers in `src/native/`, so tests can replace them with mocks.

**VisionCamera version**: this contract targets **VisionCamera 5** (Nitro-based). In v5 there are no v4-style registered frame-processor plugins (`VisionCameraProxy.initFrameProcessorPlugin` no longer exists). Instead, `useFrameOutput({ onFrame })` delivers each `Frame` (a Nitro `HybridObject`) to a worklet running on `react-native-worklets` via `react-native-vision-camera-worklets`, and native code that processes frames is itself a Nitro `HybridObject` that takes a `Frame` argument.

## 1. `rifflect-hand-landmarker`: Nitro module (`HandLandmarker` hybrid object)

A Nitro module (`react-native-nitro-modules`, generated with `nitrogen`) exposing a `HandLandmarker` hybrid object. It depends on VisionCamera's `Frame` type.

```ts
// Created once per camera session, on the JS thread; used inside the useFrameOutput worklet.
interface HandLandmarker extends HybridObject<{ android: 'kotlin' /* ios: 'swift' later */ }> {
  // Synchronous; called from the frame-output worklet. The caller still owns the Frame and disposes it.
  detect(frame: Frame): HandsResult
  release(): void
}
createHandLandmarker(opts: { maxHands: 2; minScore: number /* 0.5 */ }): HandLandmarker

interface HandsResult {
  tMs: number;            // frame presentation time on the recording clock, in ms
  hands: { side: 'Left' | 'Right'; score: number; pts: [number, number, number][] }[]; // 21 normalised points each
  brightness: number;     // 0..1 mean luma, used for the framing check (low light)
}
```

**Behaviour**
- **Model**: MediaPipe Hand Landmarker `.task`, bundled with the app (no download). Runs in **VIDEO** running mode (synchronous `detectForVideo(image, timestampMs)`) on iOS and Android. `detect` needs the result back in the same call; LIVE_STREAM mode only returns results asynchronously via a callback.
- **Frame input**: the frame output streams `pixelFormat: 'yuv'` at a modest `targetResolution` (e.g. 640×480; landmarks are normalised, so full resolution isn't needed). On Android, `detect` reads the frame's native buffer (`HardwareBuffer` / `Image`) and wraps it as an `MPImage` without copying through JS.
- **Frame rate**: the worklet throttles calls to `targetFps` (12; a single constant, as there is no device tiering in v1) by comparing `frame.timestamp`, and disposes every frame it skips. `detect` itself never blocks for more than 40 ms. `dropFramesWhileBusy` stays `true` so slow detection can never stall the separate video output that records the take.
- **Coordinates**: normalised to the upright, un-mirrored image. `side` is MediaPipe's raw label; mirror correction happens in the engine (contract guarantee 5).

**Companion functions**

`openLandmarkWriter(takeId): LandmarkWriter` (hybrid object with `append(HandsResult)` and `close()`, callable from the worklet)
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

- **react-native-vision-camera 5** (with `react-native-nitro-modules`, `react-native-nitro-image`, `react-native-vision-camera-worklets`, `react-native-worklets`): preview output, video output with `enableAudio: true` and its `Recorder` for recording, frame output for hand tracking.
- **`rifflect-audio-decoder`** is a standard local Expo module (`create-expo-module --local`); it doesn't touch frames, so it doesn't need Nitro.
- **expo-sqlite**, **expo-file-system**, **expo-media-library**, **expo-video**, **expo-sharing**.
