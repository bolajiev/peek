import { ThemeMode } from '../types';

export interface Theme {
  background: string;
  card: string;
  cardAlt: string;
  accent: string;
  accentFg: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
}

export const darkTheme: Theme = {
  background: '#0A0A0A',
  card: '#141414',
  cardAlt: '#1C1C1C',
  accent: '#FFC200',
  accentFg: '#000000',
  text: '#FFFFFF',
  textSecondary: '#666666',
  border: '#222222',
  error: '#FF4444',
  success: '#4CAF50',
};

export const lightTheme: Theme = {
  background: '#F5F4F0',
  card: '#FFFFFF',
  cardAlt: '#EFEFEB',
  accent: '#FFC200',
  accentFg: '#000000',
  text: '#0A0A0A',
  textSecondary: '#888888',
  border: '#E5E5E5',
  error: '#D32F2F',
  success: '#388E3C',
};

export function getTheme(mode: ThemeMode): Theme {
  return mode === 'dark' ? darkTheme : lightTheme;
}
