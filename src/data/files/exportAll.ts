/**
 * "Export all" backup (tasks.md T076, FR-031, data-model.md § "Export all" backup layout).
 *
 *   <chosen folder>/rifflect-export-<YYYY-MM-DD-HHmm>/
 *     takes.json
 *     <YYYY-MM-DD_HHmm>_<label-or-untitled>/video.mp4, feedback.txt
 *
 * Saved takes only. One-way: the app's own storage is never modified. Stops cleanly on the first
 * write failure (e.g. the destination is full) and reports how far it got.
 */
import { asc, eq } from 'drizzle-orm';

import { feedbackPoint, feedbackReport, practiceItem, take } from '@/data/db/schema';
import type { Db } from '@/data/db/types';
import type { TakeFiles } from './takeFiles';

/** Where the export is written (a folder chosen through Android's folder picker in the app). */
export interface ExportTarget {
  createFolder(name: string): Promise<ExportTarget>;
  writeText(name: string, text: string): Promise<void>;
  /** Copy a file from app storage, reporting progress 0..1. */
  copyFile(sourceUri: string, name: string, onProgress?: (fraction: number) => void): Promise<void>;
}

export interface ExportProgress {
  done: number;
  total: number;
  /** Progress within the current take's video, 0..1. */
  current: number;
}

export interface ExportResult {
  folderName: string;
  total: number;
  exported: number;
  /** Set if the export stopped early. */
  error?: { takeId: string; message: string };
}

const pad = (n: number) => String(n).padStart(2, '0');
function stamp(iso: string, sep: '-' | '_'): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}${sep}${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Letters, digits, '-' and '_' only; spaces become '-'; at most 40 characters. */
export function sanitize(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents (after NFKD)
    .replace(/[‐-―−]/g, '-') // Unicode dashes → hyphen
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return s || 'untitled';
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
};

interface TakeExport {
  id: string;
  recordedAt: string;
  durationMs: number;
  label: string | null;
  title: string | null;
  targetTempoBpm: number | null;
  accompanimentKind: string | null;
  timingScore: number | null;
  techniqueScore: number | null;
  summary: string | null;
  points: { category: string; issueCode: string; startMs: number; observation: string; suggestion: string }[];
  limitations: { code: string; message: string }[];
  engineVersion: string | null;
}

export function collectExport(db: Db): (TakeExport & { videoPath: string })[] {
  const rows = db
    .select({
      id: take.id,
      recordedAt: take.recordedAt,
      durationMs: take.durationMs,
      label: practiceItem.name,
      title: take.title,
      targetTempoBpm: take.targetTempoBpm,
      videoPath: take.videoPath,
      reportId: feedbackReport.id,
      accompanimentKind: feedbackReport.accompanimentKind,
      timingScore: feedbackReport.timingScore,
      techniqueScore: feedbackReport.techniqueScore,
      summary: feedbackReport.summary,
      limitations: feedbackReport.limitations,
      engineVersion: feedbackReport.analysisVersion,
    })
    .from(take)
    .leftJoin(practiceItem, eq(take.practiceItemId, practiceItem.id))
    .leftJoin(feedbackReport, eq(feedbackReport.takeId, take.id))
    .where(eq(take.saved, true))
    .orderBy(asc(take.recordedAt))
    .all();
  return rows.map(({ reportId, limitations, ...r }) => ({
    ...r,
    limitations: (limitations ?? []).map(({ code, message }) => ({ code, message })),
    points: reportId
      ? db
          .select({
            category: feedbackPoint.category,
            issueCode: feedbackPoint.issueCode,
            startMs: feedbackPoint.startMs,
            observation: feedbackPoint.observation,
            suggestion: feedbackPoint.suggestion,
          })
          .from(feedbackPoint)
          .where(eq(feedbackPoint.reportId, reportId))
          .orderBy(asc(feedbackPoint.sortOrder))
          .all()
      : [],
  }));
}

export function feedbackText(t: TakeExport): string {
  const lines = [
    `Rifflect take — ${t.title ?? t.label ?? 'Untitled'}`,
    `Recorded: ${new Date(t.recordedAt).toLocaleString()}`,
    `Length: ${clock(t.durationMs)}`,
    t.label ? `Label: ${t.label}` : null,
    t.targetTempoBpm ? `Target tempo: ${t.targetTempoBpm} BPM` : null,
    '',
    `Timing score: ${t.timingScore ?? 'not enough data'}`,
    `Technique score: ${t.techniqueScore ?? 'not enough data'}`,
    t.summary ? `Summary: ${t.summary}` : 'Not analysed.',
    '',
    ...t.points.map((p) => `[${clock(p.startMs)}] ${p.observation} — ${p.suggestion}`),
    ...(t.limitations.length ? ['', 'What couldn’t be checked:', ...t.limitations.map((l) => `- ${l.message}`)] : []),
  ];
  return lines.filter((l): l is string => l !== null).join('\n') + '\n';
}

export async function exportAll({
  db,
  files,
  target,
  now = () => new Date().toISOString(),
  onProgress,
}: {
  db: Db;
  files: Pick<TakeFiles, 'toAbsolute'>;
  target: ExportTarget;
  now?: () => string;
  onProgress?: (p: ExportProgress) => void;
}): Promise<ExportResult> {
  const takes = collectExport(db);
  const folderName = `rifflect-export-${stamp(now(), '-')}`;
  const total = takes.length;
  const root = await target.createFolder(folderName);
  await root.writeText(
    'takes.json',
    JSON.stringify(takes.map(({ videoPath: _videoPath, ...t }) => t), null, 2),
  );

  const used = new Set<string>();
  let exported = 0;
  for (const t of takes) {
    onProgress?.({ done: exported, total, current: 0 });
    let name = `${stamp(t.recordedAt, '_')}_${sanitize(t.label ?? t.title ?? 'untitled')}`;
    for (let n = 2; used.has(name); n++) name = `${name.replace(/-\d+$/, '')}-${n}`;
    used.add(name);
    try {
      const dir = await root.createFolder(name);
      await dir.writeText('feedback.txt', feedbackText(t));
      await dir.copyFile(files.toAbsolute(t.videoPath), 'video.mp4', (current) => onProgress?.({ done: exported, total, current }));
      exported++;
    } catch (e) {
      return { folderName, total, exported, error: { takeId: t.id, message: e instanceof Error ? e.message : String(e) } };
    }
  }
  onProgress?.({ done: exported, total, current: 1 });
  return { folderName, total, exported };
}
