import { FramingWindow, framingStatus } from '@/capture/framingCheck';
import type { HandsResult } from '@/native/handTypes';
import { DEFAULT_FRETTING, landmarkStream } from '../../helpers/synthLandmarks';

function results(opts: Parameters<typeof landmarkStream>[0]): HandsResult[] {
  return landmarkStream(opts).map((f) => ({ tMs: f.tMs, hands: f.hands, brightness: f.brightness ?? 0.5 }));
}
const opts = { handedness: 'right' as const, mirrored: false };

describe('framingStatus', () => {
  it('is ok with both hands visible, fretting hand in frame and enough light', () => {
    const r = framingStatus(results({ durationMs: 2500 }), opts);
    expect(r.status).toBe('ok');
    expect(r.hint).toMatch(/good/i);
  });

  it('reports hands_missing when a hand is missing in more than 20% of frames', () => {
    const r = framingStatus(results({ durationMs: 2500, picking: (t) => (t > 1500 ? null : { wrist: [0.3, 0.6] }) }), opts);
    expect(r.status).toBe('hands_missing');
  });

  it('reports hands_missing with no frames at all', () => {
    expect(framingStatus([], opts).status).toBe('hands_missing');
  });

  it('reports fretting_out_of_frame when the fretting hand touches the edge', () => {
    const r = framingStatus(results({ durationMs: 2500, fretting: () => ({ ...DEFAULT_FRETTING, wrist: [0.95, 0.62] }) }), opts);
    expect(r.status).toBe('fretting_out_of_frame');
    expect(r.hint).toMatch(/move/i);
  });

  it('reports low_light first when the picture is dark', () => {
    expect(framingStatus(results({ durationMs: 2500, brightness: 0.08 }), opts).status).toBe('low_light');
  });

  it('respects handedness: a left-handed player frets with the hand on the image left', () => {
    const left = results({ durationMs: 2500, handedness: 'left', fretting: () => ({ ...DEFAULT_FRETTING, wrist: [0.95, 0.62] }) });
    // Layout is mirrored for left-handed players, so the "edge" fretting hand ends up on the left edge.
    expect(framingStatus(left, { handedness: 'left', mirrored: false }).status).toBe('fretting_out_of_frame');
  });
});

describe('FramingWindow', () => {
  it('keeps only the last 30 results', () => {
    const w = new FramingWindow(30);
    const frames = results({ durationMs: 5000 });
    frames.forEach((f) => w.push(f));
    expect(w.size).toBe(30);
    expect(w.status(opts).status).toBe('ok');
  });
});
