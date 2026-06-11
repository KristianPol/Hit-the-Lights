import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { AuthService, User } from '../../../app/services/auth.service';
import { SongService, Song, AddSongRequest } from '../../../app/services/song.service';
import { normalizeSong, isSongOwnedByViewer } from '../menu-helpers';

const GENRES = [
  'Electronic', 'House', 'Techno', 'Trance', 'Dubstep', 'Drum & Bass', 'Hardstyle',
  'Future Bass', 'Synthwave', 'Vaporwave', 'Hyperpop', 'Phonk', 'EDM', 'Trap',
  'Hip Hop', 'Pop', 'Rock', 'Metal', 'Jazz', 'Classical', 'Funk', 'R&B',
  'K-Pop', 'J-Pop', 'Anime', 'Game', 'Chiptune', '8-bit', 'Orchestral',
  'Ambient', 'Lo-Fi', 'Downtempo', 'Experimental', 'Industrial', 'Speedcore',
  'Happy Hardcore', 'UK Garage', 'Breakbeat', 'Jungle', 'Folk', 'Country',
  'Blues', 'Soul', 'Reggae', 'Latin', 'Afrobeat', 'World', 'Other'
];

interface AddSongFormData {
  name?: string;
  author?: string;
  bpm?: number;
  audioFile?: File;
  coverFile?: File;
  visibility?: 'public' | 'private';
  genre?: string;
}

@Component({
  selector: 'app-song-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './song-list.component.html',
  styleUrls: ['./song-list.component.scss']
})
export class SongListComponent implements OnInit, OnDestroy {
  readonly genres = GENRES;

  songs = signal<Song[]>([]);
  loadingError = signal<string | null>(null);
  isLoading = signal<boolean>(true);

  searchQuery = signal<string>('');
  selectedGenre = signal<string>('');
  sortOption = signal<string>('newest');

  showAddTrackForm = signal<boolean>(false);
  pendingSong = signal<AddSongFormData>({ visibility: 'public' });

  currentUser = signal<User | null>(null);

  canUpload = signal<boolean>(true);
  uploadCooldownSeconds = signal<number>(0);
  private cooldownIntervalId: number | null = null;

