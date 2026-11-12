import { getProfile, upsertProfile } from '@/data/repositories/profileRepo';
import { createTestDb } from '../../helpers/testDb';

describe('profileRepo', () => {
  let t: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    t = createTestDb();
  });
  afterEach(() => t.close());

  it('has no profile on a fresh install', () => {
    expect(getProfile(t.db)).toBeUndefined();
  });

  it('creates the "me" profile with defaults, then updates single fields', () => {
    const p = upsertProfile(t.db, { handedness: 'left', skillLevel: 'beginner' });
    expect(p).toMatchObject({ id: 'me', handedness: 'left', skillLevel: 'beginner', preferredCamera: 'front', lastAccompanimentSetting: 'auto' });
    const q = upsertProfile(t.db, { lastAccompanimentSetting: 'on' });
    expect(q).toMatchObject({ handedness: 'left', lastAccompanimentSetting: 'on' });
  });

  it('requires handedness and skill level for a new profile', () => {
    expect(() => upsertProfile(t.db, { handedness: 'right' })).toThrow(/handedness and skillLevel/);
  });

  it('rejects values outside the schema enums', () => {
    expect(() => upsertProfile(t.db, { handedness: 'both' as never, skillLevel: 'beginner' })).toThrow(/Invalid handedness/);
    upsertProfile(t.db, { handedness: 'right', skillLevel: 'beginner' });
    expect(() => upsertProfile(t.db, { preferredCamera: 'side' as never })).toThrow(/Invalid preferredCamera/);
  });
});
