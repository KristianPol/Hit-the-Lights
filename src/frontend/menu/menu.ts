import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService, User } from '../../app/services/auth.service';
import { SongService, SongDifficulty, DifficultyLevel, LeaderboardEntry, difficultyNumberToName, difficultyNameToNumber } from '../../app/services/song.service';
import { MessageService } from '../../app/services/message.service';
import { tap, filter } from 'rxjs/operators';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
  badge?: number;
  isAction?: boolean;
  isSecluded?: boolean;
}

interface Song {
  id: number;
  name: string;
  author: string;
  length: string;
  bpm: number;
  coverUrl: string;
  songUrl: string;
  ownerId?: number | string | null;
  isPublic?: boolean | number | string;
  difficulties?: SongDifficulty[];
}

interface AddSongFormData {
  name?: string;
  author?: string;
  bpm?: number;
  audioFile?: File;
  coverFile?: File;
  visibility?: 'public' | 'private';
}

interface DifficultyPickerState {
  showPicker: boolean;
  difficulties: SongDifficulty[];
  selectedDifficultyId: number | null;
  showUploadForm: boolean;
  uploadDifficulty?: DifficultyLevel;
  uploadChartFile?: File;
}

interface LeaderboardState {
  loading: boolean;
  error: string | null;
  entries: LeaderboardEntry[];
  difficultyId: number | null;
  difficultyLabel: string;
}

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './menu.html',
  styleUrls: ['./menu.scss']
})
export class MenuComponent implements OnInit, OnDestroy {
  menuItems: MenuItem[] = [
    { label: 'Dashboard', icon: 'fas fa-house', route: '/dashboard' },
    { label: 'Profile', icon: 'fas fa-user', route: '/profile' },
    { label: 'About', icon: 'fas fa-circle-info', route: '/about', isSecluded: true },
    { label: 'Settings', icon: 'fas fa-gear', route: '/settings' },
    { label: 'Messages', icon: 'fas fa-envelope', route: '/messages' },
    { label: 'Analytics', icon: 'fas fa-chart-line', route: '/analytics' },
    { label: 'Logout', icon: 'fas fa-right-from-bracket', route: '/logout', isAction: true }
  ];

  unreadMessageCount = signal(0);

  activeItem = 'Dashboard';
  currentUser: User | null = null;
  private readonly currentUserSignal = signal<User | null>(null);
  private audio = new Audio();

  private readonly allSongsSignal = signal<Song[]>([]);
  readonly visibleSongs = computed(() => {
    const viewerId = this.currentUserSignal()?.id;
    return this.allSongsSignal().filter(song => this.isSongPublic(song) || this.isSongOwnedByViewer(song, viewerId));
  });
  loadingError: string | null = null;
  isLoading = true;

  selectedSong: Song | null = null;
  selectedDifficultyId: number | null = null;
  uploadDifficultyChoice: DifficultyLevel | null = null;

  difficultyPickerState = signal<DifficultyPickerState>({
    showPicker: false,
    difficulties: [],
    selectedDifficultyId: null,
    showUploadForm: false
  });

  leaderboardState = signal<LeaderboardState>({
    loading: false,
    error: null,
    entries: [],
    difficultyId: null,
    difficultyLabel: ''
  });

  showAddTrackForm = false;
  pendingSong: AddSongFormData = {};
  menuImageError = false;

  constructor(
    private authService: AuthService,
    private songService: SongService,
    private messageService: MessageService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    this.currentUser = this.authService.currentUser;
    this.currentUserSignal.set(this.currentUser);
    this.audio = new Audio();
    this.audio.volume = 1;
  }

  get songs(): Song[] {
    return this.visibleSongs();
  }

  ngOnInit() {
    // Subscribe to user changes to update profile picture
    this.authService.currentUser$.pipe(
      tap(user => {
        this.ngZone.run(() => {
          this.currentUser = user;
          this.currentUserSignal.set(user);
          this.menuImageError = false; // Reset image error on user update
          this.cdr.detectChanges();
          this.loadSongsFromDatabase();
        });
      })
    ).subscribe();

    // Refresh unread count whenever user navigates back to menu
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      tap(() => this.loadUnreadCount())
    ).subscribe();

    setTimeout(() => {
      this.loadSongsFromDatabase();
    }, 0);

