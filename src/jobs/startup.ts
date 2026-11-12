/**
 * App start-up: recovery first (the single owner of status repair), then the queue picks up
 * pending analyses. The outcome is kept in a small store for the /recover screen.
 */
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

import { db } from '@/data/db/client';
import { takeFiles } from '@/data/files';
import { decodeAudioTrack } from '@/native/audioDecoder';
import { analysisQueue } from '.';
import { runRecovery, type ProbeResult } from './recovery';

interface RecoveryState {
  ran: boolean;
  interruptedIds: string[];
  lostCount: number;
  dismissLost(): void;
}

export const recoveryStore = createStore<RecoveryState>()((set) => ({
  ran: false,
  interruptedIds: [],
  lostCount: 0,
  dismissLost: () => set({ lostCount: 0 }),
}));

export const useRecovery = <T,>(selector: (s: RecoveryState) => T) => useStore(recoveryStore, selector);

/** Can this recording be read? Decodes its audio to a scratch file, then removes it. */
async function probe(videoUri: string): Promise<ProbeResult> {
  takeFiles.ensurePcmCacheDir();
  const scratch = takeFiles.pcmCacheUri('recovery-probe');
  try {
    const r = await decodeAudioTrack(videoUri, scratch, { sampleRate: 22050, mono: true });
    return { ok: true, durationMs: r.durationMs };
  } catch {
    return { ok: false };
  } finally {
    takeFiles.deletePcmCache('recovery-probe');
  }
}

let started: Promise<void> | null = null;

/** Run once per app launch. Safe to call again (returns the same promise). */
export function startUp(): Promise<void> {
  started ??= (async () => {
    try {
      const r = await runRecovery({ db, files: takeFiles, probe });
      recoveryStore.setState({ ran: true, interruptedIds: r.interruptedDraftIds, lostCount: r.lostCount });
    } catch {
      recoveryStore.setState({ ran: true });
    }
    analysisQueue.loadPending();
  })();
  return started;
}
