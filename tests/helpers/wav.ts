/**
 * Minimal WAV reader for fixtures (tasks.md T039): PCM 16/24/32-bit integer or 32-bit float,
 * any channel count and sample rate. Downmixes to mono and resamples (linear) to 22,050 Hz.
 */
import * as fs from 'node:fs';

export const TARGET_RATE = 22050;

export function readWav(path: string): { samples: Float32Array; sourceRate: number } {
  const buf = fs.readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path}: not a RIFF/WAVE file`);
  }
  let pos = 12;
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  let data: Buffer | null = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = buf.subarray(pos + 8, pos + 8 + size);
    if (id === 'fmt ') {
      let format = body.readUInt16LE(0);
      if (format === 0xfffe) format = body.readUInt16LE(24); // WAVE_FORMAT_EXTENSIBLE sub-format
      fmt = { format, channels: body.readUInt16LE(2), rate: body.readUInt32LE(4), bits: body.readUInt16LE(14) };
    } else if (id === 'data') {
      data = body;
    }
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`${path}: missing fmt or data chunk`);
  const { format, channels, rate, bits } = fmt;
  const bytes = bits / 8;
  const frames = Math.floor(data.length / (bytes * channels));
  const read = (offset: number): number => {
    if (format === 3 && bits === 32) return data!.readFloatLE(offset);
    if (format !== 1) throw new Error(`${path}: unsupported WAV format ${format}/${bits}-bit`);
    if (bits === 16) return data!.readInt16LE(offset) / 32768;
    if (bits === 24) return data!.readIntLE(offset, 3) / 8388608;
    if (bits === 32) return data!.readInt32LE(offset) / 2147483648;
    throw new Error(`${path}: unsupported bit depth ${bits}`);
  };
  const mono = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += read((f * channels + c) * bytes);
    mono[f] = s / channels;
  }
  return { samples: resample(mono, rate, TARGET_RATE), sourceRate: rate };
}

/** Linear-interpolation resampler with a simple moving-average pre-filter when downsampling. */
export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  let src = x;
  if (from > to) {
    const k = Math.max(1, Math.round(from / to));
    src = new Float32Array(x.length);
    let acc = 0;
    for (let i = 0; i < x.length; i++) {
      acc += x[i]!;
      if (i >= k) acc -= x[i - k]!;
      src[i] = acc / Math.min(i + 1, k);
    }
  }
  const n = Math.floor((src.length * to) / from);
  const out = new Float32Array(n);
  const step = from / to;
  for (let i = 0; i < n; i++) {
    const p = i * step;
    const j = Math.floor(p);
    const frac = p - j;
    out[i] = src[j]! * (1 - frac) + (src[j + 1] ?? src[j]!) * frac;
  }
  return out;
}

/** Write a mono 16-bit WAV (used by tests to create temporary fixtures). */
export function writeWav16(path: string, samples: Float32Array, rate = TARGET_RATE) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path, Buffer.concat([header, data]));
}
