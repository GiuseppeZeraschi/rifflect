import { eq } from 'drizzle-orm';

import { feedbackPoint, feedbackReport, playerProfile, practiceItem, take } from '@/data/db/schema';
import { createTestDb } from '../../helpers/testDb';

const NOW = '2026-11-12T10:00:00.000Z';

function baseTake(id: string, overrides: Partial<typeof take.$inferInsert> = {}) {
  return {
    id,
    recordedAt: NOW,
    cameraPosition: 'front' as const,
    handednessAtRecording: 'right' as const,
    skillLevelAtRecording: 'beginner' as const,
    videoPath: `takes/${id}/video.mp4`,
    captureStatus: 'complete' as const,
    analysisStatus: 'pending' as const,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('schema constraints (production migrations)', () => {
  let t: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    t = createTestDb();
  });
  afterEach(() => t.close());

  it('only allows the single "me" profile row and valid enums', () => {
    const row = { handedness: 'left' as const, skillLevel: 'advanced' as const, createdAt: NOW, updatedAt: NOW };
    t.db.insert(playerProfile).values({ id: 'me', ...row }).run();
    expect(() => t.db.insert(playerProfile).values({ id: 'you', ...row }).run()).toThrow(/CHECK/);
    const me = t.db.select().from(playerProfile).get();
    expect(me?.preferredCamera).toBe('front');
    expect(me?.lastAccompanimentSetting).toBe('auto');
    expect(() =>
      t.sqlite.prepare(`UPDATE player_profile SET handedness = 'both' WHERE id = 'me'`).run(),
    ).toThrow(/CHECK/);
  });

  it('keeps practice item names unique ignoring case, 1–60 chars, trimmed', () => {
    t.db.insert(practiceItem).values({ id: 'a', name: 'G–C–D', createdAt: NOW }).run();
    expect(() => t.db.insert(practiceItem).values({ id: 'b', name: 'g–c–d', createdAt: NOW }).run()).toThrow(/UNIQUE/);
    expect(() => t.db.insert(practiceItem).values({ id: 'c', name: '', createdAt: NOW }).run()).toThrow(/CHECK/);
    expect(() => t.db.insert(practiceItem).values({ id: 'd', name: ' padded ', createdAt: NOW }).run()).toThrow(/CHECK/);
    expect(() => t.db.insert(practiceItem).values({ id: 'e', name: 'x'.repeat(61), createdAt: NOW }).run()).toThrow(/CHECK/);
  });

  it('enforces the saved rule, title length and tempo range on takes', () => {
    expect(() =>
      t.db.insert(take).values(baseTake('t1', { captureStatus: 'recording', saved: true })).run(),
    ).toThrow(/CHECK/);
    t.db.insert(take).values(baseTake('t2', { captureStatus: 'partial', interrupted: true, saved: true })).run();
    expect(() => t.db.insert(take).values(baseTake('t3', { title: 'x'.repeat(81) })).run()).toThrow(/CHECK/);
    expect(() => t.db.insert(take).values(baseTake('t4', { targetTempoBpm: 29 })).run()).toThrow(/CHECK/);
    t.db.insert(take).values(baseTake('t5', { targetTempoBpm: 300 })).run();
  });

  it('sets practice_item_id to null when the item is deleted', () => {
    t.db.insert(practiceItem).values({ id: 'item', name: 'Scales', createdAt: NOW }).run();
    t.db.insert(take).values(baseTake('t1', { practiceItemId: 'item' })).run();
    t.db.delete(practiceItem).where(eq(practiceItem.id, 'item')).run();
    expect(t.db.select().from(take).get()?.practiceItemId).toBeNull();
  });

  it('cascades take → report → points and allows one report per take', () => {
    t.db.insert(take).values(baseTake('t1')).run();
    const report = {
      takeId: 't1',
      analysisVersion: '1.0.0+t1',
      summary: 'Steady timing.',
      analysedCoverage: { audio: 1, frettingHand: 1, pickingHand: 1, posture: 0 },
      limitations: [],
      processingMs: 1200,
      createdAt: NOW,
    };
    t.db.insert(feedbackReport).values({ id: 'r1', ...report }).run();
    expect(() => t.db.insert(feedbackReport).values({ id: 'r2', ...report }).run()).toThrow(/UNIQUE/);
    t.db
      .insert(feedbackPoint)
      .values({
        id: 'p1',
        reportId: 'r1',
        category: 'timing',
        aspect: 'rhythm',
        issueCode: 'timing.steady',
        severity: 'info',
        confidence: 0.9,
        startMs: 0,
        observation: 'o',
        suggestion: 's',
        metrics: { meanAbsOffsetMs: 12 },
        sortOrder: 0,
      })
      .run();
    expect(t.db.select().from(feedbackReport).get()?.analysedCoverage.audio).toBe(1);
    t.db.delete(take).where(eq(take.id, 't1')).run();
    expect(t.db.select().from(feedbackReport).all()).toHaveLength(0);
    expect(t.db.select().from(feedbackPoint).all()).toHaveLength(0);
  });
});
