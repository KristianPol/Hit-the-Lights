import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { SongService } from '../../app/services/song.service';
import { AuthService } from '../../app/services/auth.service';

interface SpLeaderboardEntry {
  position: number;
  userId: number;
  username: string;
  totalSp: number;
}

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './leaderboard.html',
  styleUrl: './leaderboard.scss'
})
export class LeaderboardPage implements OnInit {
  private readonly songService = inject(SongService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly entries = signal<SpLeaderboardEntry[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly currentUserId = signal<number | undefined>(this.authService.currentUser?.id);

  ngOnInit(): void {
    this.loadLeaderboard();
  }

  private loadLeaderboard(): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.songService.getSpLeaderboard(50).subscribe({
      next: response => {
        if (response.success) {
          this.entries.set(response.entries);
        } else {
          this.error.set(response.error || 'Failed to load leaderboard');
        }
        this.isLoading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load leaderboard');
        this.isLoading.set(false);
      }
    });
  }

  formatSp(value: number): string {
    if (!Number.isFinite(value)) return '0';
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  }

  isCurrentUser(entry: SpLeaderboardEntry): boolean {
    return entry.userId === this.currentUserId();
  }

  goToProfile(userId: number): void {
    void this.router.navigate(['/profile', userId]);
  }

  goBack(): void {
    void this.router.navigate(['/menu']);
  }
}
