import { isoWeekKey, localDayKey, nowIso } from '@/lib/time';

describe('time helpers', () => {
  it('nowIso returns an ISO-8601 UTC string', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('localDayKey uses the local calendar day', () => {
    const d = new Date(2026, 10, 12, 23, 30); // local time, 12 Nov 2026 23:30
    expect(localDayKey(d.toISOString())).toBe('2026-11-12');
  });

  it('isoWeekKey follows ISO-8601 weeks (Monday start, week 1 contains Jan 4)', () => {
    const key = (y: number, m: number, d: number) => isoWeekKey(new Date(y, m - 1, d, 12).toISOString());
    expect(key(2026, 11, 12)).toBe('2026-W46');
    expect(key(2026, 11, 9)).toBe('2026-W46'); // Monday
    expect(key(2026, 11, 8)).toBe('2026-W45'); // Sunday
    expect(key(2021, 1, 3)).toBe('2020-W53'); // belongs to the previous ISO year
    expect(key(2024, 12, 30)).toBe('2025-W01'); // belongs to the next ISO year
  });
});
