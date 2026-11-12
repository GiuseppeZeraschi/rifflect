/** Live player profile for screens (re-renders when it changes). */
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/data/db/client';
import { playerProfile, type PlayerProfileRow } from '@/data/db/schema';
import { PROFILE_ID, upsertProfile, type ProfileInput } from '@/data/repositories/profileRepo';

export function useProfile(): PlayerProfileRow | undefined {
  const { data } = useLiveQuery(db.select().from(playerProfile).where(eq(playerProfile.id, PROFILE_ID)));
  return data[0];
}

export function updateProfile(input: Partial<ProfileInput>) {
  return upsertProfile(db, input);
}

export const HANDEDNESS_OPTIONS = [
  { value: 'right' as const, label: 'Right-handed', description: 'You strum with your right hand' },
  { value: 'left' as const, label: 'Left-handed', description: 'You strum with your left hand' },
];

export const SKILL_OPTIONS = [
  { value: 'beginner' as const, label: 'Beginner', description: 'Learning chords and first songs' },
  { value: 'intermediate' as const, label: 'Intermediate', description: 'Comfortable with chords, working on lead or rhythm' },
  { value: 'advanced' as const, label: 'Advanced', description: 'Refining technique and timing' },
];

export const CAMERA_OPTIONS = [
  { value: 'front' as const, label: 'Front camera', description: 'See yourself while you play' },
  { value: 'back' as const, label: 'Back camera', description: 'Better image quality' },
];
