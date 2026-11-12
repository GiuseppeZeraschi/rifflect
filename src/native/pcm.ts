/**
 * Load a decoded PCM file into one Float32Array, reading in chunks (tasks.md T023), so the native
 * side never has to hand over a 5-minute take (~26 MB) in one call.
 */
export const PCM_CHUNK_FRAMES = 1_048_576;

export type ChunkReader = (pcmUri: string, offsetFrames: number, frames: number) => Float32Array;

export interface LoadPcmOptions {
  totalFrames: number;
  readChunk: ChunkReader;
  chunkFrames?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export async function loadPcm(pcmUri: string, o: LoadPcmOptions): Promise<Float32Array> {
  const chunk = o.chunkFrames ?? PCM_CHUNK_FRAMES;
  const out = new Float32Array(o.totalFrames);
  let offset = 0;
  while (offset < o.totalFrames) {
    if (o.signal?.aborted) throw new Error('Aborted');
    const part = o.readChunk(pcmUri, offset, Math.min(chunk, o.totalFrames - offset));
    if (part.length === 0) break; // file shorter than reported
    out.set(part, offset);
    offset += part.length;
    o.onProgress?.(offset / o.totalFrames);
    // Yield between chunks so the UI stays responsive.
    await new Promise((r) => setTimeout(r, 0));
  }
  return offset === o.totalFrames ? out : out.slice(0, offset);
}
