/** Time helpers. Stored timestamps are ISO-8601 UTC; "days" and "weeks" are the user's local ones. */

export function nowIso(): string {
  return new Date().toISOString();
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Local calendar day of an ISO timestamp, as `YYYY-MM-DD`. */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO-8601 week of the local calendar day of an ISO timestamp, as `YYYY-Www`. */
export function isoWeekKey(iso: string): string {
  const local = new Date(iso);
  // Work in UTC on the local calendar date to avoid DST issues.
  const d = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  const dayNum = d.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of this week decides the ISO year
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${pad(week)}`;
}
