import { parseTempo } from '@/features/record/tempo';

describe('target tempo entry', () => {
  it('treats empty as no target', () => {
    expect(parseTempo('')).toBeNull();
    expect(parseTempo('  ')).toBeNull();
  });
  it('accepts whole BPM from 30 to 300', () => {
    expect(parseTempo('30')).toBe(30);
    expect(parseTempo('120')).toBe(120);
    expect(parseTempo('300')).toBe(300);
  });
  it('rejects values outside 30–300 and non-integers', () => {
    for (const t of ['29', '301', '0', '12.5', 'abc', '1000']) expect(parseTempo(t)).toBeUndefined();
  });
});
