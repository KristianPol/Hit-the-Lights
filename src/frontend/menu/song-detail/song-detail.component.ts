import { Component, OnInit, OnDestroy, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { tap } from 'rxjs/operators';
import { AuthService, User } from '../../../app/services/auth.service';
import {
  SongService,
  SongDifficulty,
  DifficultyLevel,
  LeaderboardEntry,
  UpdateSongRequest,
  difficultyNumberToName,
  difficultyNameToNumber
} from '../../../app/services/song.service';
import { AchievementService } from '../../../app/services/achievement.service';
import { MultiplayerService } from '../../../app/services/multiplayer.service';
import { FriendshipService, FriendshipResult } from '../../../app/services/friendship.service';
import { calculateDifficultyEstimate } from '../../utils/difficulty-calculator';
import { Song, Comment, normalizeSong, isSongPublic, isSongOwnedByViewer } from '../menu-helpers';

const GENRES = [
  'Electronic', 'House', 'Techno', 'Trance', 'Dubstep', 'Drum & Bass', 'Hardstyle',
  'Future Bass', 'Synthwave', 'Vaporwave', 'Hyperpop', 'Phonk', 'EDM', 'Trap',
  'Hip Hop', 'Pop', 'Rock', 'Metal', 'Jazz', 'Classical', 'Funk', 'R&B',
  'K-Pop', 'J-Pop', 'Anime', 'Game', 'Chiptune', '8-bit', 'Orchestral',
  'Ambient', 'Lo-Fi', 'Downtempo', 'Experimental', 'Industrial', 'Speedcore',
  'Happy Hardcore', 'UK Garage', 'Breakbeat', 'Jungle', 'Folk', 'Country',
  'Blues', 'Soul', 'Reggae', 'Latin', 'Afrobeat', 'World', 'Other'
];

const songOwnedByViewer = isSongOwnedByViewer;

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

interface EditSongForm {
  name: string;
  author: string;
  bpm: number | undefined;
  genre: string | null;
  isPublic: boolean;
  audioFile?: File;
  coverFile?: File;
}

@Component({
  selector: 'app-song-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './song-detail.component.html',
  styleUrls: ['./song-detail.component.scss']
})
export class SongDetailComponent implements OnInit, OnDestroy {
  isSongOwnedByViewer = songOwnedByViewer;
  difficultyNumberToName = difficultyNumberToName;

  canDeleteSong(song: Song, viewerId?: number | null): boolean {
    if (isSongOwnedByViewer(song, viewerId)) return true;
    return this.authService.isAdmin;
  }

  canEditSong(song: Song, viewerId?: number | null): boolean {
    return isSongOwnedByViewer(song, viewerId);
  }

  canEditComment(comment: Comment): boolean {
    const user = this.currentUser();
    return !!user && (user.id === comment.senderId || this.authService.isAdmin);
  }

  canDeleteComment(comment: Comment): boolean {
    const user = this.currentUser();
    return !!user && (user.id === comment.senderId || this.authService.isAdmin);
  }

  toggleCommentMenu(commentId: number, event?: MouseEvent): void {
    event?.stopPropagation();
    this.activeCommentMenuId.update(id => id === commentId ? null : commentId);
  }

  closeCommentMenu(): void {
    this.activeCommentMenuId.set(null);
  }

  togglePlayDropdown(event?: MouseEvent): void {
    event?.stopPropagation();
    this.playDropdownOpen.update(open => !open);
  }

  closePlayDropdown(): void {
    this.playDropdownOpen.set(false);
  }

  goToDuel(): void {
    this.stopAudio();
    this.closePlayDropdown();
    this.openDuelModal();
  }

  openDuelModal(): void {
    const user = this.currentUser();
    if (!user?.id) {
      alert('Please log in to challenge a friend.');
      return;
    }
    this.duelModalOpen.set(true);
    this.duelLoading.set(true);
    this.duelError.set(null);
    this.friendshipService.getFriends(user.id).subscribe({
      next: response => {
        if (response.success) {
          this.duelFriends.set(response.friends);
        } else {
          this.duelError.set(response.error || 'Failed to load friends');
        }
        this.duelLoading.set(false);
      },
      error: err => {
        this.duelError.set(err.message || 'Failed to load friends');
        this.duelLoading.set(false);
      }
    });
  }

  closeDuelModal(): void {
    this.duelModalOpen.set(false);
    this.duelError.set(null);
  }

  inviteFriendToDuel(friend: FriendshipResult): void {
    const user = this.currentUser();
    const song = this.song();
    const difficultyId = this.selectedDifficultyId();
    if (!user?.id || !song || !difficultyId) return;

    this.duelInviting.set(true);
    this.duelError.set(null);
    this.multiplayerService.createRoom(difficultyId, friend.otherUser.id).subscribe({
      next: response => {
        if (response.success && response.roomId) {
          this.duelInviting.set(false);
          this.closeDuelModal();
          void this.router.navigate(['/gameplay', song.id], {
            state: { song, difficultyId, roomId: response.roomId }
          });
        } else {
          this.duelError.set(response.error || 'Failed to create duel room');
          this.duelInviting.set(false);
        }
      },
      error: err => {
        this.duelError.set(err.message || 'Failed to create duel room');
        this.duelInviting.set(false);
      }
    });
  }

  startEditComment(comment: Comment): void {
    this.closeCommentMenu();
    this.editingCommentId.set(comment.id);
    this.editCommentDraft.set(comment.content);
  }

  cancelEditComment(): void {
    this.editingCommentId.set(null);
    this.editCommentDraft.set('');
  }

  submitEditComment(): void {
    const song = this.song();
    const commentId = this.editingCommentId();
    const content = this.editCommentDraft().trim();
    if (!song || !commentId || !content) return;

    this.songService.updateComment(song.id, commentId, content).subscribe({
      next: response => {
        if (response.success && response.comment) {
          this.comments.update(list => list.map(c => c.id === commentId ? response.comment! : c));
          this.editingCommentId.set(null);
          this.editCommentDraft.set('');
        } else {
          alert(`Failed to update comment: ${response.error}`);
        }
      },
      error: err => alert(`Error updating comment: ${err.message}`)
    });
  }

  requestDeleteComment(comment: Comment): void {
    this.closeCommentMenu();
    this.commentToDelete.set(comment);
    this.showDeleteCommentConfirm.set(true);
  }

  confirmDeleteComment(): void {
    const song = this.song();
    const comment = this.commentToDelete();
    if (!song || !comment) return;

    this.songService.deleteComment(song.id, comment.id).subscribe({
      next: response => {
        if (response.success) {
          this.comments.update(list => list.filter(c => c.id !== comment.id && c.parentCommentId !== comment.id));
          this.showDeleteCommentConfirm.set(false);
          this.commentToDelete.set(null);
        } else {
          alert(`Failed to delete comment: ${response.error}`);
        }
      },
      error: err => alert(`Error deleting comment: ${err.message}`)
    });
  }

  cancelDeleteComment(): void {
    this.showDeleteCommentConfirm.set(false);
    this.commentToDelete.set(null);
  }

  song = signal<Song | null>(null);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  currentUser = signal<User | null>(null);

  selectedDifficultyId = signal<number | null>(null);
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

  comments = signal<Comment[]>([]);
  commentDraft = signal<string>('');
  replyingTo = signal<number | null>(null);
  loadingComments = signal<boolean>(false);

  uploadDifficultyChoice = signal<DifficultyLevel | null>(null);

  activeCommentMenuId = signal<number | null>(null);
  playDropdownOpen = signal<boolean>(false);
  duelModalOpen = signal<boolean>(false);
  duelFriends = signal<FriendshipResult[]>([]);
  duelLoading = signal<boolean>(false);
  duelError = signal<string | null>(null);
  duelInviting = signal<boolean>(false);
  editingCommentId = signal<number | null>(null);
  editCommentDraft = signal<string>('');
  commentToDelete = signal<Comment | null>(null);
  showDeleteCommentConfirm = signal<boolean>(false);

  showDeleteConfirm = signal<boolean>(false);

  showEditModal = signal<boolean>(false);
  editForm = signal<EditSongForm>({
    name: '',
    author: '',
    bpm: undefined,
    genre: null,
    isPublic: true
  });
  isSavingEdit = signal<boolean>(false);
  editError = signal<string | null>(null);
  readonly genres = GENRES;

  showDeleteDifficultyConfirm = signal<boolean>(false);
  difficultyToDelete = signal<SongDifficulty | null>(null);

  private audio = new Audio();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private songService: SongService,
    private achievementService: AchievementService,
    private friendshipService: FriendshipService,
    private multiplayerService: MultiplayerService
  ) {
    this.currentUser.set(this.authService.currentUser);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target || !target.closest('.comment-menu-wrap')) {
      this.closeCommentMenu();
    }
    if (!target || !target.closest('.play-dropdown')) {
      this.closePlayDropdown();
    }
  }

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      tap(user => this.currentUser.set(user))
    ).subscribe();

    this.route.paramMap.subscribe(params => {
      const rawId = params.get('songId');
      const songId = rawId ? Number(rawId) : NaN;
      if (!Number.isFinite(songId)) {
        this.error.set('Invalid song ID');
        this.loading.set(false);
        return;
      }
      this.loadSong(songId);
    });
  }

  ngOnDestroy(): void {
    this.stopAudio();
  }

  private loadSong(songId: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.song.set(null);

    this.songService.getSongById(songId, this.currentUser()?.id).subscribe({
      next: response => {
        if (response.success && response.song) {
          const normalized = normalizeSong(response.song);
          this.song.set(normalized);
          this.selectedDifficultyId.set(normalized.difficulties?.[0]?.id ?? null);
          this.loadDifficulties(songId);
          this.loadComments(songId);
          this.loadLeaderboard();
          if (normalized.songUrl) {
            this.playSong(normalized.songUrl).catch(() => {});
          }
          this.loading.set(false);
        } else {
          this.error.set(response.error || 'Song not found');
          this.loading.set(false);
        }
      },
      error: err => {
        this.error.set(err.message || 'Failed to load song');
        this.loading.set(false);
      }
    });
  }

  private loadDifficulties(songId: number): void {
    this.songService.getSongDifficulties(songId, this.currentUser()?.id).subscribe({
      next: response => {
        if (response.success && response.difficulties) {
          this.difficultyPickerState.update(state => ({
            ...state,
            difficulties: response.difficulties ?? []
          }));
        }
      }
    });
  }

  private loadLeaderboard(): void {
    const song = this.song();
    const difficultyId = this.selectedDifficultyId();
    if (!song || !difficultyId) {
      this.leaderboardState.set({
        loading: false,
        error: null,
        entries: [],
        difficultyId: null,
        difficultyLabel: ''
      });
      return;
    }
    const selectedDifficulty = song.difficulties?.find((d: SongDifficulty) => d.id === difficultyId);
    const difficultyLabel = selectedDifficulty ? difficultyNumberToName(selectedDifficulty.difficulty) : 'Difficulty';
    this.leaderboardState.set({
      loading: true,
      error: null,
      entries: [],
      difficultyId,
      difficultyLabel
    });
    this.songService.getDifficultyLeaderboard(song.id, difficultyId, this.currentUser()?.id).subscribe({
      next: response => {
        if (response.success) {
          this.leaderboardState.set({
            loading: false,
            error: null,
            entries: response.entries,
            difficultyId,
            difficultyLabel
          });
        } else {
          this.leaderboardState.set({
            loading: false,
            error: response.error || 'Failed to load leaderboard',
            entries: [],
            difficultyId,
            difficultyLabel
          });
        }
      },
      error: err => {
        this.leaderboardState.set({
          loading: false,
          error: err.message || 'Failed to load leaderboard',
          entries: [],
          difficultyId,
          difficultyLabel
        });
      }
    });
  }

  private loadComments(songId: number): void {
    this.loadingComments.set(true);
    this.songService.getComments(songId, this.currentUser()?.id).subscribe({
      next: response => {
        if (response.success && response.comments) {
          this.comments.set(response.comments);
        } else {
          this.comments.set([]);
        }
        this.loadingComments.set(false);
      },
      error: () => {
        this.comments.set([]);
        this.loadingComments.set(false);
      }
    });
  }

  postComment(parentId?: number | null): void {
    const user = this.currentUser();
    const song = this.song();
    if (!user?.id || !song) {
      alert('You must be logged in to post comments');
      return;
    }
    const content = (this.commentDraft() || '').trim();
    if (!content) {
      alert('Please enter a comment');
      return;
    }
    const payload: any = { content };
    if (parentId != null) payload.parentCommentId = parentId;
    this.songService.postComment(song.id, payload).subscribe({
      next: response => {
        if (response.success && response.comment) {
          const newComment = response.comment;
          this.comments.update(list => [...list, newComment]);
          this.commentDraft.set('');
          this.replyingTo.set(null);
          this.achievementService.trackCommentPosted();
        } else {
          alert(`Failed to post comment: ${response.error}`);
        }
      },
      error: () => alert('Failed to post comment')
    });
  }

  openReply(commentId: number): void {
    this.replyingTo.set(commentId);
    const existing = this.comments().find(c => c.id === commentId);
    this.commentDraft.set(existing ? `@${existing.senderUsername || 'user'} ` : '');
  }

  cancelReply(): void {
    this.replyingTo.set(null);
    this.commentDraft.set('');
  }

  toggleLike(event?: MouseEvent): void {
    event?.stopPropagation();
    const user = this.currentUser();
    const song = this.song();
    if (!user?.id || !song) {
      alert('Please log in to like songs');
      return;
    }
    const update = (isLiked: boolean, delta: number) => {
      this.song.update(s => s ? { ...s, isLikedByUser: isLiked, likeCount: Number(s.likeCount ?? 0) + delta } : s);
    };
    if (song.isLikedByUser) {
      this.songService.unlikeSong(song.id).subscribe({
        next: () => update(false, -1),
        error: err => console.error(err)
      });
    } else {
      this.songService.likeSong(song.id).subscribe({
        next: () => update(true, 1),
        error: err => console.error(err)
      });
    }
  }

  toggleVisibility(): void {
    const user = this.currentUser();
    const song = this.song();
    if (!user?.id || !song) return;
    if (!isSongOwnedByViewer(song, user.id)) {
      alert('Only the owner can change song visibility.');
      return;
    }
    const nextVisibility = !isSongPublic(song);
    this.songService.updateSongVisibility(song.id, { isPublic: nextVisibility }).subscribe({
      next: response => {
        if (response.success && response.song) {
          this.song.set(normalizeSong(response.song));
          this.loadComments(response.song.id);
        } else {
          alert(`Failed to update visibility: ${response.error}`);
        }
      },
      error: err => alert(`Error updating visibility: ${err.message}`)
    });
  }

  launchGameplay(): void {
    const song = this.song();
    if (!song) {
      alert('Please select a song first.');
      return;
    }
    this.closePlayDropdown();
    this.stopAudio();
    const difficultyId = this.selectedDifficultyId();
    void this.router.navigate(['/gameplay', song.id], { state: { song, difficultyId } });
  }

  backToList(): void {
    this.stopAudio();
    void this.router.navigate(['/menu']);
  }

  private stopAudio(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.src = '';
    }
  }

  private async playSong(url: string): Promise<void> {
    try {
      this.stopAudio();
      this.audio.src = url;
      await new Promise<void>((resolve, reject) => {
        this.audio.onloadedmetadata = () => resolve();
        this.audio.onerror = () => reject(new Error('Audio load error'));
        this.audio.load();
      });
      await this.audio.play();
    } catch (error) {
      console.error('Playback failed:', error);
    }
  }

  openDifficultyPicker(): void {
    const song = this.song();
    if (!song) return;
    this.songService.getSongDifficulties(song.id, this.currentUser()?.id).subscribe({
      next: response => {
        if (response.success && response.difficulties) {
          this.difficultyPickerState.set({
            showPicker: true,
            difficulties: response.difficulties,
            selectedDifficultyId: this.selectedDifficultyId(),
            showUploadForm: false
          });
        }
      },
      error: () => alert('Failed to load difficulties')
    });
  }

  selectDifficulty(difficultyId: number): void {
    this.selectedDifficultyId.set(difficultyId);
    this.difficultyPickerState.update(state => ({
      ...state,
      selectedDifficultyId: difficultyId,
      showPicker: false
    }));
    this.loadLeaderboard();
  }

  closeDifficultyPicker(): void {
    this.difficultyPickerState.update(state => ({
      ...state,
      showPicker: false,
      showUploadForm: false
    }));
  }

  openUploadDifficultyForm(): void {
    this.difficultyPickerState.update(state => ({
      ...state,
      showUploadForm: true,
      uploadDifficulty: undefined,
      uploadChartFile: undefined
    }));
    this.uploadDifficultyChoice.set(null);
  }

  closeUploadDifficultyForm(): void {
    this.difficultyPickerState.update(state => ({
      ...state,
      showUploadForm: false,
      uploadDifficulty: undefined,
      uploadChartFile: undefined
    }));
    this.uploadDifficultyChoice.set(null);
  }

  onChartFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const file = input.files[0];
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        this.difficultyPickerState.update(state => ({ ...state, uploadChartFile: file }));
      } else {
        alert('Please select a valid JSON chart file');
        input.value = '';
      }
    }
  }

  uploadChartDifficulty(): void {
    const song = this.song();
    const choice = this.uploadDifficultyChoice();
    const state = this.difficultyPickerState();
    if (!song || !choice || !state.uploadChartFile || !this.currentUser()?.id) {
      alert('Please fill in all fields');
      return;
    }
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const content = event.target?.result as string;
        const chartData = JSON.parse(content);
        if (!Array.isArray(chartData.notes) || chartData.notes.length === 0) {
          alert('Chart must contain at least one note');
          return;
        }
        this.songService.addSongDifficulty(song.id, {
          difficulty: difficultyNameToNumber(choice),
          notes: chartData.notes
        }).subscribe({
          next: response => {
            if (response.success) {
              alert('Chart uploaded successfully!');
              this.closeUploadDifficultyForm();
              this.loadDifficulties(song.id);
            } else {
              alert(`Failed to upload chart: ${response.error}`);
            }
          },
          error: err => alert(`Error uploading chart: ${err.message}`)
        });
      } catch {
        alert('Invalid JSON file format');
      }
    };
    reader.readAsText(state.uploadChartFile);
  }

  isDifficultyAvailable(difficultyLevel: DifficultyLevel): boolean {
    const numLevel = difficultyNameToNumber(difficultyLevel);
    return !this.difficultyPickerState().difficulties.some(existing => existing.difficulty === numLevel);
  }

  getSelectedDifficultyLevel(): string {
    const id = this.selectedDifficultyId();
    if (!id) return '?';
    const found = this.difficultyPickerState().difficulties.find(d => d.id === id);
    return found ? difficultyNumberToName(found.difficulty) : '?';
  }

  getSelectedDifficultyEstimate(): string {
    const id = this.selectedDifficultyId();
    if (!id) return '—';
    const found = this.difficultyPickerState().difficulties.find(d => d.id === id);
    if (!found) return '—';
    const estimate = this.resolveDifficultyEstimate(found);
    return estimate.toFixed(2);
  }

  getDifficultyEstimate(diff: SongDifficulty): string {
    return this.resolveDifficultyEstimate(diff).toFixed(2);
  }

  private resolveDifficultyEstimate(diff: SongDifficulty): number {
    if (diff.difficultyEstimate > 1.00) {
      return diff.difficultyEstimate;
    }
    const song = this.song();
    if (!song) return 1.00;
    const durationParts = song.length.split(':').map(Number);
    const durationSeconds = (durationParts[0] || 0) * 60 + (durationParts[1] || 0);
    return calculateDifficultyEstimate({
      bpm: song.bpm,
      durationMs: durationSeconds * 1000,
      normalCount: diff.noteCount,
      holdCount: 0,
      bombCount: 0
    });
  }

  requestDeleteSong(): void {
    const song = this.song();
    if (!song) return;
    if (!this.canDeleteSong(song, this.currentUser()?.id)) {
      alert('Only the uploader or an admin can delete this song.');
      return;
    }
    this.showDeleteConfirm.set(true);
  }

  confirmDelete(): void {
    const song = this.song();
    if (!song) return;

    this.songService.deleteSong(song.id).subscribe({
      next: response => {
        if (response.success) {
          this.stopAudio();
          void this.router.navigate(['/menu']);
        } else {
          alert(`Failed to delete song: ${response.error}`);
        }
      },
      error: err => alert(`Error deleting song: ${err.message}`)
    });

    this.showDeleteConfirm.set(false);
  }

  cancelDelete(): void {
    this.showDeleteConfirm.set(false);
  }

  // ─── Song Editing ─────────────────────────────────────────

  openEditModal(): void {
    const song = this.song();
    if (!song || !this.canEditSong(song, this.currentUser()?.id)) {
      alert('Only the uploader can edit this song.');
      return;
    }
    this.editForm.set({
      name: song.name,
      author: song.author,
      bpm: song.bpm,
      genre: song.genre ?? null,
      isPublic: song.isPublic ?? true,
      audioFile: undefined,
      coverFile: undefined
    });
    this.editError.set(null);
    this.showEditModal.set(true);
  }

  closeEditModal(): void {
    this.showEditModal.set(false);
    this.editError.set(null);
  }

  updateEditName(value: string): void {
    this.editForm.update(form => ({ ...form, name: value }));
  }

  updateEditAuthor(value: string): void {
    this.editForm.update(form => ({ ...form, author: value }));
  }

  updateEditBpm(value: string): void {
    const parsed = value ? Number(value) : undefined;
    this.editForm.update(form => ({ ...form, bpm: parsed }));
  }

  updateEditGenre(value: string): void {
    this.editForm.update(form => ({ ...form, genre: value || null }));
  }

  updateEditVisibility(value: string): void {
    this.editForm.update(form => ({ ...form, isPublic: value === 'public' }));
  }

  onEditAudioSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.editForm.update(form => ({ ...form, audioFile: input.files![0] }));
    }
  }

  onEditCoverSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.editForm.update(form => ({ ...form, coverFile: input.files![0] }));
    }
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

  submitEdit(): void {
    const song = this.song();
    if (!song) return;

    const form = this.editForm();
    if (!form.name.trim() || !form.author.trim() || !form.bpm) {
      this.editError.set('Name, artist, and BPM are required.');
      return;
    }

    this.isSavingEdit.set(true);
    this.editError.set(null);

    const buildPayload = async (): Promise<UpdateSongRequest> => {
      const payload: UpdateSongRequest = {
        name: form.name.trim(),
        author: form.author.trim(),
        bpm: form.bpm,
        genre: form.genre,
        isPublic: form.isPublic
      };

      if (form.audioFile) {
        const [length, base64] = await Promise.all([
          this.getAudioDuration(form.audioFile),
          this.fileToBase64(form.audioFile)
        ]);
        payload.length = length;
        payload.audioBase64 = base64;
        payload.audioMimeType = form.audioFile.type;
      }

      if (form.coverFile) {
        payload.coverBase64 = await this.fileToBase64(form.coverFile);
        payload.coverMimeType = form.coverFile.type;
      }

      return payload;
    };

    buildPayload()
      .then(payload => {
        this.songService.updateSong(song.id, payload).subscribe({
          next: response => {
            this.isSavingEdit.set(false);
            if (response.success && response.song) {
              this.song.set(normalizeSong(response.song));
              this.closeEditModal();
            } else {
              this.editError.set(response.error || 'Failed to update song.');
            }
          },
          error: err => {
            this.isSavingEdit.set(false);
            this.editError.set(err.message || 'Failed to update song.');
          }
        });
      })
      .catch(err => {
        this.isSavingEdit.set(false);
        this.editError.set(typeof err === 'string' ? err : 'Failed to process files.');
      });
  }

  // ─── Chart Management ─────────────────────────────────────

  requestDeleteDifficulty(difficulty: SongDifficulty, event: MouseEvent): void {
    event.stopPropagation();
    const song = this.song();
    if (!song || !this.canEditSong(song, this.currentUser()?.id)) {
      alert('Only the uploader can delete charts.');
      return;
    }
    this.difficultyToDelete.set(difficulty);
    this.showDeleteDifficultyConfirm.set(true);
  }

  confirmDeleteDifficulty(): void {
    const song = this.song();
    const difficulty = this.difficultyToDelete();
    if (!song || !difficulty) return;

    this.songService.deleteDifficulty(song.id, difficulty.id).subscribe({
      next: response => {
        if (response.success) {
          this.difficultyPickerState.update(state => ({
            ...state,
            difficulties: state.difficulties.filter(d => d.id !== difficulty.id)
          }));
          if (this.selectedDifficultyId() === difficulty.id) {
            const first = this.difficultyPickerState().difficulties[0] ?? null;
            this.selectedDifficultyId.set(first?.id ?? null);
            this.loadLeaderboard();
          }
          this.closeDeleteDifficultyConfirm();
        } else {
          alert(`Failed to delete chart: ${response.error}`);
        }
      },
      error: err => alert(`Error deleting chart: ${err.message}`)
    });
  }

  closeDeleteDifficultyConfirm(): void {
    this.showDeleteDifficultyConfirm.set(false);
    this.difficultyToDelete.set(null);
  }

  editChartInMaker(difficulty: SongDifficulty, event: MouseEvent): void {
    event.stopPropagation();
    const song = this.song();
    if (!song || !this.canEditSong(song, this.currentUser()?.id)) {
      alert('Only the uploader can edit charts.');
      return;
    }
    this.stopAudio();
    void this.router.navigate(['/chart-maker'], {
      queryParams: { songId: song.id, difficultyId: difficulty.id }
    });
  }
}
