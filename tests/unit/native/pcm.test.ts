import { loadPcm } from '@/native/pcm';

const source = Float32Array.from({ length: 2_500 }, (_, i) => Math.sin(i / 10));
const reader = (calls: number[][]) => (_uri: string, offset: number, frames: number) => {
  calls.push([offset, frames]);
  return source.slice(offset, offset + frames);
};

describe('loadPcm', () => {
  it('reassembles the file from fixed-size chunks and reports progress', async () => {
    const calls: number[][] = [];
    const progress: number[] = [];
    const out = await loadPcm('file:///x.f32', {
      totalFrames: source.length,
      readChunk: reader(calls),
      chunkFrames: 1_000,
      onProgress: (p) => progress.push(p),
    });
    expect(out).toEqual(source);
    expect(calls).toEqual([
      [0, 1000],
      [1000, 1000],
      [2000, 500],
    ]);
    expect(progress).toEqual([0.4, 0.8, 1]);
  });

  it('returns what exists if the file is shorter than reported', async () => {
    const out = await loadPcm('file:///x.f32', { totalFrames: 4_000, readChunk: reader([]), chunkFrames: 1_000 });
    expect(out.length).toBe(2_500);
  });

  it('stops when aborted', async () => {
    const c = new AbortController();
    c.abort();
    await expect(loadPcm('file:///x.f32', { totalFrames: 10, readChunk: reader([]), signal: c.signal })).rejects.toThrow('Aborted');
  });
});