    this.loadUnreadCount();
  }

  loadUnreadCount(): void {
    const user = this.currentUser;
    if (!user) return;
    this.messageService.getUnreadCount(user.id).subscribe({
      next: response => {
        if (response.success) {
          this.unreadMessageCount.set(response.count);
        }
      }
    });
  }

  loadSongsFromDatabase() {
    console.log('🎵 MenuComponent: Starting to load songs from database');
    this.isLoading = true;
    this.loadingError = null;
    const viewerId = this.currentUserSignal()?.id;

    this.songService.getAllSongs(viewerId ?? undefined).subscribe({
      next: response => {
        console.log('✅ MenuComponent: Received response from getAllSongs()', response);
        if (response.success) {
          this.allSongsSignal.set(response.songs.map(song => this.normalizeSong(song)));
          this.ensureSelectedSongVisible();
          if (this.selectedSong && this.selectedDifficultyId) {
            this.loadLeaderboardForSelection();
          }
          console.log(`📦 MenuComponent: Successfully loaded ${this.songs.length} visible songs`);
          this.loadingError = null;
          this.isLoading = false;
          console.log('🎶 MenuComponent: Songs array updated', this.songs);
          this.cdr.detectChanges();
        } else {
          console.error('❌ MenuComponent: API returned success=false', response.error);
          this.loadingError = response.error || 'Failed to load songs';
          this.allSongsSignal.set([]);
          this.isLoading = false;
        }
      },
      error: error => {
        console.error('❌ MenuComponent: Error loading songs', error);
        this.loadingError = `Error loading songs: ${error.message}`;
        this.allSongsSignal.set([]);
        this.isLoading = false;
      }
    });
  }

  ngOnDestroy() {
    this.stopAudio();
  }

  private stopAudio() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.src = '';
    }
  }

  setActive(item: string) {
    this.activeItem = item;
    const menuItem = this.menuItems.find(entry => entry.label === item);

    if (item === 'Logout') {
      this.logout();
      return;
    }

    if (menuItem?.route) {
      void this.router.navigate([menuItem.route]);
    }
  }

  selectSong(song: Song) {
    this.selectedSong = song;
    this.selectedDifficultyId = song.difficulties?.[0]?.id ?? null;
    this.loadLeaderboardForSelection();
    this.playSong(this.selectedSong.songUrl).then(() => "Audio played");
  }

  openDifficultyPicker() {
    if (!this.selectedSong) return;

    this.songService.getSongDifficulties(this.selectedSong.id, this.currentUser?.id ?? undefined).subscribe({
      next: response => {
        if (response.success && response.difficulties) {
          this.difficultyPickerState.set({
            showPicker: true,
            difficulties: response.difficulties,
            selectedDifficultyId: this.selectedDifficultyId,
            showUploadForm: false
          });
        }
      },
      error: () => {
        console.error('Failed to load difficulties');
        alert('Failed to load difficulties');
      }
    });
  }

  selectDifficulty(difficultyId: number) {
    this.selectedDifficultyId = difficultyId;
    this.difficultyPickerState.update(state => ({
      ...state,
      selectedDifficultyId: difficultyId,
      showPicker: false
    }));
    this.loadLeaderboardForSelection();
  }

  getSelectedDifficultyLevel(): string {
    if (!this.selectedDifficultyId || !this.difficultyPickerState().difficulties) {
      return '?';
    }
    const found = this.difficultyPickerState().difficulties.find(d => d.id === this.selectedDifficultyId);
    return found ? difficultyNumberToName(found.difficulty) : '?';
  }

  isDifficultyAvailable(difficultyLevel: DifficultyLevel): boolean {
    const numLevel = difficultyNameToNumber(difficultyLevel);
    return !this.difficultyPickerState().difficulties.some(existing => existing.difficulty === numLevel);
  }

  closeDifficultyPicker() {
    this.difficultyPickerState.update(state => ({
      ...state,
      showPicker: false,
      showUploadForm: false
    }));
  }

  openUploadDifficultyForm() {
    this.difficultyPickerState.update(state => ({
      ...state,
      showUploadForm: true,
      uploadDifficulty: undefined,
      uploadChartFile: undefined
    }));
    this.uploadDifficultyChoice = null;
  }

  closeUploadDifficultyForm() {
    this.difficultyPickerState.update(state => ({
      ...state,
      showUploadForm: false,
      uploadDifficulty: undefined,
      uploadChartFile: undefined
    }));
    this.uploadDifficultyChoice = null;
  }

  onChartFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const file = input.files[0];
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        this.difficultyPickerState.update(state => ({
          ...state,
          uploadChartFile: file,
          uploadDifficulty: state.uploadDifficulty ?? undefined
        }));
      } else {
        alert('Please select a valid JSON chart file');
        input.value = '';
      }
    }
  }

  uploadChartDifficulty() {
    const state = this.difficultyPickerState();
    if (!this.selectedSong || !this.uploadDifficultyChoice || !state.uploadChartFile || !this.currentUser?.id) {
      alert('Please fill in all fields');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const chartData = JSON.parse(content);

        if (!Array.isArray(chartData.notes) || chartData.notes.length === 0) {
          alert('Chart must contain at least one note');
          return;
        }

        this.songService.addSongDifficulty(this.selectedSong!.id, {
          ownerId: this.currentUser!.id,
          difficulty: difficultyNameToNumber(this.uploadDifficultyChoice!),
          notes: chartData.notes
        }).subscribe({
          next: response => {
            if (response.success) {
              alert('Chart uploaded successfully!');
              this.closeUploadDifficultyForm();
              this.loadSongsFromDatabase();
            } else {
              alert(`Failed to upload chart: ${response.error}`);
            }
          },
          error: err => alert(`Error uploading chart: ${err.message}`)
        });
      } catch (error) {
        alert('Invalid JSON file format');
      }
    };
    reader.readAsText(state.uploadChartFile);
  }

  get isSelectedSongOwnedByCurrentUser(): boolean {
    return !!this.selectedSong && this.isSongOwnedByViewer(this.selectedSong, this.currentUser?.id);
  }

  canManageSong(song: Song): boolean {
    return this.isSongOwnedByViewer(song, this.currentUser?.id);
  }

  get selectedSongVisibility(): string {
    if (!this.selectedSong) {
      return '';
    }

    return this.isSongPublic(this.selectedSong) ? 'Public' : 'Private';
  }

  launchGameplay(song: Song | null = this.selectedSong): void {
    if (!song) {
      alert('Please select a song first.');
      return;
    }

    this.stopAudio();
    this.router.navigate(['/gameplay', song.id], { state: { song, difficultyId: this.selectedDifficultyId } });
  }

  showDeleteConfirm = false;
  pendingDeleteSong: Song | null = null;

  requestDeleteSong(song: Song) {
    if (!this.canManageSong(song)) {
      alert('Only the uploader can delete this song.');
      return;
    }

    this.pendingDeleteSong = song;
    this.showDeleteConfirm = true;
  }

  confirmDelete() {
    if (this.pendingDeleteSong) {
      // Optimistic delete - remove immediately
      const songId = this.pendingDeleteSong.id;
      this.allSongsSignal.update(songs => songs.filter(song => song.id !== songId));
      if (this.selectedSong?.id === songId) {
        this.selectedSong = null;
        this.stopAudio();
      }

      const viewerId = this.currentUser?.id;

      this.songService.deleteSong(songId, viewerId ?? undefined).subscribe({
        next: response => {
          if (!response.success) {
            console.error('Delete failed, restoring:', response.error);
            this.loadSongsFromDatabase(); // Restore on failure
          } else {
            console.log('✅ Song deleted successfully');
            // Already removed optimistically
          }
        },
        error: error => {
          console.error('❌ Delete error, restoring:', error);
          this.loadSongsFromDatabase();
        }
      });
    }
    this.cancelDelete();
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.pendingDeleteSong = null;
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  async playSong(url: string) {
    try {
      this.stopAudio();

      if (!this.audio) {
        this.audio = new Audio();
        this.audio.volume = 1;
      }

      this.audio.src = url;

      await new Promise((resolve, reject) => {
        this.audio!.onloadedmetadata = resolve;
        this.audio!.onerror = reject;
        this.audio!.load();
      });

      await this.audio.play();
    } catch (error) {
      console.error('Playback failed:', error);
      if (error instanceof DOMException && error.name === 'NotSupportedError') {
        alert('Audio format not supported or file not found');
      }
    }
  }

  navigateToProfile() {
    this.router.navigate(['/profile']);
    this.activeItem = 'Profile';
  }

  onMenuImageError(): void {
    console.error('Failed to load profile picture in menu');
    this.menuImageError = true;
  }

  openAddTrackForm(): void {
    this.showAddTrackForm = true;
    this.pendingSong.visibility = 'public';
  }

  closeAddTrackForm(): void {
    this.showAddTrackForm = false;
    this.pendingSong = { visibility: 'public' };
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.pendingSong.audioFile = input.files[0];
    }
  }

  onCoverSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.pendingSong.coverFile = input.files[0];
    }
  }

  submitTrack(): void {
    const { name, author, bpm, audioFile, coverFile, visibility = 'public' } = this.pendingSong;

    if (!name || !author || !bpm || !audioFile || !coverFile) {
      alert('Please fill in all fields.');
      return;
    }

    if (visibility === 'private' && !this.currentUser?.id) {
      alert('Please log in to create a private track.');
      return;
    }

    const ownerId = this.currentUser?.id ?? null;
    const isPublic = visibility === 'public';

    Promise.all([
      this.getAudioDuration(audioFile),
      this.fileToBase64(audioFile),
      this.fileToBase64(coverFile)
    ])
      .then(([length, audioBase64, coverBase64]) => {
        this.songService.addSong({
          name,
          author,
          bpm: parseInt(bpm.toString(), 10),
          length,
          audioBase64,
          audioMimeType: audioFile.type,
          coverBase64,
          coverMimeType: coverFile.type,
          ownerId,
          isPublic
        }).subscribe({
          next: response => {
            if (response.success) {
              this.allSongsSignal.update(songs => [...songs, {
                id: response.songId || this.songs.length + 1,
                name,
                author,
                bpm: parseInt(bpm.toString(), 10),
                length,
                songUrl: response.songUrl ?? '',
                coverUrl: response.coverUrl ?? '',
                ownerId: response.ownerId ?? ownerId,
                isPublic: response.isPublic ?? isPublic
              }]);
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

  toggleSelectedSongVisibility(): void {
    if (!this.selectedSong || !this.currentUser?.id) {
      return;
    }

    if (!this.isSongOwnedByViewer(this.selectedSong, this.currentUser.id)) {
      alert('Only the owner can change song visibility.');
      return;
    }

    const nextVisibility = !this.isSongPublic(this.selectedSong);

    this.songService.updateSongVisibility(this.selectedSong.id, {
      ownerId: this.currentUser.id,
      isPublic: nextVisibility
    }).subscribe({
      next: response => {
        if (response.success && response.song) {
          this.selectedSong = response.song;
          this.loadSongsFromDatabase();
        } else {
          alert(`Failed to update visibility: ${response.error}`);
        }
      },
      error: err => alert(`Error updating visibility: ${err.message}`)
    });
  }

  private ensureSelectedSongVisible(): void {
    if (!this.selectedSong) {
      return;
    }

    const stillVisible = this.songs.some(song => song.id === this.selectedSong?.id);
    if (!stillVisible) {
      this.selectedSong = null;
      this.stopAudio();
    }
  }

  private normalizeSong(song: Song): Song {
    return {
      ...song,
      ownerId: this.toNumberOrNull(song.ownerId),
      isPublic: this.toBoolean(song.isPublic, true)
    };
  }

  private isSongPublic(song: Song): boolean {
    return this.toBoolean(song.isPublic, true);
  }

  private isSongOwnedByViewer(song: Song, viewerId?: number | null): boolean {
    if (viewerId == null) {
      return false;
    }

    const ownerId = this.toNumberOrNull(song.ownerId);
    return ownerId === viewerId;
  }

  private toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private toBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') {
        return true;
      }
      if (normalized === 'false' || normalized === '0') {
        return false;
      }
    }

    return fallback;
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

  private loadLeaderboardForSelection(): void {
    if (!this.selectedSong || !this.selectedDifficultyId) {
      this.leaderboardState.set({
        loading: false,
        error: null,
        entries: [],
        difficultyId: null,
        difficultyLabel: ''
      });
      return;
    }

    const selectedDifficulty = this.selectedSong.difficulties?.find(diff => diff.id === this.selectedDifficultyId);
    const difficultyLabel = selectedDifficulty ? difficultyNumberToName(selectedDifficulty.difficulty) : 'Difficulty';

    this.leaderboardState.set({
      loading: true,
      error: null,
      entries: this.leaderboardState().entries,
      difficultyId: this.selectedDifficultyId,
      difficultyLabel
    });

    this.songService.getDifficultyLeaderboard(this.selectedSong.id, this.selectedDifficultyId, this.currentUser?.id ?? undefined).subscribe({
      next: response => {
        if (response.success) {
          this.leaderboardState.set({
            loading: false,
            error: null,
            entries: response.entries,
            difficultyId: response.difficultyId,
            difficultyLabel
          });
        } else {
          this.leaderboardState.set({
            loading: false,
            error: response.error || 'Failed to load leaderboard',
            entries: [],
            difficultyId: this.selectedDifficultyId,
            difficultyLabel
          });
        }
      },
      error: err => {
        this.leaderboardState.set({
          loading: false,
          error: err.message || 'Failed to load leaderboard',
          entries: [],
          difficultyId: this.selectedDifficultyId,
          difficultyLabel
        });
      }
    });
  }
}
