/**
 * Feedback text for every issue code at each skill level (tasks.md T051, research.md R8, FR-009/011).
 *
 * Text depends only on the issue code, the finding's metrics and the skill level (contract
 * guarantee 6). The point's time is passed in as the `atMs` metric.
 *   beginner     — plain words, encouraging, one simple drill
 *   intermediate — more specific, names the mechanism
 *   advanced     — concise and technical
 */
import type { IssueCode, SkillLevel } from '../types';

export type Metrics = Record<string, number | string>;
type Text = (m: Metrics) => string;
type ByLevel = Record<SkillLevel, Text>;

export interface CatalogueEntry {
  /** Short label for summaries and recurring issues, e.g. "Rushing beat 4". */
  headline: Text;
  observation: ByLevel;
  suggestion: ByLevel;
}

const num = (m: Metrics, k: string) => (typeof m[k] === 'number' ? (m[k] as number) : Number(m[k] ?? 0));
const str = (m: Metrics, k: string) => String(m[k] ?? '');
const abs = (v: number) => Math.abs(Math.round(v / 5) * 5);

/** "around 0:42" from the atMs metric. */
export function around(m: Metrics): string {
  const s = Math.max(0, Math.round(num(m, 'atMs') / 1000));
  return `around ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "bars 3–6" or "bar 3" from barFrom/barTo metrics; empty if unknown. */
export function bars(m: Metrics): string {
  const a = num(m, 'barFrom');
  const b = num(m, 'barTo');
  if (!a) return '';
  return a === b || !b ? `bar ${a}` : `bars ${a}–${b}`;
}

const same = (t: Text): ByLevel => ({ beginner: t, intermediate: t, advanced: t });

export const CATALOGUE: Record<IssueCode, CatalogueEntry> = {
  'timing.steady': {
    headline: () => 'Steady timing',
    observation: {
      beginner: (m) => `Your timing was nice and steady at about ${num(m, 'bpm')} BPM.`,
      intermediate: (m) => `Steady timing: notes landed within about ${abs(num(m, 'meanAbsOffsetMs'))} ms of the beat at ${num(m, 'bpm')} BPM.`,
      advanced: (m) => `Tight: mean deviation ≈${abs(num(m, 'meanAbsOffsetMs'))} ms at ${num(m, 'bpm')} BPM.`,
    },
    suggestion: {
      beginner: () => 'Keep it up. Try nudging the tempo up a few BPM next time.',
      intermediate: () => 'Push the tempo 5–10 BPM, or try the same part with a different strumming pattern.',
      advanced: () => 'Raise the tempo, or work on deliberately playing slightly ahead of or behind the beat.',
    },
  },
  'timing.rushing': {
    headline: (m) => `Rushing beat ${num(m, 'beat')}`,
    observation: {
      beginner: (m) => `You tend to play beat ${num(m, 'beat')} a little early, by about ${abs(num(m, 'meanOffsetMs'))} ms.`,
      intermediate: (m) => `Beat ${num(m, 'beat')} came about ${abs(num(m, 'meanOffsetMs'))} ms early (${num(m, 'count')} times${bars(m) ? `, ${bars(m)}` : ''}).`,
      advanced: (m) => `Beat ${num(m, 'beat')} rushed by ≈${abs(num(m, 'meanOffsetMs'))} ms across ${num(m, 'count')} bars.`,
    },
    suggestion: {
      beginner: (m) => `Count out loud "1, 2, 3, 4" and wait for "${num(m, 'beat')}" before you play it.`,
      intermediate: (m) => `Count the "and" before beat ${num(m, 'beat')} out loud and let that note land on the count, not before it.`,
      advanced: (m) => `Subdivide into the space before beat ${num(m, 'beat')}; practise with the click on 2 and 4 to expose it.`,
    },
  },
  'timing.dragging': {
    headline: (m) => `Dragging beat ${num(m, 'beat')}`,
    observation: {
      beginner: (m) => `You tend to play beat ${num(m, 'beat')} a little late, by about ${abs(num(m, 'meanOffsetMs'))} ms.`,
      intermediate: (m) => `Beat ${num(m, 'beat')} came about ${abs(num(m, 'meanOffsetMs'))} ms late (${num(m, 'count')} times${bars(m) ? `, ${bars(m)}` : ''}).`,
      advanced: (m) => `Beat ${num(m, 'beat')} dragged by ≈${abs(num(m, 'meanOffsetMs'))} ms across ${num(m, 'count')} bars.`,
    },
    suggestion: {
      beginner: (m) => `Get your hand ready a moment before beat ${num(m, 'beat')} so you're not reaching for it.`,
      intermediate: (m) => `Check what happens just before beat ${num(m, 'beat')}: a chord change there often makes it late. Practise just that change slowly.`,
      advanced: (m) => `Isolate the transition into beat ${num(m, 'beat')} and anticipate the shift by a subdivision.`,
    },
  },
  'timing.uneven_subdivision': {
    headline: () => 'Uneven rhythm',
    observation: {
      beginner: () => 'Some notes were a bit early and some a bit late, so the rhythm felt uneven.',
      intermediate: (m) => `Your notes wandered around the beat by about ${abs(num(m, 'spreadMs'))} ms, so the rhythm felt uneven.`,
      advanced: (m) => `Timing spread ≈${abs(num(m, 'spreadMs'))} ms (std) around the grid.`,
    },
    suggestion: {
      beginner: () => 'Slow down a little and tap your foot on every beat while you play.',
      intermediate: () => 'Drop the tempo by 10–15% and keep a constant down-up motion in your strumming hand, even on rests.',
      advanced: () => 'Work at a slower tempo with subdivided clicks, then rebuild speed in small steps.',
    },
  },
  'timing.tempo_drift_up': {
    headline: () => 'Speeding up',
    observation: {
      beginner: (m) => `You sped up from about ${num(m, 'startBpm')} to ${num(m, 'endBpm')} BPM during the take.`,
      intermediate: (m) => `Tempo crept up by about ${num(m, 'driftBpm')} BPM (${num(m, 'startBpm')} → ${num(m, 'endBpm')}).`,
      advanced: (m) => `Tempo drift +${num(m, 'driftBpm')} BPM (${num(m, 'startBpm')} → ${num(m, 'endBpm')}).`,
    },
    suggestion: {
      beginner: () => 'Play along with a metronome app, and listen for when you start to pull ahead of it.',
      intermediate: () => 'Practise with an external metronome and notice where the excitement makes you push.',
      advanced: () => 'Record against a click and mark where the drift starts; usually it\'s at the busier passages.',
    },
  },
  'timing.tempo_drift_down': {
    headline: () => 'Slowing down',
    observation: {
      beginner: (m) => `You slowed down from about ${num(m, 'startBpm')} to ${num(m, 'endBpm')} BPM during the take.`,
      intermediate: (m) => `Tempo sagged by about ${num(m, 'driftBpm')} BPM (${num(m, 'startBpm')} → ${num(m, 'endBpm')}).`,
      advanced: (m) => `Tempo drift −${num(m, 'driftBpm')} BPM (${num(m, 'startBpm')} → ${num(m, 'endBpm')}).`,
    },
    suggestion: {
      beginner: () => 'Try a slightly slower starting tempo that you can keep all the way through.',
      intermediate: () => 'Find the harder section that slows you down and practise it on its own at the target tempo.',
      advanced: () => 'Isolate the passages where the tempo sags and drill them at tempo against a click.',
    },
  },
  'timing.off_target_tempo': {
    headline: (m) => `Off target tempo (${num(m, 'playedBpm')} vs ${num(m, 'targetBpm')})`,
    observation: same(
      (m) => `You played at about ${num(m, 'playedBpm')} BPM, ${Math.abs(num(m, 'deltaBpm'))} BPM ${str(m, 'direction')} than your ${num(m, 'targetBpm')} BPM target.`,
    ),
    suggestion: {
      beginner: (m) => `Listen to a metronome at ${num(m, 'targetBpm')} BPM for a few bars before you start, then begin with it.`,
      intermediate: (m) => `Count yourself in at ${num(m, 'targetBpm')} BPM with a metronome before each take.`,
      advanced: (m) => `Lock in ${num(m, 'targetBpm')} BPM with a count-in; check where you start to deviate.`,
    },
  },
  'timing.locked_to_accompaniment': {
    headline: () => 'Locked in with the backing',
    observation: {
      beginner: () => 'Your playing sat nicely with the backing.',
      intermediate: (m) => `Your notes landed within about ${abs(num(m, 'meanAbsOffsetMs'))} ms of the backing's beat.`,
      advanced: (m) => `Tight against the backing: ≈${abs(num(m, 'meanAbsOffsetMs'))} ms mean deviation.`,
    },
    suggestion: {
      beginner: () => 'Great. Try a faster loop or a busier part next.',
      intermediate: () => 'Try more syncopated phrasing over the same loop.',
      advanced: () => 'Experiment with deliberate push and lay-back against the loop.',
    },
  },
  'timing.ahead_of_accompaniment': {
    headline: (m) => `Ahead of the loop${(m.beat ? ` on beat ${num(m, 'beat')}` : bars(m) ? ` in ${bars(m)}` : '')}`,
    observation: {
      beginner: (m) => `Your notes came a little before the backing's beat${(m.beat ? ` on beat ${num(m, 'beat')}` : bars(m) ? ` in ${bars(m)}` : '')}, by about ${abs(num(m, 'meanOffsetMs'))} ms.`,
      intermediate: (m) => `Your lead landed about ${abs(num(m, 'meanOffsetMs'))} ms ahead of the loop${(m.beat ? ` on beat ${num(m, 'beat')}` : bars(m) ? ` in ${bars(m)}` : '')}.`,
      advanced: (m) => `Leading the loop by ≈${abs(num(m, 'meanOffsetMs'))} ms${(m.beat ? ` on beat ${num(m, 'beat')}` : bars(m) ? ` in ${bars(m)}` : '')}.`,
    },
    suggestion: {
      beginner: () => 'Listen to the loop for a bar before you come in, and try to play with it rather than over it.',
      intermediate: () => 'Leave a little more space: aim for your notes to land right on the loop\'s strums.',
      advanced: () => 'Relax into the pocket; practise laying back slightly to counter the push.',
    },
  },
  'timing.behind_accompaniment': {
    headline: (m) => `Behind the loop${(m.beat ? ` on beat ${num(m, 'beat')}` : bars(m) ? ` in ${bars(m)}` : '')}`,
    observation: {
      beginner: (m) => `Your notes came a little after the backing's beat${(m.beat ? ` on beat ${num(m, 'beat')}` : bars(m) ? ` in ${bars(m)}` : '')}, by about ${abs(num(m, 'meanOffsetMs'))} ms.`,
      intermediate: (m) => `Your lead landed about ${abs(num(m, 'meanOffsetMs'))} ms behind the loop${(m.beat ? ` on beat ${num(m, 'beat')}` : bars(m) ? ` in ${bars(m)}` : '')}.`,
      advanced: (m) => `Trailing the loop by ≈${abs(num(m, 'meanOffsetMs'))} ms${(m.beat ? ` on beat ${num(m, 'beat')}` : bars(m) ? ` in ${bars(m)}` : '')}.`,
    },
    suggestion: {
      beginner: () => 'Get your fingers to the next note a little earlier so you can play right with the loop.',
      intermediate: () => 'Anticipate position shifts so the note is ready when the loop\'s beat arrives.',
      advanced: () => 'Pre-plan fingerings for the phrase; practise the line against the loop at a lower tempo.',
    },
  },
  'timing.lost_place_in_loop': {
    headline: () => 'Lost place in the loop',
    observation: {
      beginner: (m) => `${around(m)[0]!.toUpperCase()}${around(m).slice(1)}, you seemed to lose your place in the loop for a while.`,
      intermediate: (m) => `${around(m)[0]!.toUpperCase()}${around(m).slice(1)}, your phrase shifted by about ${num(m, 'shiftBeats')} beats against the loop.`,
      advanced: (m) => `Phrase displaced ≈${num(m, 'shiftBeats')} beats against the loop ${around(m)}.`,
    },
    suggestion: {
      beginner: () => 'Count the bars of the loop out loud while you play so you always know where "1" is.',
      intermediate: () => 'Listen for the start of each loop cycle and re-anchor your phrase to it.',
      advanced: () => 'Practise landing phrase endings on the loop\'s downbeat to keep the form in your ear.',
    },
  },
  'technique.clean': {
    headline: (m) => (str(m, 'checked') === 'buzz' ? 'No fret buzz' : 'Clean notes'),
    observation: {
      beginner: (m) => (str(m, 'checked') === 'buzz' ? 'We didn’t hear any fret buzz in your playing.' : 'Your notes rang out clearly.'),
      intermediate: (m) =>
        str(m, 'checked') === 'buzz'
          ? `None of the ${num(m, 'notes')} notes we could pick out from the backing buzzed.`
          : `All ${num(m, 'notes')} notes we checked rang clearly, without buzz or dead notes.`,
      advanced: (m) =>
        str(m, 'checked') === 'buzz'
          ? 'No buzz detected in the live part (other clarity checks need a solo take).'
          : 'Clean articulation: no buzz, dead notes or stray open strings detected.',
    },
    suggestion: {
      beginner: () => 'Nice. Keep the same light, firm pressure as you try harder chords.',
      intermediate: () => 'Keep that clarity as you add speed.',
      advanced: () => 'Maintain it at higher tempos and with more dynamic range.',
    },
  },
  'technique.fret_buzz': {
    headline: () => 'Fret buzz',
    observation: {
      beginner: (m) => `Some notes buzzed (${num(m, 'count')} of ${num(m, 'of')}), first ${around({ atMs: num(m, 'firstAtMs') })}.`,
      intermediate: (m) => `We heard fret buzz on ${num(m, 'count')} of ${num(m, 'of')} notes, starting ${around({ atMs: num(m, 'firstAtMs') })}.`,
      advanced: (m) => `Buzz on ${num(m, 'count')}/${num(m, 'of')} notes (first ${around({ atMs: num(m, 'firstAtMs') })}).`,
    },
    suggestion: {
      beginner: () => 'Press your fingertips just behind the fret wire, not in the middle of the gap.',
      intermediate: () => 'Place fingers right behind the fret and press firmly with the tips. Check your thumb isn\'t pulling your hand away from the neck.',
      advanced: () => 'Fret closer to the wire and check finger arch; if it persists on one fret, check the setup.',
    },
  },
  'technique.muted_notes': {
    headline: () => 'Muted notes',
    observation: {
      beginner: (m) => `Some notes stopped ringing very quickly (${num(m, 'count')} of ${num(m, 'of')}).`,
      intermediate: (m) => `${num(m, 'count')} of ${num(m, 'of')} notes died away almost immediately, as if a finger was touching the string.`,
      advanced: (m) => `Premature decay on ${num(m, 'count')}/${num(m, 'of')} notes; likely unintended muting.`,
    },
    suggestion: {
      beginner: () => 'Curve your fingers more so they only touch the strings they\'re pressing.',
      intermediate: () => 'Arch your fingers and play on the very tips so they don\'t brush neighbouring strings.',
      advanced: () => 'Check finger arch and palm contact on the bridge; isolate the shapes where it happens.',
    },
  },
  'technique.unwanted_open_strings': {
    headline: () => 'Open strings ringing',
    observation: {
      beginner: () => 'Some open strings were ringing that probably shouldn\'t have been.',
      intermediate: (m) => `Low open strings kept ringing under ${num(m, 'count')} notes.`,
      advanced: (m) => `Unmuted open strings sounding under ${num(m, 'count')} notes.`,
    },
    suggestion: {
      beginner: () => 'Only strum the strings that belong to the chord, or rest your hand lightly on the ones you don\'t want.',
      intermediate: () => 'Mute unused strings with the side of your fretting fingers or your picking-hand palm.',
      advanced: () => 'Tighten up muting: fretting-hand underside on unused strings, picking-hand palm on the low strings.',
    },
  },
  'technique.fret_thumb_over_neck': {
    headline: () => 'Thumb over the neck',
    observation: {
      beginner: (m) => `Your fretting thumb was over the top of the neck most of the time (${num(m, 'fractionPct')}%).`,
      intermediate: (m) =>
        str(m, 'chordLike') === 'yes'
          ? `Your thumb wrapped over the neck ${num(m, 'fractionPct')}% of the time. That's fine for many chord shapes.`
          : `Your thumb wrapped over the neck ${num(m, 'fractionPct')}% of the time, even during single-note playing.`,
      advanced: (m) => `Thumb over the neck ${num(m, 'fractionPct')}% of the take${str(m, 'chordLike') === 'yes' ? ' (chordal context)' : ''}.`,
    },
    suggestion: {
      beginner: () => 'For single notes and stretches, try resting your thumb behind the neck instead.',
      intermediate: () => 'Move the thumb behind the neck for scales and wider stretches; keep the wrap for chords that need it.',
      advanced: () => 'Use a classical thumb position for stretches and fast lines; reserve the wrap for chordal muting.',
    },
  },
  'technique.flat_fingers': {
    headline: () => 'Flat fingers',
    observation: {
      beginner: () => 'Your fretting fingers were quite flat, which can mute other strings.',
      intermediate: (m) => `Your fretting fingers were flatter than ideal ${num(m, 'fractionPct')}% of the time.`,
      advanced: (m) => `Low finger arch (mean PIP ≈${num(m, 'meanPipDeg')}°) for ${num(m, 'fractionPct')}% of the take.`,
    },
    suggestion: {
      beginner: () => 'Curve your fingers like you\'re holding a small ball, and press with the tips.',
      intermediate: () => 'Arch from the middle knuckle and play on the fingertips; slide the thumb lower on the neck to help.',
      advanced: () => 'Increase PIP flexion and drop the thumb lower to free the arch.',
    },
  },
  'technique.fingers_lifting_high': {
    headline: () => 'Fingers lifting high',
    observation: {
      beginner: (m) => `Your ${str(m, 'finger')} finger lifted a long way off the strings between notes.`,
      intermediate: (m) => `Your ${str(m, 'finger')} finger lifted up to ${num(m, 'liftPctOfHand')}% of your hand length between notes.`,
      advanced: (m) => `Excess finger travel: ${str(m, 'finger')} finger up to ${num(m, 'liftPctOfHand')}% of hand length.`,
    },
    suggestion: {
      beginner: () => 'Keep your fingers hovering close to the strings when they aren\'t pressing.',
      intermediate: () => 'Practise slowly, keeping unused fingers within a centimetre of the strings.',
      advanced: () => 'Minimise finger travel; practise economy with slow legato drills.',
    },
  },
  'technique.wrist_strain': {
    headline: () => 'Bent wrist',
    observation: {
      beginner: (m) => `Your fretting wrist stayed strongly bent for ${num(m, 'heldSeconds')} seconds.`,
      intermediate: (m) => `Your fretting wrist held a sharp bend for ${num(m, 'heldSeconds')} seconds, which can cause strain.`,
      advanced: (m) => `Sustained extreme wrist angle (${num(m, 'heldSeconds')} s).`,
    },
    suggestion: {
      beginner: () => 'Bring your elbow in a little and tilt the guitar neck up so your wrist can be straighter.',
      intermediate: () => 'Raise the neck angle and move your elbow closer to your body to straighten the wrist.',
      advanced: () => 'Adjust neck angle and elbow position to keep the wrist nearer neutral.',
    },
  },
  'technique.inconsistent_strum': {
    headline: () => 'Uneven strumming',
    observation: {
      beginner: (m) =>
        str(m, 'mainly') === 'size' ? 'Your strums were very different sizes.' : 'Your strums weren\'t evenly spaced.',
      intermediate: (m) =>
        str(m, 'mainly') === 'size'
          ? `Your strum size varied a lot (about ${num(m, 'sizeVariationPct')}%).`
          : `The spacing of your strums varied by about ${num(m, 'timingVariationPct')}%.`,
      advanced: (m) => `Strum consistency: size CV ${num(m, 'sizeVariationPct')}%, timing CV ${num(m, 'timingVariationPct')}%.`,
    },
    suggestion: {
      beginner: () => 'Keep your strumming arm moving down and up all the time, like a pendulum, even when you don\'t hit the strings.',
      intermediate: () => 'Keep a constant down-up motion from the wrist and vary only whether you hit the strings.',
      advanced: () => 'Stabilise the stroke arc; drive the pattern from a constant pendulum motion.',
    },
  },
  'technique.stopped_strum_motion': {
    headline: () => 'Strumming hand stopped',
    observation: {
      beginner: (m) => `Your strumming hand stopped moving for a moment (longest pause about ${Math.round(num(m, 'longestPauseMs') / 100) / 10} s).`,
      intermediate: (m) => `Your strumming hand paused ${num(m, 'pauses')} time(s) while the music carried on.`,
      advanced: (m) => `Picking-hand motion stopped ${num(m, 'pauses')}× (longest ${Math.round(num(m, 'longestPauseMs') / 100) / 10} s).`,
    },
    suggestion: {
      beginner: () => 'Keep your hand moving down and up through the gaps, just miss the strings.',
      intermediate: () => 'Treat rests as "ghost strums": keep the motion going and skip the strings.',
      advanced: () => 'Maintain continuous motion through rests to keep the internal subdivision.',
    },
  },
};
