/**
 * Player profile repository (tasks.md T053). One row, id "me" (data-model.md § PlayerProfile).
 */
import { eq } from 'drizzle-orm';

import {
  ACCOMPANIMENT_SETTINGS,
  CAMERA_POSITIONS,
  HANDEDNESS,
  playerProfile,
  SKILL_LEVELS,
  type AccompanimentSetting,
  type CameraPosition,
  type Handedness,
  type PlayerProfileRow,
  type SkillLevel,
} from '@/data/db/schema';
import type { Db } from '@/data/db/types';
import { nowIso } from '@/lib/time';

export const PROFILE_ID = 'me';

export interface ProfileInput {
  handedness: Handedness;
  skillLevel: SkillLevel;
  preferredCamera?: CameraPosition;
  lastAccompanimentSetting?: AccompanimentSetting;
}

function assertOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): asserts value is T {
  if (!allowed.includes(value as T)) throw new Error(`Invalid ${field}: ${String(value)}`);
}

export function getProfile(db: Db): PlayerProfileRow | undefined {
  return db.select().from(playerProfile).where(eq(playerProfile.id, PROFILE_ID)).get();
}

/** Create the profile, or update the fields given. */
export function upsertProfile(db: Db, input: Partial<ProfileInput>): PlayerProfileRow {
  if (input.handedness !== undefined) assertOneOf(input.handedness, HANDEDNESS, 'handedness');
  if (input.skillLevel !== undefined) assertOneOf(input.skillLevel, SKILL_LEVELS, 'skillLevel');
  if (input.preferredCamera !== undefined) assertOneOf(input.preferredCamera, CAMERA_POSITIONS, 'preferredCamera');
  if (input.lastAccompanimentSetting !== undefined) {
    assertOneOf(input.lastAccompanimentSetting, ACCOMPANIMENT_SETTINGS, 'lastAccompanimentSetting');
  }
  const now = nowIso();
  const existing = getProfile(db);
  if (!existing) {
    if (!input.handedness || !input.skillLevel) {
      throw new Error('A new profile needs handedness and skillLevel');
    }
    db.insert(playerProfile)
      .values({
        id: PROFILE_ID,
        handedness: input.handedness,
        skillLevel: input.skillLevel,
        preferredCamera: input.preferredCamera ?? 'front',
        lastAccompanimentSetting: input.lastAccompanimentSetting ?? 'auto',
        createdAt: now,
        updatedAt: now,
      })
      .run();
  } else {
    const changes = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    db.update(playerProfile).set({ ...changes, updatedAt: now }).where(eq(playerProfile.id, PROFILE_ID)).run();
  }
  return getProfile(db)!;
}
