import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../app/services/auth.service';

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
  analytics = signal<any>(null);

  constructor() {
    const user = this.auth.currentUser;
    if (!user || !user.id) {
      // redirect to menu/login when not logged in
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
          this.analytics.set(resp.analytics);
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

  goBack() {
    void this.router.navigate(['/menu']);
  }
}

