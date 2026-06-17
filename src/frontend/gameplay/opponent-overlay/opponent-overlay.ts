import { Component, input, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatchState } from '../../../app/services/multiplayer.service';

@Component({
  selector: 'app-opponent-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './opponent-overlay.html',
  styleUrls: ['./opponent-overlay.scss']
})
export class OpponentOverlayComponent {
  readonly state = input<MatchState | null>(null);
  readonly connected = input<boolean>(false);
  readonly countdown = input<number | null>(null);

  readonly lanes = [0, 1, 2, 3];
  readonly laneFlash = new Map<number, number>();

  constructor() {
    effect(() => {
      const s = this.state();
      if (s?.laneActivity) {
        const { lane } = s.laneActivity;
        this.laneFlash.set(lane, Date.now() + 150);
      }
    });
  }

  get accuracyText(): string {
    return `${(this.state()?.accuracy ?? 0).toFixed(2)}%`;
  }

  isFlashed(lane: number): boolean {
    const expires = this.laneFlash.get(lane);
    if (!expires) return false;
    if (Date.now() > expires) {
      this.laneFlash.delete(lane);
      return false;
    }
    return true;
  }
}
