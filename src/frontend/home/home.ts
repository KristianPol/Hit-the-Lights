import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService, User } from '../../app/services/auth.service';
import { FriendshipService, FriendshipResult, SuggestedUser } from '../../app/services/friendship.service';
import { SongService, Song } from '../../app/services/song.service';

const GREETINGS = [
  'Hello',
  'Fine day',
  'Welcome back',
  'Good to see you',
  'Hey there',
  'What\'s up',
  'Glad you\'re here',
  'Ready to rock'
];

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.html',
  styleUrls: ['./home.scss']
})
export class HomePage implements OnInit {
  currentUser = signal<User | null>(null);
  greeting = signal<string>('');
  friends = signal<FriendshipResult[]>([]);
  recentlyPlayed = signal<Song[]>([]);
  recommended = signal<Song[]>([]);
  loadingFriends = signal<boolean>(true);
  loadingSongs = signal<boolean>(true);
  loadingRecommended = signal<boolean>(true);
  errorFriends = signal<string | null>(null);
  errorSongs = signal<string | null>(null);
  errorRecommended = signal<string | null>(null);
  errorSuggestions = signal<string | null>(null);
  loadingSuggestions = signal<boolean>(true);
  suggestions = signal<SuggestedUser[]>([]);
  sentRequestIds = signal<Set<number>>(new Set());
  imageError = signal<boolean>(false);

  readonly displayedFriends = computed(() => this.friends().slice(0, 10));

  constructor(
    private authService: AuthService,
    private friendshipService: FriendshipService,
    private songService: SongService
  ) {}

  ngOnInit(): void {
    const user = this.authService.currentUser;
    this.currentUser.set(user);
    this.greeting.set(this.pickGreeting());

    if (user) {
      this.loadFriends(user.id);
      this.loadRecentlyPlayed(user.id);
      this.loadRecommended(user.id);
      this.loadSuggestions(user.id);
    } else {
      this.loadingFriends.set(false);
      this.loadingSongs.set(false);
      this.loadingRecommended.set(false);
      this.loadingSuggestions.set(false);
    }
  }

  private pickGreeting(): string {
    const index = Math.floor(Math.random() * GREETINGS.length);
    return GREETINGS[index];
  }

  private loadFriends(userId: number): void {
    this.friendshipService.getFriends(userId).subscribe({
      next: res => {
        if (res.success && Array.isArray(res.friends)) {
          this.friends.set(res.friends);
        } else {
          this.errorFriends.set(res.error || 'Failed to load friends.');
        }
        this.loadingFriends.set(false);
      },
      error: err => {
        this.errorFriends.set(err.message || 'Failed to load friends.');
        this.loadingFriends.set(false);
      }
    });
  }

  private loadRecentlyPlayed(userId: number): void {
    this.songService.getRecentlyPlayed(userId).subscribe({
      next: res => {
        if (res.success && Array.isArray(res.songs)) {
          this.recentlyPlayed.set(res.songs);
        } else {
          this.errorSongs.set(res.error || 'Failed to load recently played songs.');
        }
        this.loadingSongs.set(false);
      },
      error: err => {
        this.errorSongs.set(err.message || 'Failed to load recently played songs.');
        this.loadingSongs.set(false);
      }
    });
  }

  private loadRecommended(userId: number): void {
    this.songService.getAllSongs({ viewerId: userId, visibility: 'all' }).subscribe({
      next: res => {
        if (res.success && Array.isArray(res.songs)) {
          const shuffled = [...res.songs].sort(() => Math.random() - 0.5);
          const count = Math.floor(Math.random() * 3) + 3; // 3 to 5
          this.recommended.set(shuffled.slice(0, count));
        } else {
          this.errorRecommended.set(res.error || 'Failed to load recommended songs.');
        }
        this.loadingRecommended.set(false);
      },
      error: err => {
        this.errorRecommended.set(err.message || 'Failed to load recommended songs.');
        this.loadingRecommended.set(false);
      }
    });
  }

  private loadSuggestions(userId: number): void {
    this.friendshipService.getSuggestions(userId).subscribe({
      next: res => {
        if (res.success && Array.isArray(res.users)) {
          this.suggestions.set(res.users);
        } else {
          this.errorSuggestions.set(res.error || 'Failed to load suggestions.');
        }
        this.loadingSuggestions.set(false);
      },
      error: err => {
        this.errorSuggestions.set(err.message || 'Failed to load suggestions.');
        this.loadingSuggestions.set(false);
      }
    });
  }

  sendFriendRequest(userId: number, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.sentRequestIds().has(userId)) return;

    this.friendshipService.sendFriendRequest(userId).subscribe({
      next: res => {
        if (res.success) {
          this.sentRequestIds.update(set => {
            const next = new Set(set);
            next.add(userId);
            return next;
          });
        } else {
          console.error('Failed to send friend request:', res.error);
        }
      },
      error: err => {
        console.error('Failed to send friend request:', err.message);
      }
    });
  }

  onImageError(): void {
    this.imageError.set(true);
  }

  trackByFriendId(_index: number, friend: FriendshipResult): number {
    return friend.id;
  }

  trackBySongId(_index: number, song: Song): number {
    return song.id;
  }

  trackByUserId(_index: number, user: SuggestedUser): number {
    return user.id;
  }
}
