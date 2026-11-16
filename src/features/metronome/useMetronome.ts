/**
 * Plays the metronome while `playing` is true: renders the click track for this tempo and time
 * signature to a WAV in the cache (reused next time), then loops it with expo-audio.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';

import { clickTrackWav } from './clickTrack';

function trackFile(bpm: number, beatsPerBar: number): File {
  const dir = new Directory(Paths.cache, 'metronome');
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `click-${bpm}bpm-${beatsPerBar}.wav`);
  if (!file.exists) file.write(clickTrackWav({ bpm, beatsPerBar }));
  return file;
}

export function useMetronome({
  playing,
  bpm,
  beatsPerBar,
}: {
  playing: boolean;
  bpm: number | null;
  beatsPerBar: number;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playing || bpm === null) return;
    let player: AudioPlayer | null = null;
    let cancelled = false;
    // Defer so the toggle redraws before the (sub-second) render of the track.
    const timer = setTimeout(() => {
      if (cancelled) return;
      try {
        const file = trackFile(bpm, beatsPerBar);
        player = createAudioPlayer({ uri: file.uri });
        player.loop = true;
        player.play();
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (player) {
        try {
          player.pause();
          player.remove();
        } catch {
          // already released
        }
      }
    };
  }, [playing, bpm, beatsPerBar]);

  return { error };
}
