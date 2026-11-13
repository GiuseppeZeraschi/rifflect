/** Target tempo entry (FR-003): whole BPM 30–300, or empty for none. */
export const MIN_BPM = 30;
export const MAX_BPM = 300;

/** null = no target; undefined = invalid entry. */
export function parseTempo(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d{1,3}$/.test(t)) return undefined;
  const bpm = Number(t);
  return bpm >= MIN_BPM && bpm <= MAX_BPM ? bpm : undefined;
}
