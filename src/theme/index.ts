import { ThemeMode } from '../types';

export interface Theme {
  background: string;
  card: string;
  accent: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
}

export const darkTheme: Theme = {
  background: '#0A0A0A',
  card: '#141414',
  accent: '#00FF87',
  text: '#FFFFFF',
  textSecondary: '#888888',
  border: '#1E1E1E',
  error: '#FF4444',
  success: '#00FF87',
};

export const lightTheme: Theme = {
  background: '#F5F5F5',
  card: '#FFFFFF',
  accent: '#00CC6A',
  text: '#111111',
  textSecondary: '#666666',
  border: '#E0E0E0',
  error: '#D32F2F',
  success: '#00CC6A',
};

export function getTheme(mode: ThemeMode): Theme {
  return mode === 'dark' ? darkTheme : lightTheme;
}
