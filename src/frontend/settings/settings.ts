import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GameSettingsService, formatBindingLabel, formatBindingList } from '../../app/services/game-settings.service';
import { ThemeService, MAIN_COLORS, ACCENT_COLORS } from '../../app/services/theme.service';

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

  readonly mainColors = () => MAIN_COLORS;
  readonly accentColors = () => ACCENT_COLORS;
  readonly selectedMainColor = computed(() => this.themeService.mainColor());
  readonly selectedAccentColor = computed(() => this.themeService.accentColor());

  noteSpeedDraft = this.noteSpeed();
  capturingLane: number | null = null;
  statusMessage = signal('Choose a lane, then press the new key.');
  errorMessage = signal<string | null>(null);

  getMainColorHex(): string {
    return MAIN_COLORS.find(c => c.id === this.selectedMainColor())?.hex ?? '#050505';
  }

  getAccentColorHex(): string {
    return ACCENT_COLORS.find(c => c.id === this.selectedAccentColor())?.hex ?? '#ffd700';
  }

  selectMainColor(colorId: string): void {
    this.themeService.updateMainColor(colorId);
    this.statusMessage.set('Main color updated.');
    this.errorMessage.set(null);
  }

  selectAccentColor(colorId: string): void {
    this.themeService.updateAccentColor(colorId);
    this.statusMessage.set('Accent color updated.');
    this.errorMessage.set(null);
  }

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

  resetDefaults(): void {
    this.gameSettingsService.resetDefaults();
    this.themeService.resetToDefaults();
    this.noteSpeedDraft = this.noteSpeed();
    this.capturingLane = null;
    this.errorMessage.set(null);
    this.statusMessage.set('Controls, speed, and theme reset to default values.');
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

