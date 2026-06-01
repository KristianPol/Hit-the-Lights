import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService, User } from '../../app/services/auth.service';
import { SongService, SongDifficulty, DifficultyLevel, LeaderboardEntry, difficultyNumberToName, difficultyNameToNumber } from '../../app/services/song.service';
import { MessageService } from '../../app/services/message.service';
import { AchievementService } from '../../app/services/achievement.service';
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

interface Comment {
  id: number;
  songId: number;
  senderId: number;
  senderUsername?: string;
  parentCommentId?: number | null;
  content: string;
  createdAt: string;
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

  // reactive UI state using signals
  private activeItemSignal = signal<string>('Dashboard');
  get activeItem(): string { return this.activeItemSignal(); }
  set activeItem(v: string) { this.activeItemSignal.set(v); }

  private readonly currentUserSignal = signal<User | null>(null);
  get currentUser(): User | null { return this.currentUserSignal(); }
  set currentUser(v: User | null) { this.currentUserSignal.set(v); }

  private audio = new Audio();

  private readonly allSongsSignal = signal<Song[]>([]);
  readonly visibleSongs = computed(() => {
    const viewerId = this.currentUser?.id;
    return this.allSongsSignal().filter(song => this.isSongPublic(song) || this.isSongOwnedByViewer(song, viewerId));
  });
  private loadingErrorSignal = signal<string | null>(null);
  get loadingError(): string | null { return this.loadingErrorSignal(); }
  set loadingError(v: string | null) { this.loadingErrorSignal.set(v); }

  private isLoadingSignal = signal<boolean>(true);
  get isLoading(): boolean { return this.isLoadingSignal(); }
  set isLoading(v: boolean) { this.isLoadingSignal.set(v); }

  private selectedSongSignal = signal<Song | null>(null);
  get selectedSong(): Song | null { return this.selectedSongSignal(); }
  set selectedSong(v: Song | null) { this.selectedSongSignal.set(v); }

  private selectedDifficultyIdSignal = signal<number | null>(null);
  get selectedDifficultyId(): number | null { return this.selectedDifficultyIdSignal(); }
  set selectedDifficultyId(v: number | null) { this.selectedDifficultyIdSignal.set(v); }

  private uploadDifficultyChoiceSignal = signal<DifficultyLevel | null>(null);
  get uploadDifficultyChoice(): DifficultyLevel | null { return this.uploadDifficultyChoiceSignal(); }
  set uploadDifficultyChoice(v: DifficultyLevel | null) { this.uploadDifficultyChoiceSignal.set(v); }

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

  // Comments UI state
  // Comments UI state (use signals)
  private commentsSignal = signal<Comment[]>([]);
  get comments(): Comment[] { return this.commentsSignal(); }
  set comments(v: Comment[]) { this.commentsSignal.set(v); }

  private commentDraftSignal = signal<string>('');
  get commentDraft(): string { return this.commentDraftSignal(); }
  set commentDraft(v: string) { this.commentDraftSignal.set(v); }

  private replyingToSignal = signal<number | null>(null);
  get replyingTo(): number | null { return this.replyingToSignal(); }
  set replyingTo(v: number | null) { this.replyingToSignal.set(v); }

  private loadingCommentsSignal = signal<boolean>(false);
  get loadingComments(): boolean { return this.loadingCommentsSignal(); }
  set loadingComments(v: boolean) { this.loadingCommentsSignal.set(v); }

  private showAddTrackFormSignal = signal<boolean>(false);
  get showAddTrackForm(): boolean { return this.showAddTrackFormSignal(); }
  set showAddTrackForm(v: boolean) { this.showAddTrackFormSignal.set(v); }

  private pendingSongSignal = signal<AddSongFormData>({});
  get pendingSong(): AddSongFormData { return this.pendingSongSignal(); }
  set pendingSong(v: AddSongFormData) { this.pendingSongSignal.set(v); }

  private menuImageErrorSignal = signal<boolean>(false);
  get menuImageError(): boolean { return this.menuImageErrorSignal(); }
  set menuImageError(v: boolean) { this.menuImageErrorSignal.set(v); }

  constructor(
    private authService: AuthService,
    private songService: SongService,
    private messageService: MessageService,
    private achievementService: AchievementService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    this.currentUser = this.authService.currentUser;
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
    const viewerId = this.currentUser?.id;

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
    this.loadComments();
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

  private showDeleteConfirmSignal = signal<boolean>(false);
  get showDeleteConfirm(): boolean { return this.showDeleteConfirmSignal(); }
  set showDeleteConfirm(v: boolean) { this.showDeleteConfirmSignal.set(v); }

  private pendingDeleteSongSignal = signal<Song | null>(null);
  get pendingDeleteSong(): Song | null { return this.pendingDeleteSongSignal(); }
  set pendingDeleteSong(v: Song | null) { this.pendingDeleteSongSignal.set(v); }

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
          this.loadComments();
        } else {
          alert(`Failed to update visibility: ${response.error}`);
        }
      },
      error: err => alert(`Error updating visibility: ${err.message}`)
    });
  }

  /***** Comments handling *****/
  loadComments(): void {
    if (!this.selectedSong) {
      this.comments = [];
      return;
    }

    // Only load comments for public songs
    if (!this.isSongPublic(this.selectedSong)) {
      this.comments = [];
      return;
    }

    this.loadingComments = true;
    const viewerId = this.currentUser?.id;
    this.songService.getComments(this.selectedSong.id, viewerId ?? undefined).subscribe({
      next: response => {
        if (response.success && response.comments) {
          this.comments = response.comments;
        } else {
          this.comments = [];
        }
        this.loadingComments = false;
      },
      error: err => {
        console.warn('Failed to load comments', err);
        this.comments = [];
        this.loadingComments = false;
      }
    });
  }

  postComment(parentId?: number | null): void {
    if (!this.currentUser || !this.currentUser.id) {
      alert('You must be logged in to post comments');
      return;
    }

    const content = (this.commentDraft || '').trim();
    if (!content) {
      alert('Please enter a comment');
      return;
    }

    const payload: any = {
      senderId: this.currentUser.id,
      content
    };

    // Only include parentCommentId when replying to a specific comment.
    // Sending null was being converted to 0 on the server (Number(null) === 0)
    // which caused the backend to look for comment id 0 and fail with "Parent comment not found".
    if (parentId != null) {
      payload.parentCommentId = parentId;
    }

    this.songService.postComment(this.selectedSong!.id, payload).subscribe({
      next: response => {
        if (response.success && response.comment) {
          // append comment locally
          this.comments = [...this.comments, response.comment];
          this.commentDraft = '';
          this.replyingTo = null;
          this.achievementService.trackCommentPosted();
        } else {
          alert(`Failed to post comment: ${response.error}`);
        }
      },
      error: err => {
        console.warn('Failed to post comment', err);
        alert('Failed to post comment');
      }
    });
  }

  openReply(commentId: number) {
    this.replyingTo = commentId;
    const existing = this.comments.find(c => c.id === commentId);
    this.commentDraft = existing ? `@${existing.senderUsername || 'user'} ` : '';
  }

  cancelReply() {
    this.replyingTo = null;
    this.commentDraft = '';
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