  private searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private songService: SongService,
    private router: Router
  ) {
    this.currentUser.set(this.authService.currentUser);
  }

  ngOnInit(): void {
    this.searchSubscription = this.searchSubject.pipe(debounceTime(300)).subscribe(() => {
      this.loadSongsFromDatabase();
    });

    setTimeout(() => {
      this.loadSongsFromDatabase();
    }, 0);

    this.checkUploadStatus();
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
    if (this.cooldownIntervalId) {
      clearInterval(this.cooldownIntervalId);
    }
  }

  private checkUploadStatus(): void {
    if (!this.authService.isLoggedIn) {
      this.canUpload.set(false);
      return;
    }
    this.songService.getUploadStatus().subscribe({
      next: response => {
        if (response.success) {
          this.canUpload.set(response.canUpload);
          if (!response.canUpload && response.remainingSeconds) {
            this.uploadCooldownSeconds.set(response.remainingSeconds);
            this.startCooldownTimer();
          }
        }
      },
      error: err => console.warn('Upload status check failed:', err)
    });
  }

  private startCooldownTimer(): void {
    if (this.cooldownIntervalId) {
      clearInterval(this.cooldownIntervalId);
    }
    this.cooldownIntervalId = window.setInterval(() => {
      this.uploadCooldownSeconds.update(s => {
        if (s <= 1) {
          this.canUpload.set(true);
          if (this.cooldownIntervalId) {
            clearInterval(this.cooldownIntervalId);
            this.cooldownIntervalId = null;
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  formatCooldown(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  loadSongsFromDatabase(): void {
    this.isLoading.set(true);
    this.loadingError.set(null);
    const options = {
      search: this.searchQuery().trim() || undefined,
      genre: this.selectedGenre() || undefined,
      sort: this.sortOption() || undefined
    };

    this.songService.getAllSongs(options).subscribe({
      next: response => {
        if (response.success) {
          this.songs.set(response.songs.map(song => normalizeSong(song)));
          this.loadingError.set(null);
        } else {
          this.loadingError.set(response.error || 'Failed to load songs');
          this.songs.set([]);
        }
        this.isLoading.set(false);
      },
      error: error => {
        this.loadingError.set(`Error loading songs: ${error.message}`);
        this.songs.set([]);
        this.isLoading.set(false);
      }
    });
  }

  onSearchInput(): void {
    this.searchSubject.next(this.searchQuery());
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.loadSongsFromDatabase();
  }

  onGenreChange(): void {
    this.loadSongsFromDatabase();
  }

  onSortChange(): void {
    this.loadSongsFromDatabase();
  }

  selectSong(song: Song): void {
    void this.router.navigate(['/menu/song', song.id]);
  }

  toggleLike(song: Song, event: MouseEvent): void {
    event.stopPropagation();
    const userId = this.currentUser()?.id;
    if (!userId) {
      alert('Please log in to like songs');
      return;
    }

    if (song.isLikedByUser) {
      this.songService.unlikeSong(song.id).subscribe({
        next: () => {
          this.songs.update(songs =>
            songs.map(s =>
              s.id === song.id
                ? { ...s, isLikedByUser: false, likeCount: Number(s.likeCount ?? 1) - 1 }
                : s
            )
          );
        },
        error: err => console.error('Failed to unlike song', err)
      });
    } else {
      this.songService.likeSong(song.id).subscribe({
        next: () => {
          this.songs.update(songs =>
            songs.map(s =>
              s.id === song.id
                ? { ...s, isLikedByUser: true, likeCount: Number(s.likeCount ?? 0) + 1 }
                : s
            )
          );
        },
        error: err => console.error('Failed to like song', err)
      });
    }
  }

  canManageSong(song: Song): boolean {
    return isSongOwnedByViewer(song, this.currentUser()?.id);
  }

  openAddTrackForm(): void {
    this.showAddTrackForm.set(true);
    this.pendingSong.update(s => ({ ...s, visibility: 'public' }));
  }

  closeAddTrackForm(): void {
    this.showAddTrackForm.set(false);
    this.pendingSong.set({ visibility: 'public' });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.pendingSong.update(s => ({ ...s, audioFile: input.files![0] }));
    }
  }

  onCoverSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.pendingSong.update(s => ({ ...s, coverFile: input.files![0] }));
    }
  }

  updatePendingName(value: string): void {
    this.pendingSong.update(s => ({ ...s, name: value }));
  }

  updatePendingAuthor(value: string): void {
    this.pendingSong.update(s => ({ ...s, author: value }));
  }

  updatePendingBpm(value: string): void {
    this.pendingSong.update(s => ({ ...s, bpm: value ? Number(value) : undefined }));
  }

  updatePendingVisibility(value: string): void {
    this.pendingSong.update(s => ({ ...s, visibility: value as 'public' | 'private' }));
  }

  updatePendingGenre(value: string): void {
    this.pendingSong.update(s => ({ ...s, genre: value }));
  }

  submitTrack(): void {
    const { name, author, bpm, audioFile, coverFile, visibility = 'public', genre } = this.pendingSong();

    if (!name || !author || !bpm || !audioFile || !coverFile) {
      alert('Please fill in all fields.');
      return;
    }

    if (visibility === 'private' && !this.currentUser()?.id) {
      alert('Please log in to create a private track.');
      return;
    }

    const ownerId = this.currentUser()?.id ?? null;
    const isPublic = visibility === 'public';

    Promise.all([
      this.getAudioDuration(audioFile),
      this.fileToBase64(audioFile),
      this.fileToBase64(coverFile)
    ])
      .then(([length, audioBase64, coverBase64]) => {
        const payload: AddSongRequest = {
          name,
          author,
          bpm: parseInt(bpm.toString(), 10),
          length,
          audioBase64,
          audioMimeType: audioFile.type,
          coverBase64,
          coverMimeType: coverFile.type,
          isPublic,
          genre: genre || null
        };

        this.songService.addSong(payload).subscribe({
          next: response => {
            if (response.success) {
              this.songs.update(songs => [
                ...songs,
                {
                  id: response.songId || this.songs().length + 1,
                  name,
                  author,
                  bpm: parseInt(bpm.toString(), 10),
                  length,
                  songUrl: response.songUrl ?? '',
                  coverUrl: response.coverUrl ?? '',
                  ownerId: response.ownerId ?? ownerId,
                  isPublic: response.isPublic ?? isPublic,
                  genre: genre || null
                } as Song
              ]);
              this.loadSongsFromDatabase();
              this.closeAddTrackForm();
            } else {
              alert(`Failed to add song: ${response.error}`);
            }
          },
          error: err => alert(`Error adding song: ${err.message}`)
        });
      })
      .catch(err => alert(`Failed to process files: ${err}`));
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = () => reject('Failed to read file');
      reader.readAsDataURL(file);
    });
  }

  private getAudioDuration(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      let durationSet = false;

      const timeout = setTimeout(() => {
        if (!durationSet) {
          audio.pause();
          URL.revokeObjectURL(url);
          reject('Timeout: Could not load audio duration');
        }
      }, 5000);

      audio.onloadedmetadata = () => {
        if (audio.duration && audio.duration !== Infinity) {
          durationSet = true;
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          resolve(this.formatDuration(audio.duration));
        }
      };

      audio.oncanplay = () => {
        if (!durationSet && audio.duration && audio.duration !== Infinity) {
          durationSet = true;
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          resolve(this.formatDuration(audio.duration));
        }
      };

      audio.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        reject('Failed to load audio file');
      };

      audio.src = url;
      audio.load();
    });
  }

  private formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}
