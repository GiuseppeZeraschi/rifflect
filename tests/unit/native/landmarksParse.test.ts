import { parseLandmarksJsonl } from '@/native/landmarksParse';

const pts = Array.from({ length: 21 }, (_, i) => [i / 21, 0.5, 0]);
const line = (t: number, extra: object = {}) =>
  JSON.stringify({ t, hands: [{ side: 'Right', score: 0.9, pts }], ...extra });

describe('parseLandmarksJsonl', () => {
  it('parses frames, keeps brightness and sorts by time', () => {
    const text = [line(166), line(83, { b: 0.42 }), JSON.stringify({ t: 0, hands: [] })].join('\n');
    const { frames, skippedLines } = parseLandmarksJsonl(text);
    expect(skippedLines).toBe(0);
    expect(frames.map((f) => f.tMs)).toEqual([0, 83, 166]);
    expect(frames[1]!.brightness).toBe(0.42);
    expect(frames[2]!.hands[0]!.pts).toHaveLength(21);
  });

  it('skips a truncated last line and malformed hands without failing', () => {
    const text = [line(0), line(83), '{"t":166,"hands":[{"side":"Le'].join('\n');
    const bad = JSON.stringify({ t: 250, hands: [{ side: 'Left', score: 0.9, pts: pts.slice(0, 5) }] });
    const r = parseLandmarksJsonl(text + '\n' + bad + '\n\n');
    expect(r.frames.map((f) => f.tMs)).toEqual([0, 83]);
    expect(r.skippedLines).toBe(2);
  });

  it('applies the clock offset and fills a missing z with 0', () => {
    const twoD = JSON.stringify({ t: 100, hands: [{ side: 'Left', score: 0.8, pts: pts.map(([x, y]) => [x, y]) }] });
    const { frames } = parseLandmarksJsonl(twoD, -12);
    expect(frames[0]!.tMs).toBe(88);
    expect(frames[0]!.hands[0]!.pts[3]).toEqual([3 / 21, 0.5, 0]);
  });
});
