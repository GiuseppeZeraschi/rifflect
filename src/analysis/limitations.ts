/**
 * User-facing limitation entries (tasks.md T049, FR-012): what couldn't be analysed, and where.
 */
import type { Limitation, LimitationCode } from './types';

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const MESSAGES: Record<LimitationCode, (range?: string) => string> = {
  hands_not_visible: (r) => `Your hands weren't visible${r ?? ''}, so technique feedback doesn't cover that part.`,
  fretting_hand_out_of_frame: (r) => `Your fretting hand was partly out of frame${r ?? ''}. Move the phone back a little next time.`,
  low_light: (r) => `It was too dark to see your hands clearly${r ?? ''}. More light will give better technique feedback.`,
  noisy_audio: () => 'There was a lot of background noise, so timing and clarity feedback may be less accurate.',
  clipping_audio: () => 'The recording was too loud and distorted in places. Try moving the phone further from the amp.',
  landmarks_missing: () => "Hand tracking wasn't available for this take, so technique feedback is based on sound only.",
  posture_not_assessed: () => "Posture isn't assessed yet: this version only looks at your hands.",
  tempo_not_detected: () => "We couldn't find a steady beat, so detailed timing feedback isn't available for this take.",
  take_interrupted: () => 'This take was interrupted, so only the recorded part was analysed.',
  accompaniment_separation_low: () => "We couldn't reliably separate your playing from the backing, so some feedback was held back.",
  accompaniment_too_loud: () => 'The backing was much louder than your guitar, which made your playing hard to hear.',
  accompaniment_changed: (r) => `The backing changed${r ?? ''}, so feedback there is less certain.`,
  unison_with_accompaniment: (r) => `You played the same notes as the loop${r ?? ''}, so those notes couldn't be told apart.`,
  too_few_loop_cycles: () => 'The loop repeated fewer than twice, so it was treated as a backing track.',
};

export function limitation(code: LimitationCode, fromMs?: number, toMs?: number): Limitation {
  const range = fromMs !== undefined && toMs !== undefined ? ` from ${formatTime(fromMs)} to ${formatTime(toMs)}` : undefined;
  return {
    code,
    message: MESSAGES[code](range),
    ...(fromMs !== undefined ? { fromMs: Math.round(fromMs) } : {}),
    ...(toMs !== undefined ? { toMs: Math.round(toMs) } : {}),
  };
}
