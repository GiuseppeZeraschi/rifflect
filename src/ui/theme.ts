/**
 * Design tokens (tasks.md T035). Light and dark palettes chosen for WCAG AA text contrast on their
 * backgrounds. Screens should use these instead of raw colours.
 */
import { useColorScheme } from '@/ui/components/useColorScheme';

const light = {
  background: '#FFFFFF',
  surface: '#F4F5F7',
  text: '#16181D',
  textMuted: '#4B5260', // 7.6:1 on white
  primary: '#1F5FD6', // 5.3:1 on white
  onPrimary: '#FFFFFF',
  border: '#D6D9DF',
  success: '#1E7A3C',
  warning: '#8A5A00',
  danger: '#B3261E',
  timing: '#1F5FD6',
  technique: '#7A3FC2',
};

const dark: typeof light = {
  background: '#0F1115',
  surface: '#1A1D23',
  text: '#F2F3F5',
  textMuted: '#AEB4BF', // 8.5:1 on background
  primary: '#7FA8F5',
  onPrimary: '#0F1115',
  border: '#2E333C',
  success: '#6CCB8B',
  warning: '#E8B860',
  danger: '#F2958E',
  timing: '#7FA8F5',
  technique: '#C29BF0',
};

export const palettes = { light, dark };
export type Palette = typeof light;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16 } as const;
export const fontSize = { caption: 13, body: 16, title: 20, heading: 26 } as const;

export function usePalette(): Palette {
  return palettes[useColorScheme()];
}
