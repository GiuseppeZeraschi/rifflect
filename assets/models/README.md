# Models

## hand_landmarker.task

MediaPipe Hand Landmarker (float16), used on-device by `modules/rifflect-hand-landmarker` and by
`tools/eval/extract_landmarks.py`, so the app and the evaluation tools use the identical model.

- **Source**: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task
  (Google MediaPipe model card: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)
- **Downloaded**: 2026-11-12
- **Size**: 7,819,105 bytes
- **SHA-256**: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`
- **Contents**: `hand_detector.tflite` (palm detection) + `hand_landmarks_detector.tflite` (21 landmarks)

The native module doesn't load this through Metro. A config plugin copies it into the Android
project's assets at `expo prebuild`, where MediaPipe reads it with `setModelAssetPath`.
If you replace the file, update the checksum above and re-run the fixture and eval suites.
