import { Component, OnInit, OnDestroy, signal } from '@angular/core';
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
  difficultyNumberToName,
  difficultyNameToNumber
} from '../../../app/services/song.service';
import { AchievementService } from '../../../app/services/achievement.service';
import { Song, Comment, normalizeSong, isSongPublic, isSongOwnedByViewer } from '../menu-helpers';

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

  showDeleteConfirm = signal<boolean>(false);

  private audio = new Audio();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private songService: SongService,
    private achievementService: AchievementService
  ) {
    this.currentUser.set(this.authService.currentUser);
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

    this.songService.getSongById(songId).subscribe({
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
    this.songService.getSongDifficulties(songId).subscribe({
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
    this.songService.getDifficultyLeaderboard(song.id, difficultyId).subscribe({
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
    this.songService.getComments(songId).subscribe({
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
    this.songService.getSongDifficulties(song.id).subscribe({
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

  requestDeleteSong(): void {
    const song = this.song();
    if (!song) return;
    if (!isSongOwnedByViewer(song, this.currentUser()?.id)) {
      alert('Only the uploader can delete this song.');
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
}
