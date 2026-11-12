import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { readWav, resample, writeWav16 } from '../../helpers/wav';

describe('wav helper', () => {
  it('round-trips a 16-bit mono file', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rifflect-wav-')), 'a.wav');
    const x = Float32Array.from({ length: 2205 }, (_, i) => 0.5 * Math.sin(i / 7));
    writeWav16(file, x);
    const { samples, sourceRate } = readWav(file);
    expect(sourceRate).toBe(22050);
    expect(samples.length).toBe(x.length);
    expect(Math.max(...samples.map((s, i) => Math.abs(s - x[i]!)))).toBeLessThan(1e-4);
  });

  it('resamples 44.1 kHz to 22.05 kHz keeping a 440 Hz tone', () => {
    const x = Float32Array.from({ length: 44100 }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / 44100));
    const y = resample(x, 44100, 22050);
    expect(y.length).toBe(22050);
    // Zero crossings ≈ 2 × 440 per second.
    let zc = 0;
    for (let i = 1; i < y.length; i++) if (y[i - 1]! < 0 !== y[i]! < 0) zc++;
    expect(Math.abs(zc - 880)).toBeLessThan(10);
  });
});
