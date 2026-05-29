import { Component, OnInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService, User } from '../../app/services/auth.service';
import { SongService } from '../../app/services/song.service';
import { MessageService } from '../../app/services/message.service';
import { catchError, of, tap, finalize, take } from 'rxjs';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [RouterModule, FormsModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.scss']
})
export class ProfileComponent implements OnInit {
  user: User | null = null;
  loading = true;
  error: string | null = null;
  uploadedSongCount = 0;
  unreadMessageCount = 0;
  totalGamesPlayed = 0;
  isOwnProfile = true;
  viewedUserId: number | null = null;
  private songCountLoaded = false;

  // Edit profile modal state
  showEditModal = false;
  selectedProfilePicture: File | null = null;
  profilePicturePreview: string | null = null;
  updatingProfilePicture = false;
  updateError: string | null = null;
  updateSuccess = false;
  imageError = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private songService: SongService,
    private messageService: MessageService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.error = null;
    this.imageError = false;
    this.songCountLoaded = false;
    this.uploadedSongCount = 0;
    this.totalGamesPlayed = 0;

    this.route.paramMap.pipe(take(1)).subscribe(params => {
      this.loading = true;
      this.error = null;
      this.imageError = false;

      const paramUserId = params.get('userId');
      if (paramUserId) {
        const parsedId = Number(paramUserId);
        if (Number.isFinite(parsedId) && parsedId > 0) {
          this.viewedUserId = parsedId;
          const currentUser = this.authService.currentUser;
          this.isOwnProfile = currentUser?.id === parsedId;

          if (this.isOwnProfile) {
            this.loadOwnProfile();
          } else {
            this.loadOtherProfile(parsedId);
          }
          return;
        }
      }

      this.isOwnProfile = true;
      this.viewedUserId = null;
      this.loadOwnProfile();
    });
  }

  private loadOwnProfile(): void {
    const currentUser = this.authService.currentUser;
    if (currentUser) {
      // Load counts immediately
      this.loadUploadedSongCount(currentUser.id);
      this.loadUnreadCount(currentUser.id);
    }

    this.authService.currentUser$.pipe(
      tap(user => {
        this.ngZone.run(() => {
          this.user = user;
          this.imageError = false;
          this.loading = false;
        });

        if (user) {
          // Update user data in UI
        } else {
          this.ngZone.run(() => {
            this.uploadedSongCount = 0;
            this.unreadMessageCount = 0;
            this.totalGamesPlayed = 0;
          });
        }
      }),
      catchError(_err => {
        this.ngZone.run(() => {
          this.error = 'Failed to load profile';
          this.loading = false;
        });
        return of(null);
      }),
      finalize(() => {
        this.ngZone.run(() => {
          this.loading = false;
        });
      })
    ).subscribe();
  }

  private loadOtherProfile(userId: number): void {
    console.log('Profile: loading other profile', userId);
    const timeoutId = window.setTimeout(() => {
      if (this.loading) {
        console.warn('Profile: forcing loading off after timeout');
        this.loading = false;
        this.cdr.detectChanges();
      }
    }, 5000);

    this.authService.getUserById(userId).subscribe({
      next: response => {
        console.log('Profile: getUserById response', response);
        window.clearTimeout(timeoutId);
        this.loading = false;
        if (response.success && response.user) {
          this.user = response.user;
          this.imageError = false;
          this.error = null;
          this.loadUploadedSongCount(userId);
          this.unreadMessageCount = 0;
          this.totalGamesPlayed = 0;
        } else {
          this.error = response.error || 'User not found';
          this.user = null;
        }
        this.cdr.detectChanges();
      },
      error: err => {
        console.error('Profile: getUserById error', err);
        window.clearTimeout(timeoutId);
        this.loading = false;
        this.error = err.message || 'Failed to load user profile';
        this.user = null;
        this.cdr.detectChanges();
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  goToMenu(): void {
    this.router.navigate(['/menu']);
  }

  goToMessages(): void {
    if (this.user) {
      this.router.navigate(['/messages']);
    }
  }

  get formattedJoinDate(): string {
    if (!this.user?.joinDate) {
      return 'Unknown';
    }

    const joinDate = new Date(this.user.joinDate);
    if (Number.isNaN(joinDate.getTime())) {
      return 'Unknown';
    }

    return joinDate.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  get formattedPlaytime(): string {
    const seconds = this.user?.playtimeSeconds ?? 0;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = seconds / 3600;
    return `${hours.toFixed(1)}h`;
  }

  editProfile(): void {
    this.showEditModal = true;
    this.selectedProfilePicture = null;
    this.profilePicturePreview = null;
    this.updateError = null;
    this.updateSuccess = false;
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.selectedProfilePicture = null;
    this.profilePicturePreview = null;
    this.updateError = null;
    this.updateSuccess = false;
  }

  onProfilePictureSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const file = input.files[0];

      // Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        this.updateError = 'Profile picture must be less than 5MB';
        this.selectedProfilePicture = null;
        this.profilePicturePreview = null;
        return;
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        this.updateError = 'Please select a valid image file (JPEG, PNG, GIF, or WebP)';
        this.selectedProfilePicture = null;
        this.profilePicturePreview = null;
        return;
      }

      this.selectedProfilePicture = file;
      this.updateError = null;

      // Create preview
      const reader = new FileReader();
      reader.onload = () => {
        this.profilePicturePreview = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

    updateProfilePicture(): void {
      if (!this.selectedProfilePicture || !this.user) {
        return;
      }

      this.updatingProfilePicture = true;
      this.updateError = null;
      this.updateSuccess = false;

      // Convert file to base64
      this.fileToBase64(this.selectedProfilePicture)
        .then(base64 => {
          this.authService.updateProfilePicture(this.user!.id, base64).subscribe({
            next: response => {
              console.log('Profile picture update response:', response);
              this.ngZone.run(() => {
                this.updatingProfilePicture = false;
                if (response.success) {
                  this.updateSuccess = true;
                  console.log('Current user after update:', this.authService.currentUser);
                  // Close modal immediately when PFP added successfully
                  this.closeEditModal();
                } else {
                  this.updateError = response.error || 'Failed to update profile picture';
                }
              });
            },
            error: err => {
              console.error('Profile picture update error:', err);
              this.ngZone.run(() => {
                this.updatingProfilePicture = false;
                this.updateError = err.message || 'Failed to update profile picture';
              });
            }
          });
        })
        .catch(() => {
          this.ngZone.run(() => {
            this.updatingProfilePicture = false;
            this.updateError = 'Failed to read image file';
          });
        });
    }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix, keep only base64
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject('Failed to read file');
      reader.readAsDataURL(file);
    });
  }

  onImageError(): void {
    console.error('Failed to load profile picture image');
    this.imageError = true;
  }

  retry(): void {
    this.ngOnInit();
  }

  private loadUploadedSongCount(userId: number): void {

    const viewerId = this.authService.currentUser?.id ?? undefined;
    this.songService.getUploadedSongCount(userId, viewerId).subscribe({
      next: response => {
        this.ngZone.run(() => {
          this.uploadedSongCount = response.success ? response.count : 0;
          this.songCountLoaded = true;
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.uploadedSongCount = 0;
          this.songCountLoaded = true;
        });
      }
    });
  }

  private loadUnreadCount(userId: number): void {
    this.messageService.getUnreadCount(userId).subscribe({
      next: response => {
        this.ngZone.run(() => {
          this.unreadMessageCount = response.success ? response.count : 0;
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.unreadMessageCount = 0;
        });
      }
    });
  }

  /**
   * Refresh the uploaded song count (useful when a new song is uploaded)
   */
  public refreshUploadedSongCount(): void {
    if (this.user) {
      this.songCountLoaded = false;
      this.loadUploadedSongCount(this.user.id);
    }
  }
}
