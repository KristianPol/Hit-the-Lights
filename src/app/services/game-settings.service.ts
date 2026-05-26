import { Injectable, computed, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';

export interface GameSettings {
  laneBindings: [string, string, string, string];
  noteSpeed: number;
}

export interface UpdateBindingResult {
  success: boolean;
  error?: string;
}

const STORAGE_KEY = 'hit-the-lights.game-settings';
const DEFAULT_SETTINGS: GameSettings = {
  laneBindings: ['d', 'f', 'j', 'k'],
  noteSpeed: 1
};
const LANE_COUNT = 4;
const MIN_NOTE_SPEED = 0.5;
const MAX_NOTE_SPEED = 2.5;
const FORBIDDEN_KEYS = new Set(['shift', 'control', 'alt', 'meta', 'capslock', 'tab', 'escape']);

export function normalizeBindingKey(key: string): string {
  const raw = key ?? '';

  if (raw === ' ') {
    return 'space';
  }

  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  return normalized === 'spacebar' ? 'space' : normalized;
}

export function formatBindingLabel(key: string): string {
  const normalized = normalizeBindingKey(key);

  if (!normalized) {
    return 'Unassigned';
  }

  if (normalized === 'space') {
    return 'Space';
  }

  if (normalized === 'arrowleft') {
    return 'Arrow Left';
  }

  if (normalized === 'arrowright') {
    return 'Arrow Right';
  }

  if (normalized === 'arrowup') {
    return 'Arrow Up';
  }

  if (normalized === 'arrowdown') {
    return 'Arrow Down';
  }

  if (normalized.length === 1) {
    return normalized.toUpperCase();
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function formatBindingList(bindings: string[]): string {
  const labels = bindings.map(binding => formatBindingLabel(binding));

  if (labels.length <= 1) {
    return labels[0] ?? '';
  }

  if (labels.length === 2) {
    return `${labels[0]} or ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(', ')}, or ${labels.at(-1)}`;
}

@Injectable({
  providedIn: 'root'
})
export class GameSettingsService {
  private readonly settingsSignal = signal<GameSettings>(this.loadSettings());
  readonly settings = computed(() => this.settingsSignal());
  readonly laneBindings = computed(() => this.settingsSignal().laneBindings);
  readonly noteSpeed = computed(() => this.settingsSignal().noteSpeed);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  constructor() {
    // When user logs in, attempt to load their server-stored settings and merge.
    try {
      // currentUser$ is an observable created from a signal
      this.auth.currentUser$.subscribe(async (user) => {
        if (!user) return;
        try {
          const resp = await firstValueFrom(this.http.get<{ success: boolean; settings?: any }>(`/api/auth/user/${user.id}/settings`));
          if (resp && resp.success && resp.settings) {
            // merge server settings into local settings and persist
            const server = resp.settings as Partial<GameSettings>;
            const merged: GameSettings = this.normalizeSettings({ ...this.settings(), ...server });
            this.saveSettings(merged);
          }
        } catch (e) {
          // ignore fetch errors; fall back to local settings
          console.warn('Failed to load server settings:', e);
        }
      });
    } catch (e) {
      // ignore subscription issues in test environments
    }
  }
  updateLaneBinding(lane: number, key: string): UpdateBindingResult {
    if (lane < 0 || lane >= LANE_COUNT) {
      return { success: false, error: 'Invalid lane.' };
    }

    const normalized = normalizeBindingKey(key);
    if (!normalized) {
      return { success: false, error: 'Please press a valid key.' };
    }

    if (FORBIDDEN_KEYS.has(normalized)) {
      return { success: false, error: 'That key cannot be used for gameplay.' };
    }

    const current = this.settingsSignal();
    const duplicateLane = current.laneBindings.findIndex((binding, index) => index !== lane && normalizeBindingKey(binding) === normalized);
    if (duplicateLane !== -1) {
      return { success: false, error: 'Each lane needs a different key.' };
    }

    const laneBindings = [...current.laneBindings] as [string, string, string, string];
    laneBindings[lane] = normalized;
    this.saveSettings({ ...current, laneBindings });

    return { success: true };
  }

  updateNoteSpeed(noteSpeed: number): void {
    const current = this.settingsSignal();
    const nextSpeed = this.clampNoteSpeed(noteSpeed);
    this.saveSettings({ ...current, noteSpeed: nextSpeed });
  }

  resetDefaults(): void {
    this.saveSettings(this.cloneSettings(DEFAULT_SETTINGS));
  }

  private loadSettings(): GameSettings {
    if (typeof window === 'undefined') {
      return this.cloneSettings(DEFAULT_SETTINGS);
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return this.cloneSettings(DEFAULT_SETTINGS);
      }

      const parsed = JSON.parse(stored) as Partial<GameSettings>;
      return this.normalizeSettings(parsed);
    } catch {
      return this.cloneSettings(DEFAULT_SETTINGS);
    }
  }

  private saveSettings(settings: GameSettings): void {
    const normalized = this.normalizeSettings(settings);
    this.settingsSignal.set(normalized);

    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore storage failures so gameplay still works.
    }

    // Also persist to server if user is logged in
    try {
      const user = this.auth.currentUser;
      if (user && user.id) {
        // fire-and-forget; don't block UI
        this.http.post(`/api/auth/user/${user.id}/settings`, { settings: normalized }).subscribe({
          next: () => {},
          error: err => console.warn('Failed to save settings to server:', err)
        });
      }
    } catch (e) {
      // ignore
    }
  }

  private normalizeSettings(settings: Partial<GameSettings> | null | undefined): GameSettings {
    const fallback = this.cloneSettings(DEFAULT_SETTINGS);
    const laneBindings = Array.isArray(settings?.laneBindings) ? settings?.laneBindings : fallback.laneBindings;
    const safeBindings = fallback.laneBindings.map((defaultBinding, index) => {
      const candidate = laneBindings?.[index];
      return normalizeBindingKey(typeof candidate === 'string' ? candidate : defaultBinding) || defaultBinding;
    }) as [string, string, string, string];

    const noteSpeed = this.clampNoteSpeed(settings?.noteSpeed ?? fallback.noteSpeed);
    return {
      laneBindings: safeBindings,
      noteSpeed
    };
  }

  private clampNoteSpeed(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return DEFAULT_SETTINGS.noteSpeed;
    }

    return Math.min(MAX_NOTE_SPEED, Math.max(MIN_NOTE_SPEED, Number(numeric.toFixed(2))));
  }

  private cloneSettings(settings: GameSettings): GameSettings {
    return {
      laneBindings: [...settings.laneBindings] as [string, string, string, string],
      noteSpeed: settings.noteSpeed
    };
  }
}

