/**
 * UUID v7 (RFC 9562): 48-bit Unix-ms timestamp, then random bits. IDs sort by creation time,
 * which keeps "newest first" queries and take folders in a natural order.
 *
 * Self-contained so it works on Hermes without a crypto polyfill. Uses `crypto.getRandomValues`
 * when present, otherwise Math.random: these IDs must be unique and time-ordered, not secret.
 */

type RandomBytes = (n: number) => Uint8Array;

const defaultRandomBytes: RandomBytes = (n) => {
  const out = new Uint8Array(n);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(out);
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
};

// Monotonic counter within one millisecond (RFC 9562 §6.2 method 1, 12-bit rand_a as a counter).
let lastMs = -1;
let counter = 0;

/**
 * @param nowMs  timestamp to encode (defaults to Date.now()).
 * @param randomByte  test hook: returns each random byte.
 */
export function uuidV7(nowMs: number = Date.now(), randomByte?: () => number): string {
  const rand = randomByte
    ? (n: number) => Uint8Array.from({ length: n }, () => randomByte() & 0xff)
    : defaultRandomBytes;

  if (nowMs === lastMs) {
    counter++;
    if (counter > 0xfff) {
      // Counter exhausted: borrow the next millisecond to stay monotonic.
      nowMs = lastMs + 1;
      counter = 0;
    }
  } else if (nowMs < lastMs) {
    // Clock went backwards: keep ordering by continuing from the last timestamp.
    nowMs = lastMs;
    counter++;
  } else {
    counter = rand(2).reduce((acc, b) => (acc << 8) | b, 0) & 0x7ff; // leave headroom
  }
  lastMs = nowMs;

  const bytes = new Uint8Array(16);
  const ts = BigInt(Math.floor(nowMs));
  for (let i = 0; i < 6; i++) bytes[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f); // version 7 + counter high bits
  bytes[7] = counter & 0xff;
  const r = rand(8);
  for (let i = 0; i < 8; i++) bytes[8 + i] = r[i]!;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newId(): string {
  return uuidV7();
}
