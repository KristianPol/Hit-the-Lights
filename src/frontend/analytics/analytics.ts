import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../app/services/auth.service';

export interface Analytics {
  runs: number;
  averageScore: number;
  averageAccuracy: number;
  perfectTotal: number;
  goodTotal: number;
  okayTotal: number;
  missTotal: number;
  playtimeSeconds: number;
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analytics.html',
  styleUrls: ['./analytics.scss']
})
export class AnalyticsPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  loading = signal(true);
  error = signal<string | null>(null);
  analytics = signal<Analytics | null>(null);

  totalHits = computed(() => {
    const a = this.analytics();
    if (!a) return 0;
    return a.perfectTotal + a.goodTotal + a.okayTotal + a.missTotal;
  });

  perfectPct = computed(() => this.hitPercentage('perfectTotal'));
  goodPct = computed(() => this.hitPercentage('goodTotal'));
  okayPct = computed(() => this.hitPercentage('okayTotal'));
  missPct = computed(() => this.hitPercentage('missTotal'));

  formattedPlaytime = computed(() => {
    const a = this.analytics();
    if (!a) return '0m';
    const seconds = a.playtimeSeconds || 0;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = seconds / 3600;
    return `${hours.toFixed(1)}h`;
  });

  formattedAverageScore = computed(() => {
    const a = this.analytics();
    if (!a) return '0';
    return Math.round(a.averageScore || 0).toLocaleString();
  });

  formattedAccuracy = computed(() => {
    const a = this.analytics();
    if (!a) return '0.0';
    return (a.averageAccuracy || 0).toFixed(1);
  });

  constructor() {
    const user = this.auth.currentUser;
    if (!user || !user.id) {
      void this.router.navigate(['/menu']);
      return;
    }

    this.fetchAnalytics(user.id);
  }

  fetchAnalytics(userId: number) {
    this.loading.set(true);
    this.error.set(null);
    this.auth.getAnalytics(userId).subscribe({
      next: resp => {
        if (resp.success && resp.analytics) {
          this.analytics.set(resp.analytics as Analytics);
        } else {
          this.error.set(resp.error ?? 'Failed to load analytics');
        }
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load analytics');
        this.loading.set(false);
      }
    });
  }

  retry() {
    const user = this.auth.currentUser;
    if (user && user.id) {
      this.fetchAnalytics(user.id);
    }
  }

  goBack() {
    void this.router.navigate(['/menu']);
  }

  private hitPercentage(key: keyof Analytics): number {
    const a = this.analytics();
    const total = this.totalHits();
    if (!a || total === 0) return 0;
    const value = a[key] as number;
    return Math.round((value / total) * 100);
  }
}
