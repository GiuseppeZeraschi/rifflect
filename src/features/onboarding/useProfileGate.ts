/**
 * Whether onboarding is done (a player profile exists). Live: re-evaluates when the profile row
 * changes, so finishing onboarding switches the app to the tabs automatically.
 */
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/data/db/client';
import { playerProfile } from '@/data/db/schema';
import { PROFILE_ID } from '@/data/repositories/profileRepo';

export function useProfileGate(): { ready: boolean; hasProfile: boolean } {
  const { data, updatedAt } = useLiveQuery(
    db.select({ id: playerProfile.id }).from(playerProfile).where(eq(playerProfile.id, PROFILE_ID)),
  );
  return { ready: updatedAt !== undefined, hasProfile: data.length > 0 };
}
