/** Render findings to text, build the one-line summary, and recurring-issue text (tasks.md T051). */
import type { FeedbackPointOut, Finding, IssueCode, SkillLevel } from '../types';
import { CATALOGUE, type Metrics } from './catalogue';

export const SUMMARY_MAX = 140;

/** Text for a finding. Depends only on issueCode, metrics and skill (contract guarantee 6). */
export function renderText(issueCode: IssueCode, metrics: Metrics, skill: SkillLevel) {
  const entry = CATALOGUE[issueCode];
  return { observation: entry.observation[skill](metrics), suggestion: entry.suggestion[skill](metrics) };
}

export function renderFinding(f: Finding, skill: SkillLevel): FeedbackPointOut {
  const metrics: Metrics = { ...f.metrics, atMs: f.startMs };
  return { ...f, metrics, ...renderText(f.issueCode, metrics, skill) };
}

export function headline(issueCode: IssueCode, metrics: Metrics): string {
  return CATALOGUE[issueCode].headline(metrics);
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * One-line summary (≤ 140 chars) from the top points (already sorted most severe first).
 * Problems lead; positives close the line. Tone varies by skill level.
 */
export function buildSummary(points: FeedbackPointOut[], skill: SkillLevel): string {
  const problems = points.filter((p) => p.severity !== 'info').slice(0, 3);
  const positives = points.filter((p) => p.severity === 'info').slice(0, 2);
  let text: string;
  if (problems.length === 0) {
    const good = positives.map((p) => headline(p.issueCode, p.metrics));
    const listed = good.length ? `${good[0]}${good[1] ? ` and ${lowerFirst(good[1])}` : ''}` : 'A solid take';
    text = skill === 'beginner' ? `${listed}. Nice work!` : `${listed}.`;
  } else {
    const parts = problems.map((p) => headline(p.issueCode, p.metrics));
    const lead = skill === 'beginner' ? 'Work on: ' : 'Focus: ';
    text = `${lead}${parts.join(', ')}`;
    if (positives[0]) text += `. ${headline(positives[0].issueCode, positives[0].metrics)} otherwise`;
    text += '.';
  }
  if (text.length > SUMMARY_MAX) text = `${text.slice(0, SUMMARY_MAX - 1).replace(/[\s,.;:]+\S*$/, '')}…`;
  return text;
}

/** "Rushing beat 4 in 6 of your last 8 takes" (US3, FR-021). */
export function recurringText(issueCode: IssueCode, metrics: Metrics, n: number, of: number): string {
  return `${headline(issueCode, metrics)} in ${n} of your last ${of} takes`;
}
