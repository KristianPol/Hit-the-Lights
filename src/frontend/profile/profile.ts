import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService, User } from '../../app/services/auth.service';
import { Observable, catchError, of, tap, finalize } from 'rxjs';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.scss']
})
export class ProfileComponent implements OnInit {
  user: User | null = null;
  loading = true;
  error: string | null = null;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.error = null;

    this.authService.currentUser$.pipe(
      tap(user => {
        this.user = user;
        this.loading = false;
      }),
      catchError(err => {
        this.error = 'Failed to load profile';
        this.loading = false;
        return of(null);
      }),
      finalize(() => {
        // Ensure loading is always turned off
        this.loading = false;
      })
    ).subscribe();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  editProfile(): void {
    console.log('Edit profile clicked');
  }

  retry(): void {
    this.ngOnInit();
  }
}
