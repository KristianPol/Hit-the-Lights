import { Injectable, signal } from '@angular/core';

export interface Theme {
  id: string;
  label: string;
  main: string;
  mainColor: string;
  accent: string;
  accentColor: string;
  accentBright: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  isDark: boolean;
}

export const THEMES: Theme[] = [
  {
    id: 'black-yellow',
    label: 'Neon Gold',
    main: '#050505',
    mainColor: '#050505',
    accent: '#ffd700',
    accentColor: '#ffd700',
    accentBright: '#ffed4e',
    textPrimary: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.72)',
    textMuted: 'rgba(255, 255, 255, 0.55)',
    isDark: true,
  },
  {
    id: 'dark-purple',
    label: 'Neon Purple',
    main: '#0a0510',
    mainColor: '#0a0510',
    accent: '#c084fc',
    accentColor: '#c084fc',
    accentBright: '#d8b4fe',
    textPrimary: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.72)',
    textMuted: 'rgba(255, 255, 255, 0.55)',
    isDark: true,
  },
  {
    id: 'midnight-blue',
    label: 'Midnight Blue',
    main: '#050a14',
    mainColor: '#050a14',
    accent: '#60a5fa',
    accentColor: '#60a5fa',
    accentBright: '#93c5fd',
    textPrimary: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.72)',
    textMuted: 'rgba(255, 255, 255, 0.55)',
    isDark: true,
  },
  {
    id: 'red-black',
    label: 'Crimson Red',
    main: '#140505',
    mainColor: '#140505',
    accent: '#f87171',
    accentColor: '#f87171',
    accentBright: '#fca5a5',
    textPrimary: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.72)',
    textMuted: 'rgba(255, 255, 255, 0.55)',
    isDark: true,
  },
  {
    id: 'green-black',
    label: 'Toxic Green',
    main: '#051405',
    mainColor: '#051405',
    accent: '#4ade80',
    accentColor: '#4ade80',
    accentBright: '#86efac',
    textPrimary: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.72)',
    textMuted: 'rgba(255, 255, 255, 0.55)',
    isDark: true,
  },
  {
    id: 'white-black',
    label: 'Light Mode',
    main: '#f5f5f5',
    mainColor: '#f5f5f5',
    accent: '#1a1a1a',
    accentColor: '#1a1a1a',
    accentBright: '#333333',
    textPrimary: '#111111',
    textSecondary: 'rgba(0, 0, 0, 0.65)',
    textMuted: 'rgba(0, 0, 0, 0.45)',
    isDark: false,
  },
];

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r}, ${g}, ${b}`;
}

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly themeIdSignal = signal<string>('black-yellow');
  readonly currentThemeId = this.themeIdSignal.asReadonly();

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('hit-the-lights.theme');
      if (stored) {
        this.applyTheme(stored);
      } else {
        this.applyTheme('black-yellow');
      }
    }
  }

  applyTheme(themeId: string): void {
    const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
    this.themeIdSignal.set(theme.id);

    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    const mainRgb = hexToRgb(theme.main);
    const accentRgb = hexToRgb(theme.accent);
    const accentBrightRgb = hexToRgb(theme.accentBright);
    const textPrimaryRgb = hexToRgb(theme.textPrimary);

    root.style.setProperty('--color-main', theme.main);
    root.style.setProperty('--color-accent', theme.accent);
    root.style.setProperty('--is-dark-main', theme.isDark ? '1' : '0');

    root.style.setProperty('--color-main-secondary', theme.isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.3)');
    root.style.setProperty('--color-main-tertiary', theme.isDark ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)');

    root.style.setProperty('--color-text-primary', theme.textPrimary);
    root.style.setProperty('--color-text-secondary', theme.textSecondary);
    root.style.setProperty('--color-text-muted', theme.textMuted);

    root.style.setProperty('--color-main-rgb', mainRgb);
    root.style.setProperty('--color-accent-rgb', accentRgb);
    root.style.setProperty('--color-accent-bright-rgb', accentBrightRgb);
    root.style.setProperty('--color-text-primary-rgb', textPrimaryRgb);

    root.style.setProperty('--color-accent-light', `rgba(${accentRgb}, 0.2)`);
    root.style.setProperty('--color-accent-glow', `rgba(${accentRgb}, 0.3)`);
    root.style.setProperty('--color-accent-bright', `rgba(${accentRgb}, 0.8)`);

    root.style.setProperty('--color-error', '#ff4444');
    root.style.setProperty('--color-success', '#44ff44');
    root.style.setProperty('--color-warning', '#ffaa00');

    root.style.setProperty('--color-border', `rgba(${accentRgb}, 0.2)`);
    root.style.setProperty('--color-shadow', theme.isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.2)');

    root.style.setProperty('--gradient-primary', `linear-gradient(135deg, ${theme.main} 0%, ${theme.isDark ? '#0f0f0f' : '#ffffff'} 100%)`);

    try {
      window.localStorage.setItem('hit-the-lights.theme', theme.id);
    } catch {
      // ignore
    }
  }
}
