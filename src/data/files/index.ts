/** App wiring: the take file store on top of expo-file-system. */
import { expoFileStore } from './expoFileStore';
import { createTakeFiles } from './takeFiles';

export const takeFiles = createTakeFiles(expoFileStore);
export type { TakeFiles } from './takeFiles';
