/**
 * Parse a take's `landmarks.jsonl` (data-model.md § File layout) into engine `LandmarkFrame`s
 * (tasks.md T022). Pure: no file access, so it runs in Node tests.
 *
 * Line format: { "t": tMs, "hands": [{ "side": "Left"|"Right", "score": n, "pts": [[x,y,z]×21] }], "b"?: brightness }
 * Malformed lines (e.g. a half-written last line after a crash) are skipped, never fatal.
 */
import type { HandObservation, LandmarkFrame, Point3 } from '@/analysis/types';

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function parseHand(h: unknown): HandObservation | null {
  if (!h || typeof h !== 'object') return null;
  const { side, score, pts } = h as { side?: unknown; score?: unknown; pts?: unknown };
  if ((side !== 'Left' && side !== 'Right') || !isNum(score) || !Array.isArray(pts) || pts.length !== 21) return null;
  const points: Point3[] = [];
  for (const p of pts) {
    if (!Array.isArray(p) || p.length < 2 || !isNum(p[0]) || !isNum(p[1])) return null;
    points.push([p[0], p[1], isNum(p[2]) ? p[2] : 0]);
  }
  return { side, score, pts: points };
}

export interface ParseResult {
  frames: LandmarkFrame[];
  skippedLines: number;
}

/**
 * @param clockOffsetMs added to every frame time, to align landmarks with the audio clock
 *   (measured by spike T026; 0 until then).
 */
export function parseLandmarksJsonl(text: string, clockOffsetMs = 0): ParseResult {
  const frames: LandmarkFrame[] = [];
  let skippedLines = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      skippedLines++;
      continue;
    }
    const { t, hands, b } = (obj ?? {}) as { t?: unknown; hands?: unknown; b?: unknown };
    if (!isNum(t) || !Array.isArray(hands)) {
      skippedLines++;
      continue;
    }
    const parsed = hands.map(parseHand);
    if (parsed.some((h) => h === null)) {
      skippedLines++;
      continue;
    }
    frames.push({ tMs: t + clockOffsetMs, hands: parsed as HandObservation[], ...(isNum(b) ? { brightness: b } : {}) });
  }
  frames.sort((a, b) => a.tMs - b.tMs);
  return { frames, skippedLines };
}
