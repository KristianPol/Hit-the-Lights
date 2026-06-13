import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GameSettingsService, PARTICLE_INTENSITY_OPTIONS, type ParticleIntensity, formatBindingLabel, formatBindingList } from '../../app/services/game-settings.service';
import { ThemeService, THEMES, type Theme } from '../../app/services/theme.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrls: ['./settings.scss']
})
export class SettingsPage {
  private readonly gameSettingsService = inject(GameSettingsService);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);

  readonly laneLabels = computed(() => this.gameSettingsService.laneBindings().map(binding => formatBindingLabel(binding)));
  readonly noteSpeed = computed(() => this.gameSettingsService.noteSpeed());
  readonly bindingSummary = computed(() => formatBindingList(this.gameSettingsService.laneBindings()));

  readonly themes = signal<Theme[]>(THEMES);
  readonly selectedThemeId = computed(() => this.themeService.currentThemeId());

  readonly particleIntensityOptions = PARTICLE_INTENSITY_OPTIONS;
  readonly masterVolume = computed(() => this.gameSettingsService.masterVolume());
  readonly volumePercent = computed(() => Math.round(this.gameSettingsService.masterVolume() * 100));
  readonly showKeyLabels = computed(() => this.gameSettingsService.showKeyLabels());
  readonly fullscreen = computed(() => this.gameSettingsService.fullscreen());
  readonly particleIntensity = computed(() => this.gameSettingsService.particleIntensity());
  readonly fpsCounter = computed(() => this.gameSettingsService.fpsCounter());
  readonly hitSoundUrl = computed(() => this.gameSettingsService.hitSoundUrl());
  readonly missSoundUrl = computed(() => this.gameSettingsService.missSoundUrl());
  readonly hitSoundName = computed(() => this.hitSoundUrl() ? 'Custom hit sound' : null);
  readonly missSoundName = computed(() => this.missSoundUrl() ? 'Custom miss sound' : null);

  private noteSpeedDraftSignal = signal<number>(this.noteSpeed());
  get noteSpeedDraft(): number { return this.noteSpeedDraftSignal(); }
  set noteSpeedDraft(v: number) { this.noteSpeedDraftSignal.set(v); }

  private masterVolumeDraftSignal = signal<number>(this.masterVolume());
  get masterVolumeDraft(): number { return this.masterVolumeDraftSignal(); }
  set masterVolumeDraft(v: number) { this.masterVolumeDraftSignal.set(v); }

  private capturingLaneSignal = signal<number | null>(null);
  get capturingLane(): number | null { return this.capturingLaneSignal(); }
  set capturingLane(v: number | null) { this.capturingLaneSignal.set(v); }

  statusMessage = signal('Choose a lane, then press the new key.');
  errorMessage = signal<string | null>(null);


  goBack(): void {
    void this.router.navigate(['/menu']);
  }

  startCapture(lane: number): void {
    this.capturingLane = lane;
    this.errorMessage.set(null);
    this.statusMessage.set(`Press a key for lane ${lane + 1}.`);
  }

  cancelCapture(): void {
    this.capturingLane = null;
    this.statusMessage.set('Choose a lane, then press the new key.');
  }

  onSpeedChange(value: string | number): void {
    const numericValue = typeof value === 'number' ? value : Number(value);
    this.gameSettingsService.updateNoteSpeed(numericValue);
    this.noteSpeedDraft = this.noteSpeed();
    this.errorMessage.set(null);
    this.statusMessage.set(`Note speed set to ${this.noteSpeed().toFixed(2)}x.`);
  }

  selectTheme(themeId: string): void {
    this.themeService.applyTheme(themeId);
    this.gameSettingsService.updateTheme(themeId);
    this.statusMessage.set(`Theme changed to ${this.themes().find(t => t.id === themeId)?.label ?? themeId}.`);
  }

  onMasterVolumeChange(value: string | number): void {
    const numericValue = typeof value === 'number' ? value : Number(value);
    this.gameSettingsService.updateMasterVolume(numericValue);
    this.masterVolumeDraft = this.masterVolume();
    this.errorMessage.set(null);
    this.statusMessage.set(`Master volume set to ${Math.round(this.masterVolume() * 100)}%.`);
  }

  toggleShowKeyLabels(): void {
    this.gameSettingsService.updateShowKeyLabels(!this.showKeyLabels());
    this.errorMessage.set(null);
    this.statusMessage.set(this.showKeyLabels() ? 'Key labels shown.' : 'Key labels hidden.');
  }

  toggleFullscreen(): void {
    const next = !this.fullscreen();
    this.gameSettingsService.updateFullscreen(next);
    this.applyFullscreen(next);
    this.errorMessage.set(null);
    this.statusMessage.set(next ? 'Fullscreen enabled for gameplay.' : 'Fullscreen disabled.');
  }

  private applyFullscreen(enabled: boolean): void {
    if (typeof document === 'undefined') return;
    const isFullscreen = !!document.fullscreenElement;
    if (enabled && !isFullscreen) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (!enabled && isFullscreen) {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  onParticleIntensityChange(value: ParticleIntensity): void {
    this.gameSettingsService.updateParticleIntensity(value);
    this.errorMessage.set(null);
    const label = PARTICLE_INTENSITY_OPTIONS.find(o => o.value === value)?.label ?? value;
    this.statusMessage.set(`Particle effects set to ${label}.`);
  }

  toggleFpsCounter(): void {
    this.gameSettingsService.updateFpsCounter(!this.fpsCounter());
    this.errorMessage.set(null);
    this.statusMessage.set(this.fpsCounter() ? 'FPS counter enabled.' : 'FPS counter disabled.');
  }

  onHitSoundChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.readAudioFile(file, url => {
      this.gameSettingsService.updateHitSound(url);
      this.statusMessage.set('Custom hit sound saved.');
      this.errorMessage.set(null);
    });
  }

  onMissSoundChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.readAudioFile(file, url => {
      this.gameSettingsService.updateMissSound(url);
      this.statusMessage.set('Custom miss sound saved.');
      this.errorMessage.set(null);
    });
  }

  private readAudioFile(file: File, callback: (url: string) => void): void {
    const maxSizeBytes = 150 * 1024; // 150 KB
    const maxDurationSeconds = 0.5;

    if (file.size > maxSizeBytes) {
      this.errorMessage.set(`Audio file is too large. Maximum size is ${maxSizeBytes / 1024} KB.`);
      this.statusMessage.set('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      const audio = new Audio(url);
      audio.addEventListener('loadedmetadata', () => {
        if (audio.duration > maxDurationSeconds) {
          this.errorMessage.set(`Audio is too long. Maximum duration is ${maxDurationSeconds} seconds.`);
          this.statusMessage.set('');
          return;
        }
        callback(url);
      });
      audio.addEventListener('error', () => {
        this.errorMessage.set('Failed to load audio metadata. Please try another file.');
        this.statusMessage.set('');
      });
    };
    reader.onerror = () => {
      this.errorMessage.set('Failed to read the audio file.');
    };
    reader.readAsDataURL(file);
  }

  playHitSoundPreview(): void {
    this.playSoundPreview(this.hitSoundUrl());
  }

  playMissSoundPreview(): void {
    this.playSoundPreview(this.missSoundUrl());
  }

  private playSoundPreview(url: string | null): void {
    if (!url) return;
    const audio = new Audio(url);
    audio.volume = this.masterVolume();
    audio.play().catch(() => {});
  }

  clearHitSound(): void {
    this.gameSettingsService.updateHitSound(null);
    this.statusMessage.set('Custom hit sound removed.');
    this.errorMessage.set(null);
  }

  clearMissSound(): void {
    this.gameSettingsService.updateMissSound(null);
    this.statusMessage.set('Custom miss sound removed.');
    this.errorMessage.set(null);
  }

  resetDefaults(): void {
    this.gameSettingsService.resetDefaults();
    this.themeService.applyTheme('black-yellow');
    this.noteSpeedDraft = this.noteSpeed();
    this.masterVolumeDraft = this.masterVolume();
    this.applyFullscreen(false);
    this.capturingLane = null;
    this.errorMessage.set(null);
    this.statusMessage.set('All settings reset to default values.');
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeyDown(event: KeyboardEvent): void {
    if (this.capturingLane === null) {
      return;
    }

    event.preventDefault();

    if (event.key === 'Escape') {
      this.cancelCapture();
      return;
    }

    const result = this.gameSettingsService.updateLaneBinding(this.capturingLane, event.key);
    if (!result.success) {
      this.errorMessage.set(result.error ?? 'Could not update the key binding.');
      return;
    }

    const laneLabel = this.laneLabels()[this.capturingLane] ?? `Lane ${this.capturingLane + 1}`;
    this.capturingLane = null;
    this.errorMessage.set(null);
    this.statusMessage.set(`${laneLabel} updated to ${formatBindingLabel(event.key)}.`);
  }
}

