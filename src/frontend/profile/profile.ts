import { Component, OnInit, NgZone, ChangeDetectorRef, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService, User } from '../../app/services/auth.service';
import { SongService, Song, SongDifficulty, difficultyNumberToName } from '../../app/services/song.service';
import { MessageService } from '../../app/services/message.service';
import { AchievementService } from '../../app/services/achievement.service';
import { Achievement } from '../../app/services/achievement.model';
import { catchError, of, tap, finalize, take, map } from 'rxjs';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.scss']
})
export class ProfileComponent implements OnInit {
  // reactive state (signals)
  private userSignal = signal<User | null>(null);
  get user(): User | null { return this.userSignal(); }
  set user(v: User | null) { this.userSignal.set(v); }

  private loadingSignal = signal<boolean>(true);
  get loading(): boolean { return this.loadingSignal(); }
  set loading(v: boolean) { this.loadingSignal.set(v); }

  private errorSignal = signal<string | null>(null);
  get error(): string | null { return this.errorSignal(); }
  set error(v: string | null) { this.errorSignal.set(v); }

  private uploadedSongCountSignal = signal<number>(0);
  get uploadedSongCount(): number { return this.uploadedSongCountSignal(); }
  set uploadedSongCount(v: number) { this.uploadedSongCountSignal.set(v); }

  private unreadMessageCountSignal = signal<number>(0);
  get unreadMessageCount(): number { return this.unreadMessageCountSignal(); }
  set unreadMessageCount(v: number) { this.unreadMessageCountSignal.set(v); }

  private totalGamesPlayedSignal = signal<number>(0);
  get totalGamesPlayed(): number { return this.totalGamesPlayedSignal(); }
  set totalGamesPlayed(v: number) { this.totalGamesPlayedSignal.set(v); }

  private isOwnProfileSignal = signal<boolean>(true);
  get isOwnProfile(): boolean { return this.isOwnProfileSignal(); }
  set isOwnProfile(v: boolean) { this.isOwnProfileSignal.set(v); }

  private viewedUserIdSignal = signal<number | null>(null);
  get viewedUserId(): number | null { return this.viewedUserIdSignal(); }
  set viewedUserId(v: number | null) { this.viewedUserIdSignal.set(v); }

  private songCountLoadedSignal = signal<boolean>(false);
  get songCountLoaded(): boolean { return this.songCountLoadedSignal(); }
  set songCountLoaded(v: boolean) { this.songCountLoadedSignal.set(v); }

  // Edit profile modal state (signals)
  private showEditModalSignal = signal<boolean>(false);
  get showEditModal(): boolean { return this.showEditModalSignal(); }
  set showEditModal(v: boolean) { this.showEditModalSignal.set(v); }

  private selectedProfilePictureSignal = signal<File | null>(null);
  get selectedProfilePicture(): File | null { return this.selectedProfilePictureSignal(); }
  set selectedProfilePicture(v: File | null) { this.selectedProfilePictureSignal.set(v); }

  private profilePicturePreviewSignal = signal<string | null>(null);
  get profilePicturePreview(): string | null { return this.profilePicturePreviewSignal(); }
  set profilePicturePreview(v: string | null) { this.profilePicturePreviewSignal.set(v); }

  private updatingProfilePictureSignal = signal<boolean>(false);
  get updatingProfilePicture(): boolean { return this.updatingProfilePictureSignal(); }
  set updatingProfilePicture(v: boolean) { this.updatingProfilePictureSignal.set(v); }

  private updateErrorSignal = signal<string | null>(null);
  get updateError(): string | null { return this.updateErrorSignal(); }
  set updateError(v: string | null) { this.updateErrorSignal.set(v); }

  private updateSuccessSignal = signal<boolean>(false);
  get updateSuccess(): boolean { return this.updateSuccessSignal(); }
  set updateSuccess(v: boolean) { this.updateSuccessSignal.set(v); }

  private imageErrorSignal = signal<boolean>(false);
  get imageError(): boolean { return this.imageErrorSignal(); }
  set imageError(v: boolean) { this.imageErrorSignal.set(v); }

