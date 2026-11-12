import { newId, uuidV7 } from '@/lib/ids';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidV7', () => {
  it('produces RFC 9562 version-7, variant-1 UUIDs', () => {
    for (let i = 0; i < 200; i++) expect(newId()).toMatch(UUID_V7);
  });

  it('encodes the timestamp in the first 48 bits', () => {
    // A future timestamp, so the monotonic guard (earlier IDs used Date.now()) doesn't apply.
    const id = uuidV7(0x1fedcba98765, () => 0);
    expect(id.startsWith('1fedcba9-8765-7')).toBe(true);
  });

  it('sorts by creation time', () => {
    const a = uuidV7(0x2fffffffff00);
    const b = uuidV7(0x2fffffffff01);
    expect(a < b).toBe(true);
  });

  it('stays strictly increasing within the same millisecond', () => {
    const ids = Array.from({ length: 50 }, () => uuidV7(0x2fffffffff02));
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(50);
  });
});