  private pinnedAchievementsSignal = signal<Achievement[]>([]);
  get pinnedAchievements(): Achievement[] { return this.pinnedAchievementsSignal(); }
  set pinnedAchievements(v: Achievement[]) { this.pinnedAchievementsSignal.set(v); }

  private activeTabSignal = signal<'about' | 'creations'>('about');
  get activeTab(): 'about' | 'creations' { return this.activeTabSignal(); }
  set activeTab(v: 'about' | 'creations') { this.activeTabSignal.set(v); }

  private uploadedSongsSignal = signal<Song[]>([]);
  get uploadedSongs(): Song[] { return this.uploadedSongsSignal(); }
  set uploadedSongs(v: Song[]) { this.uploadedSongsSignal.set(v); }

  private creationsLoadingSignal = signal<boolean>(false);
  get creationsLoading(): boolean { return this.creationsLoadingSignal(); }
  set creationsLoading(v: boolean) { this.creationsLoadingSignal.set(v); }

  private creationsErrorSignal = signal<string | null>(null);
  get creationsError(): string | null { return this.creationsErrorSignal(); }
  set creationsError(v: string | null) { this.creationsErrorSignal.set(v); }

  chartsMade = computed(() => {
    const songs = this.uploadedSongsSignal();
    const charts: { songId: number; songName: string; difficulty: number; noteCount: number }[] = [];
    for (const song of songs) {
      for (const diff of song.difficulties ?? []) {
        charts.push({
          songId: song.id,
          songName: song.name,
          difficulty: diff.difficulty,
          noteCount: diff.noteCount
        });
      }
    }
    return charts;
  });

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private songService: SongService,
    private messageService: MessageService,
    private achievementService: AchievementService,
    private http: HttpClient,
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
      this.loadPinnedAchievements(currentUser.id);
      this.loadCreations(currentUser.id);
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
            this.pinnedAchievements = [];
            this.uploadedSongs = [];
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
          this.loadPinnedAchievements(userId);
          this.loadCreations(userId);
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

  private loadCreations(userId: number): void {
    this.creationsLoading = true;
    this.creationsError = null;
    const viewerId = this.authService.currentUser?.id ?? undefined;
    this.songService.getAllSongs(viewerId, { ownerId: userId }).subscribe({
      next: response => {
        this.ngZone.run(() => {
          this.creationsLoading = false;
          this.uploadedSongs = response.success ? response.songs : [];
        });
      },
      error: err => {
        this.ngZone.run(() => {
          this.creationsLoading = false;
          this.creationsError = err.message || 'Failed to load creations';
          this.uploadedSongs = [];
        });
      }
    });
  }

  setActiveTab(tab: 'about' | 'creations'): void {
    this.activeTab = tab;
  }

  private loadPinnedAchievements(userId: number): void {
    const currentUser = this.authService.currentUser;
    if (currentUser && currentUser.id === userId) {
      // Own profile: use the achievement service directly
      this.achievementService.refreshForCurrentUser();
      this.ngZone.run(() => {
        this.pinnedAchievements = this.achievementService.pinned();
      });
      return;
    }

    // Other profile: fetch from API and merge with base definitions
    this.http.get<{ success: boolean; achievements?: Array<{ id: string; unlocked: boolean; pinned: boolean; progress: number }> }>(
      `/api/auth/user/${userId}/achievements`
    ).pipe(
      map(response => {
        if (!response.success || !Array.isArray(response.achievements)) {
          return [];
        }
        const baseDefs = this.achievementService.loadBaseDefinitions();
        const savedMap = new Map(response.achievements.map(a => [a.id, a]));
        const pinned: Achievement[] = [];
        for (const def of baseDefs) {
          const saved = savedMap.get(def.id);
          if (saved && saved.pinned) {
            pinned.push({
              ...def,
              unlocked: saved.unlocked,
              pinned: saved.pinned,
              progress: saved.progress
            } as Achievement);
          }
        }
        return pinned;
      }),
      catchError(() => of([]))
    ).subscribe({
      next: achievements => {
        this.ngZone.run(() => {
          this.pinnedAchievements = achievements;
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

  getDifficultyName(level: number): string {
    return difficultyNumberToName(level);
  }
}
