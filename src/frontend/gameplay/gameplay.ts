import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NoteType, Song, SongDifficulty, SongService, difficultyNumberToName } from '../../app/services/song.service';
import { AuthService } from '../../app/services/auth.service';
import { GameSettingsService, PARTICLE_INTENSITY_OPTIONS, formatBindingLabel, formatBindingList, normalizeBindingKey } from '../../app/services/game-settings.service';
import { FriendshipService, FriendshipResult } from '../../app/services/friendship.service';
import { MessageService } from '../../app/services/message.service';
import { AchievementService } from '../../app/services/achievement.service';
import { MultiplayerService, MatchState, MatchResult, MatchPlayerResult, LaneActivity } from '../../app/services/multiplayer.service';
import { OpponentOverlayComponent } from './opponent-overlay/opponent-overlay';
import { calculateDifficultyEstimate, formatDifficultyEstimate } from '../utils/difficulty-calculator';
interface HitFeedback {
  lane: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  vy: number;
}

interface ChartNote {
  time: number;
  lane: number;
  type: NoteType;
  durationMs?: number | null;
  judged?: boolean;
  missed?: boolean; // Track if note was missed vs just judged
}

interface ActiveHold {
  note: ChartNote;
  lane: number;
  pressPoints: number;
  pressGrade: 'perfect' | 'good' | 'glimmer' | 'miss';
  nextTickTime: number;
  tickCount: number;
  ticksAwarded: number;
  released: boolean;
  missed: boolean;
}

interface ChartMetadata {
  title?: string;
  artist?: string;
  bpm?: number;
  duration_ms?: number;
  description?: string;
}

interface GameStats {
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  good: number;
  glimmer: number;
  miss: number;
  accuracy: number;
}

interface ShatterShard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  points: number[]; // relative polygon points [x1,y1, x2,y2, ...]
}

export function getRankRingSegments(
  perfect: number,
  good: number,
  glimmer: number,
  miss: number
): { label: string; value: number; color: string }[] {
  const total = perfect + good + glimmer + miss;
  if (total === 0) {
    return [{ label: 'pending', value: 100, color: 'rgba(255, 255, 255, 0.1)' }];
  }
  return [
    { label: 'Radiant', value: (perfect / total) * 100, color: '#ffd700' },
    { label: 'Shinning', value: (good / total) * 100, color: '#78dcff' },
    { label: 'Glimmer', value: (glimmer / total) * 100, color: '#d2c7ff' },
    { label: 'Shattered', value: (miss / total) * 100, color: '#ff9ea8' }
  ];
}

@Component({
  selector: 'app-gameplay',
  standalone: true,
  imports: [CommonModule, OpponentOverlayComponent],
  templateUrl: './gameplay.html',
  styleUrls: ['./gameplay.scss']
})
export class Gameplay implements AfterViewInit, OnDestroy {
  // Theme-aware color helpers
  private getCssVar(name: string): string {
    if (typeof window === 'undefined') return '';
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '';
  }
  private get accentColor(): string {
    return this.getCssVar('--color-accent') || '#ffd700';
  }
  private get accentColorRgb(): string {
    return this.getCssVar('--color-accent-rgb') || '255, 215, 0';
  }
  private get mainColor(): string {
    return this.getCssVar('--color-main') || '#050505';
  }
  private get textPrimaryRgb(): string {
    return this.getCssVar('--color-text-primary-rgb') || '255, 255, 255';
  }

  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('scoreCard') scoreCardRef!: ElementRef<HTMLDivElement>;
  @ViewChild('comboCard') comboCardRef!: ElementRef<HTMLDivElement>;

  private readonly gameSettingsService = inject(GameSettingsService);
  protected readonly multiplayerService = inject(MultiplayerService);
  private readonly defaultSongUrl = '/assets/music/SpearOfJustice.mp3';
  private readonly laneColors = ['#ff6b6b', '#4ecdc4', '#4d96ff', '#ff9f43'];
  private readonly laneCount = 4;

  private shatterShards: ShatterShard[] = [];
  private hitFeedbacks: HitFeedback[] = [];
  private readonly shardGravity = 0.15;
  private readonly hitSoundAudio = new Audio();
  private readonly missSoundAudio = new Audio();
  private activeHolds: ActiveHold[] = [];
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  protected readonly currentSongTimeMs = signal(0);
  protected readonly totalSongDurationMs = signal(0);
  protected readonly songProgressPercent = computed(() => {
    const total = this.totalSongDurationMs();
    if (total <= 0) return 0;
    const percent = (this.currentSongTimeMs() / total) * 100;
    return Math.min(percent, 100);
  });
  private animationFrameId: number | null = null;
  // Playtime tracking
  private playtimeIntervalId: number | null = null;
  private playtimePendingSeconds = 0;
  private readonly playtimeSendInterval = 10; // send to server every 10 seconds
  private readonly onResize = () => this.handleResize();
  private readonly onAudioEnded = () => this.finishGame();
  private activeFlashes: Map<number, number> = new Map();
  private redFlashAlpha = 0;
  private lastFrameTime = 0;
  private currentFps = 0;
  private readonly difficultyIdFromState: number | null = (() => {
    const value = Number(window.history.state?.difficultyId);
    return Number.isFinite(value) && value > 0 ? value : null;
  })();
  private resolvedDifficultyId: number | null = this.difficultyIdFromState;
  private virtualAudioStartMs: number | null = null;
  private playCountReported = false;
  private challengeFromUserId: number | null = null;
  readonly challengeSent = signal(false);
  readonly isChallengeMode = signal(false);
  readonly isChartTest = signal(false);

  readonly isMultiplayerMode = signal(false);
  readonly multiplayerCountdown = signal<number | null>(null);
  readonly multiplayerMatchStarted = signal(false);
  readonly opponentState = signal<MatchState | null>(null);
  readonly matchResult = signal<MatchResult | null>(null);
  readonly waitingForOpponent = signal(false);
  private multiplayerRoomId: string | null = null;
  private multiplayerStartTimeMs = 0;
  private lastStateEmitMs = 0;

  // Context needed to return from a chart playtest back to the chart maker
  private returnSelectedSongId: number | null = null;
  private returnAudioFileName = '';
  private returnEditingDifficultyId: number | null = null;
  private returnEditingDifficulty: SongDifficulty | null = null;
  private lastJudgment: string | null = null;
  private lastLaneActivity: LaneActivity | null = null;

  private chartNotes: ChartNote[] = [];
  notes: ChartNote[] = [];
  readonly chartMetadata = signal<ChartMetadata>({});
  readonly currentSong = signal<Song | null>(null);
  audio = new Audio();

  readonly isLoading = signal(true);
  readonly loadingError = signal<string | null>(null);
  readonly gameStarted = signal(false);
  readonly gameRunning = signal(false);
  readonly gameFinished = signal(false);

  readonly resolvedDifficulty = signal<SongDifficulty | null>(null);

  // Send score modal state
  readonly showSendScoreModal = signal(false);
  readonly friendsList = signal<FriendshipResult[]>([]);
  readonly selectedFriendIds = signal<Set<number>>(new Set());
  readonly sendingScore = signal(false);
  readonly sendScoreError = signal<string | null>(null);
  readonly sendScoreSuccess = signal(false);
  readonly loadingFriends = signal(false);

  readonly stats = signal<GameStats>(this.createInitialStats());
  private previousScore = 0;
  private previousCombo = 0;
  readonly spEarned = signal<number | null>(null);
  readonly totalSp = signal<number | null>(null);
  readonly highscoreImproved = signal<boolean | null>(null);
  private readonly maxSongScore = 1_000_000;
  private scoreUnits = 0;
  private scorePenalty = 0;

  readonly displayTitleText = computed(() => this.currentSong()?.name || this.chartMetadata().title || 'Prototype Chart');
  readonly displayArtistText = computed(() => this.currentSong()?.author || this.chartMetadata().artist || 'Hit the Lights');
  readonly displayBpmText = computed(() => `${this.currentSong()?.bpm ?? this.chartMetadata().bpm ?? 120} BPM`);
  readonly statusMessageText = computed(() => {
    if (this.gameFinished()) {
      return 'Song complete';
    }
    if (this.gameStarted()) {
      return 'Keep the rhythm going';
    }
    if (this.isMultiplayerMode()) {
      return `Press ${formatBindingList(this.gameSettingsService.laneBindings().map(binding => formatBindingLabel(binding)))} to ready up`;
    }
    return `Press ${formatBindingList(this.gameSettingsService.laneBindings().map(binding => formatBindingLabel(binding)))} to start`;
  });
  readonly accuracyLabelText = computed(() => `${this.stats().accuracy.toFixed(1)}%`);
  readonly totalJudgedCount = computed(() => {
    const currentStats = this.stats();
    return currentStats.perfect + currentStats.good + currentStats.glimmer + currentStats.miss;
  });
  readonly radiantRateText = computed(() => {
    const total = this.totalJudgedCount();
    if (total === 0) {
      return '0.0%';
    }

    return `${((this.stats().perfect / total) * 100).toFixed(1)}%`;
  });
  readonly shinningRateText = computed(() => {
    const total = this.totalJudgedCount();
    if (total === 0) {
      return '0.0%';
    }

    return `${((this.stats().good / total) * 100).toFixed(1)}%`;
  });
  readonly glimmerRateText = computed(() => {
    const total = this.totalJudgedCount();
    if (total === 0) {
      return '0.0%';
    }

    return `${((this.stats().glimmer / total) * 100).toFixed(1)}%`;
  });
  readonly resultRank = computed(() => {
    const accuracy = this.stats().accuracy;
    if (accuracy >= 99) {
      return 'S+';
    }
    if (accuracy >= 96) {
      return 'S';
    }
    if (accuracy >= 92) {
      return 'A';
    }
    if (accuracy >= 85) {
      return 'B';
    }
    if (accuracy >= 75) {
      return 'C';
    }
    return 'D';
  });
  readonly rankRingSegments = computed(() => {
    const s = this.stats();
    return getRankRingSegments(s.perfect, s.good, s.glimmer, s.miss);
  });
  readonly rankRingGradient = computed(() => {
    const segments = this.rankRingSegments();
    let current = 0;
    const stops = segments
      .filter(s => s.value > 0)
      .map(s => {
        const start = current;
        current += s.value;
        return `${s.color} ${start.toFixed(2)}% ${current.toFixed(2)}%`;
      });
    return `conic-gradient(${stops.join(', ')})`;
  });
  readonly mapperText = computed(() => {
    return this.currentSong()?.ownerUsername || this.currentSong()?.author || this.chartMetadata().artist || 'Hit the Lights';
  });
  readonly totalNotesCount = computed(() => this.chartNotes.length);
  readonly userInitial = computed(() => {
    return this.authService.currentUser?.username?.charAt(0).toUpperCase() ?? 'G';
  });

  getOpponentInitial(result: MatchPlayerResult | null): string {
    return result?.username?.charAt(0).toUpperCase() ?? '?';
  }
  readonly difficultyEstimate = computed(() => {
    const stored = this.resolvedDifficulty()?.difficultyEstimate;
    if (stored !== undefined && stored !== null && stored > 1.00) {
      return stored;
    }
    const bpm = this.currentSong()?.bpm ?? this.chartMetadata().bpm ?? 120;
    const durationMs = this.totalSongDurationMs();
    const normalCount = this.chartNotes.filter(n => n.type === NoteType.Normal).length;
    const holdCount = this.chartNotes.filter(n => n.type === NoteType.Hold).length;
    const bombCount = this.chartNotes.filter(n => n.type === NoteType.Bomb).length;
    return calculateDifficultyEstimate({ bpm, durationMs, normalCount, holdCount, bombCount });
  });
  readonly formattedDifficultyEstimate = computed(() => formatDifficultyEstimate(this.difficultyEstimate()));
  readonly resultFlavorText = computed(() => {
    const accuracy = this.stats().accuracy;
    if (accuracy >= 96) {
      return 'Brilliant run. You lit up every lane.';
    }
    if (accuracy >= 88) {
      return 'Strong performance. Keep pushing your streak.';
    }
    if (accuracy >= 75) {
      return 'Good momentum. Refine your timing for higher ranks.';
    }
    return 'Solid attempt. Stay in rhythm and try again.';
  });
  readonly difficultyName = computed(() => {
    return difficultyNumberToName(Math.round(this.difficultyEstimate()));
  });
  readonly spEarnedText = computed(() => {
    const earned = this.spEarned();
    if (earned === null) {
      return null;
    }
    if (earned === 0) {
      return 'No SP earned';
    }
    return `+${this.formatSpDecimal(earned)} SP`;
  });
  readonly totalSpText = computed(() => {
    const total = this.totalSp();
    return total !== null ? `${this.formatSpDecimal(total)} SP` : null;
  });

  readonly currentPlayerMatchResult = computed<MatchPlayerResult | null>(() => {
    const result = this.matchResult();
    const userId = this.authService.currentUser?.id;
    if (!result || !userId) return null;
    return result.results.find(r => r.userId === userId) ?? null;
  });

  readonly opponentMatchResult = computed<MatchPlayerResult | null>(() => {
    const result = this.matchResult();
    const userId = this.authService.currentUser?.id;
    if (!result) return null;
    return result.results.find(r => r.userId !== userId) ?? null;
  });

  readonly opponentUsername = computed(() => {
    return this.opponentMatchResult()?.username ?? 'Opponent';
  });

  // FIX: Added key state tracking to prevent held-key spamming
  private keyStates: boolean[] = [false, false, false, false];

  // readonly canvasWidth = 1280;
  // readonly canvasHeight = 800;
  private get noteSize(): number {
    if (!this.canvas) {
      return 96;
    }
    const geometry = this.getLaneGeometry(this.canvas.width);
    return Math.max(48, Math.min(96, geometry.laneWidth * 0.78));
  }

  private get hitAreaRadius(): number {
    return this.noteSize / 2;
  }
  readonly hitWindow = 130;
  readonly okayWindow = 80;
  readonly perfectWindow = 40;
  readonly shinningWindow = 60;
  readonly earlyBuffer = 300; // ms before note where presses are ignored (adjusted for note/hitzone size)

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private songService: SongService,
    public authService: AuthService,
    private friendshipService: FriendshipService,
    private messageService: MessageService,
    private achievementService: AchievementService
  ) {
    effect(() => {
      const currentStats = this.stats();
      if (currentStats.score > this.previousScore) {
        this.triggerScoreFlash('up');
      } else if (currentStats.score < this.previousScore) {
        this.triggerScoreFlash('down');
      }
      if (currentStats.combo === 0 && this.previousCombo > 0) {
        this.triggerComboFlash();
      }
      this.previousScore = currentStats.score;
      this.previousCombo = currentStats.combo;
    });
  }

  async ngAfterViewInit(): Promise<void> {
    this.setupCanvas();
    this.audio.preload = 'auto';
    this.audio.addEventListener('ended', this.onAudioEnded);
    window.addEventListener('resize', this.onResize);

    try {
      await this.initializeGame();
    } catch (error) {
      console.error('Failed to initialize gameplay:', error);
      this.loadingError.set(error instanceof Error ? error.message : 'Failed to start the rhythm game.');
      await this.loadFallbackAudio();
      this.useFallbackChart();
    } finally {
      this.isLoading.set(false);
      this.render(this.getAudioTimeMs());
    }
  }

  ngOnDestroy(): void {
    // stop tracking and flush remaining seconds
    this.stopPlaytimeTracking();
    this.teardown();
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeyDown(event: KeyboardEvent): void {
    if (this.isLoading() || this.gameFinished()) {
      return;
    }

    const lane = this.keyToLane(event.key);
    if (lane === null) {
      return;
    }

    event.preventDefault();

    // FIX: Prevent held keys from registering multiple times
    if (this.keyStates[lane]) {
      return;
    }
    this.keyStates[lane] = true;

    if (!this.gameStarted()) {
      if (this.isMultiplayerMode()) {
        this.multiplayerService.markReady();
        return;
      }
      this.startGame();
      return;
    }

    this.handleKeyPress(lane);
  }

  // FIX: Added keyup handler to reset key states
  @HostListener('window:keyup', ['$event'])
  onWindowKeyUp(event: KeyboardEvent): void {
    const lane = this.keyToLane(event.key);
    if (lane !== null) {
      this.keyStates[lane] = false;
      if (this.gameRunning()) {
        this.finalizeHoldRelease(lane, this.getAudioTimeMs());
      }
    }
  }

  focusCanvas(): void {
    this.canvasRef?.nativeElement.focus();
  }

  async restartSong(): Promise<void> {
    this.resetGameState();
    this.render(0);
  }

  returnToMenu(): void {
    this.teardown();
    void this.router.navigate(['/menu']);
  }

  returnToCharting(): void {
    const metadata = {
      title: this.chartMetadata().title || 'Untitled',
      artist: this.chartMetadata().artist || 'Unknown',
      bpm: this.chartMetadata().bpm ?? this.currentSong()?.bpm ?? 120,
      duration_ms: this.chartMetadata().duration_ms || this.totalSongDurationMs() || 0
    };

    const notes = this.chartNotes.map(note => ({
      time: note.time,
      lane: note.lane,
      type: note.type,
      durationMs: note.durationMs ?? null
    }));

    this.teardown();
    void this.router.navigate(['/chart-maker'], {
      state: {
        returnToCharting: true,
        chart: { metadata, notes },
        song: this.currentSong(),
        selectedSongId: this.returnSelectedSongId,
        audioFileName: this.returnAudioFileName,
        editingDifficultyId: this.returnEditingDifficultyId,
        editingDifficulty: this.returnEditingDifficulty
      }
    });
  }

  private async initializeGame(): Promise<void> {
    const state = window.history.state;
    const testChart = state?.chartTest as boolean | undefined;
    const testChartData = state?.chart as { metadata: ChartMetadata; notes: { time: number; lane: number; type?: NoteType | number; durationMs?: number | null }[] } | undefined;
    const stateSong = state?.song as Song | undefined;
    this.challengeFromUserId = state?.challengeFrom ?? null;
    this.isChallengeMode.set(this.challengeFromUserId !== null);

    const roomIdFromState = state?.roomId ?? null;
    if (roomIdFromState) {
      this.isMultiplayerMode.set(true);
      this.isChallengeMode.set(false);
      this.multiplayerRoomId = roomIdFromState;
      this.waitingForOpponent.set(true);
      this.multiplayerService.joinRoom(roomIdFromState);
      this.subscribeToMultiplayerEvents();
    }

    if (testChart && testChartData && testChartData.notes) {
      this.isChartTest.set(true);
      this.returnSelectedSongId = state?.selectedSongId ?? null;
      this.returnAudioFileName = state?.audioFileName ?? '';
      this.returnEditingDifficultyId = state?.editingDifficultyId ?? null;
      this.returnEditingDifficulty = state?.editingDifficulty ?? null;

      this.currentSong.set(stateSong ?? null);
      this.chartMetadata.set(testChartData.metadata ?? {});
      this.chartNotes = testChartData.notes
        .map(note => ({ ...note, type: this.normalizeNoteType(note.type), judged: false, missed: false }))
        .sort((a, b) => a.time - b.time);
      this.notes = this.cloneNotes(this.chartNotes);
      this.resolvedDifficulty.set({ id: 0, difficulty: 1, noteCount: this.chartNotes.length, difficultyEstimate: this.difficultyEstimate() });
      this.resolvedDifficultyId = 0;
      await this.configureAudio(stateSong?.songUrl ?? this.defaultSongUrl);
      return;
    }

    const song = await this.resolveSong();
    this.currentSong.set(song);
    const diff = this.resolveDifficulty(song);
    this.resolvedDifficultyId = diff?.id ?? null;
    this.resolvedDifficulty.set(diff);
    await Promise.all([this.loadChart(song, this.resolvedDifficultyId), this.configureAudio(song?.songUrl ?? this.defaultSongUrl)]);
  }

  private subscribeToMultiplayerEvents(): void {
    this.multiplayerService.roomJoined.subscribe(({ roomId, opponentId }) => {
      this.multiplayerRoomId = roomId;
      this.waitingForOpponent.set(false);
    });

    this.multiplayerService.countdown.subscribe(value => {
      this.multiplayerCountdown.set(value);
    });

    this.multiplayerService.matchStart.subscribe(({ serverTimeMs }) => {
      this.multiplayerCountdown.set(null);
      this.multiplayerMatchStarted.set(true);
      this.multiplayerStartTimeMs = serverTimeMs;
      this.startGame();
    });

    this.multiplayerService.opponentState.subscribe(state => {
      this.opponentState.set(state);
    });

    this.multiplayerService.matchResult.subscribe(result => {
      this.matchResult.set(result);
      this.waitingForOpponent.set(false);
      this.finishGameShowResults();
    });

    this.multiplayerService.roomError.subscribe(message => {
      console.error('Multiplayer error:', message);
      this.loadingError.set(message);
      this.isMultiplayerMode.set(false);
      this.multiplayerService.disconnect();
    });
  }

  private resolveDifficulty(song: Song | null): SongDifficulty | null {
    if (this.difficultyIdFromState) {
      return song?.difficulties?.find(d => d.id === this.difficultyIdFromState) ?? null;
    }
    return song?.difficulties?.[0] ?? null;
  }

  private async resolveSong(): Promise<Song | null> {
    const stateSong = window.history.state?.song as Song | undefined;
    const songIdParam = this.route.snapshot.paramMap.get('songId');
    const viewerId = this.authService.currentUser?.id ?? undefined;

    if (songIdParam) {
      const songId = Number(songIdParam);
      if (!Number.isNaN(songId)) {
        try {
          const response = await firstValueFrom(this.songService.getSongById(songId, viewerId));
          if (response.success && response.song) {
            return response.song;
          }
        } catch (error) {
          console.warn('Could not load song by id, falling back to navigation state.', error);
        }
      }
    }

    if (stateSong?.songUrl) {
      return stateSong;
    }

    return null;
  }

  private async loadChart(song: Song | null, difficultyId: number | null): Promise<void> {
    try {
      if (!song || !difficultyId) {
        console.warn('No difficulty selected; using fallback chart.');
        this.useFallbackChart();
        return;
      }

      const viewerId = this.authService.currentUser?.id ?? undefined;
      const response = await firstValueFrom(this.songService.getDifficultyChart(song.id, difficultyId, viewerId));

      if (!response.success || !response.chart?.notes?.length) {
        console.warn('Difficulty chart is invalid or empty; using fallback chart.');
        this.useFallbackChart();
        return;
      }

      this.chartMetadata.set(response.chart.metadata ?? {});
      this.chartNotes = response.chart.notes
        .map(note => ({ ...note, type: this.normalizeNoteType(note.type), judged: false, missed: false }))
        .sort((a, b) => a.time - b.time);
      this.notes = this.cloneNotes(this.chartNotes);
    } catch (error) {
      console.warn('Failed to load difficulty chart; using fallback chart.', error);
      this.useFallbackChart();
    }
  }

  private useFallbackChart(): void {
    this.chartMetadata.set({
      title: 'Fallback Prototype',
      artist: 'Hit the Lights',
      bpm: 120
    });
    this.resolvedDifficulty.set({ id: 0, difficulty: 1, noteCount: 24, difficultyEstimate: this.difficultyEstimate() });
    this.chartNotes = this.buildFallbackChart();
    this.notes = this.cloneNotes(this.chartNotes);
  }

  private buildFallbackChart(): ChartNote[] {
    const notes: ChartNote[] = [];
    for (let index = 0; index < 24; index++) {
      notes.push({
        time: 1500 + index * 375,
        lane: index % this.laneCount,
        type: NoteType.Normal,
        judged: false,
        missed: false
      });
    }
    return notes;
  }

  private async configureAudio(songUrl: string): Promise<void> {
    try {
      await this.loadAudioSource(songUrl || this.defaultSongUrl);
    } catch (error) {
      console.warn('Could not load the selected song, falling back to a bundled MP3.', error);
      await this.loadFallbackAudio();
    }
  }

  private async loadFallbackAudio(): Promise<void> {
    await this.loadAudioSource(this.defaultSongUrl);
  }

  private loadAudioSource(sourceUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.src = sourceUrl;

      this.audio.onloadedmetadata = () => resolve();
      this.audio.onerror = () => reject(new Error(`Unable to load audio: ${sourceUrl}`));
      this.audio.load();
    });
  }

  private setupCanvas(): void {
    this.canvas = this.canvasRef.nativeElement;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.resizeCanvasToDisplaySize();
    this.focusCanvas();
  }

  private handleResize(): void {
    if (!this.canvas || !this.ctx) {
      return;
    }

    this.resizeCanvasToDisplaySize();

    this.render(this.getAudioTimeMs());
  }

  private keyToLane(key: string): number | null {
    const normalizedKey = normalizeBindingKey(key);
    if (!normalizedKey) {
      return null;
    }

    const bindings = this.gameSettingsService.laneBindings();
    const lane = bindings.findIndex(binding => normalizeBindingKey(binding) === normalizedKey);
    return lane >= 0 ? lane : null;
  }

  private startGame(): void {
    if (this.gameRunning()) {
      return;
    }

    this.gameStarted.set(true);
    this.gameRunning.set(true);
    this.gameFinished.set(false);
    this.loadingError.set(null);
    this.audio.currentTime = 0;
    this.audio.volume = this.gameSettingsService.masterVolume();
    this.virtualAudioStartMs = null;

    if (this.gameSettingsService.fullscreen()) {
      this.requestGameplayFullscreen();
    }

    // Report play count once per session for real songs
    const song = this.currentSong();
    if (song?.id && !this.playCountReported) {
      this.playCountReported = true;
      this.songService.incrementPlayCount(song.id).subscribe({
        error: err => console.warn('Failed to increment play count:', err)
      });
    }

    this.audio.play().catch(error => {
      console.warn('Audio playback failed, continuing without sound:', error);
      this.virtualAudioStartMs = performance.now();
      this.gameLoop();
    });

    this.totalSongDurationMs.set(this.audio.duration ? this.audio.duration * 1000 : 0);

    this.gameLoop();
    this.startPlaytimeTracking();
  }

  private requestGameplayFullscreen(): void {
    if (typeof document === 'undefined') return;
    const element = document.documentElement;
    if (!document.fullscreenElement && element.requestFullscreen) {
      element.requestFullscreen().catch(() => {});
    }
  }

  private gameLoop = (): void => {
    if (!this.gameRunning()) {
      return;
    }

    const audioTime = this.getAudioTimeMs();

    this.currentSongTimeMs.set(audioTime);
    this.totalSongDurationMs.set(this.audio.duration ? this.audio.duration * 1000 : 0);

    // Check for notes that have passed the hit zone without being judged
    this.updateMissedNotes(audioTime);

    // Update active holds (ticks, early releases, auto-completion)
    this.updateActiveHolds(audioTime);

    // If all notes are judged and we've passed the last note, finish the game
    // (this handles the no-audio fallback mode)
    if (this.allNotesJudged() && this.chartNotes.length > 0) {
      const lastNote = this.chartNotes[this.chartNotes.length - 1];
      if (audioTime > lastNote.time + this.hitWindow + 500) {
        this.finishGame();
        return;
      }
    }

    this.render(audioTime);

    if (this.isMultiplayerMode() && this.gameRunning()) {
      const now = performance.now();
      if (now - this.lastStateEmitMs > 250) {
        this.lastStateEmitMs = now;
        const stats = this.stats();
        this.multiplayerService.emitState({
          score: stats.score,
          combo: stats.combo,
          accuracy: stats.accuracy,
          lastJudgment: this.lastJudgment,
          laneActivity: this.lastLaneActivity ?? undefined
        });
        this.lastLaneActivity = null;
      }
    }

    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  };

  private getAudioTimeMs(): number {
    if (this.virtualAudioStartMs !== null) {
      return performance.now() - this.virtualAudioStartMs;
    }
    return this.audio.currentTime * 1000;
  }

  private updateMissedNotes(audioTime: number): void {
    for (const note of this.notes) {
      if (note.judged) {
        continue;
      }

      const timeSinceNote = audioTime - note.time;

      // Bombs that pass by unhit are simply ignored.
      if (timeSinceNote > this.hitWindow) {
        note.judged = true;
        if (note.type === NoteType.Bomb || note.type === NoteType.Hold) {
          continue;
        }
        note.missed = true;
        this.stats.update(stats => ({
          ...stats,
          miss: stats.miss + 1,
          combo: 0
        }));
        this.updateAccuracy();
        this.spawnHitFeedback(note.lane, 'Shattered', '#ff9ea8');
        this.playMissSound();
        this.lastJudgment = 'Shattered';
        this.lastLaneActivity = { lane: note.lane as 0 | 1 | 2 | 3, judgment: 'shattered' };
      }
    }
  }


  /**
   * Hit detection now uses forgiving timing windows:
   * - presses too far in advance (before earlyBuffer) are ignored like ghost hits
   * - presses within the hit window are graded as Radiant, Shinning, or Glimmer
   * - presses outside the hit window are misses
   * - ghost hits (pressing when no notes are in that lane) are ignored
   */
  private handleKeyPress(lane: number): void {
    if (!this.gameRunning()) {
      return;
    }

    const audioTime = this.getAudioTimeMs();

    const nextNote = this.findNextUnjudgedNoteInLane(lane);
    // Ghost hit: no notes in this lane, so ignore the press entirely
    if (!nextNote) {
      return;
    }

    const timeSinceNote = audioTime - nextNote.time;
    const timingDelta = Math.abs(timeSinceNote);

    // Presses way too early are treated like ghost hits - just ignore them
    if (timeSinceNote < -this.earlyBuffer) {
      return;
    }

    // Presses outside the circular hit-zone alignment window are ignored here
    // (late notes will still be auto-missed once they pass the hit window)
    if (timingDelta > this.okayWindow) {
      nextNote.judged = true;
      if (nextNote.type === NoteType.Bomb) {
        // Bombs that are avoided are simply ignored.
        return;
      }
      if (nextNote.type === NoteType.Hold) {
        this.finalizeHoldAsMiss(nextNote);
        return;
      }
      nextNote.missed = true;
      this.stats.update(stats => ({
        ...stats,
        miss: stats.miss + 1,
        combo: 0
      }));
      this.updateAccuracy();
      this.spawnHitFeedback(lane, 'Shattered', '#ff9ea8');
      this.playMissSound();
      this.lastJudgment = 'Shattered';
      this.lastLaneActivity = { lane: lane as 0 | 1 | 2 | 3, judgment: 'shattered' };
      return;
    }

    if (nextNote.type === NoteType.Bomb) {
      nextNote.judged = true;
      this.applyBombPenalty();
      this.stats.update(stats => ({ ...stats, combo: 0 }));
      this.updateScaledScore();
      this.spawnHitFeedback(lane, 'BOMB!', '#ff4757');
      this.spawnBombDebris(lane);
      this.triggerRedFlash();
      this.playMissSound();
      this.lastJudgment = 'Shattered';
      this.lastLaneActivity = { lane: lane as 0 | 1 | 2 | 3, judgment: 'shattered' };
      return;
    }

    if (nextNote.type === NoteType.Hold) {
      this.startHold(nextNote, lane, timingDelta, timeSinceNote);
      return;
    }

    nextNote.judged = true;
    nextNote.missed = false;

    this.triggerBulbFlash(lane);

    const geometry = this.getLaneGeometry(this.canvas.width);
    const hitZoneY = this.getHitZoneY(this.canvas.height);
    const laneCenterX = this.getLaneCenterX(lane, geometry);
    const color = this.laneColors[lane];
    this.spawnShatter(laneCenterX, hitZoneY, color);

    // Determine judgment based on windows and award integer points so
    // 'perfect' always yields full credit (3), 'good' yields 2, 'glimmer' yields 1.
    let points: number;
    let feedbackText: string;
    let feedbackColour: string;
    if (timingDelta <= this.perfectWindow) {
      this.stats.update(stats => ({ ...stats, perfect: stats.perfect + 1 }));
      points = 3;
      feedbackText = 'Radiant';
      feedbackColour = this.accentColor;
    } else if (timingDelta <= this.shinningWindow) {
      this.stats.update(stats => ({ ...stats, good: stats.good + 1 }));
      points = 2;
      feedbackText = 'Shinning';
      feedbackColour = '#78dcff';
    } else {
      this.stats.update(stats => ({ ...stats, glimmer: stats.glimmer + 1 }));
      points = 1;
      feedbackText = 'Glimmer';
      feedbackColour = '#d2c7ff';
    }

    this.spawnHitFeedback(lane, feedbackText, feedbackColour);
    this.playHitSound();
    this.lastJudgment = feedbackText;
    this.lastLaneActivity = { lane: lane as 0 | 1 | 2 | 3, judgment: this.judgmentTextToLaneJudgment(feedbackText) };

    this.scoreUnits += points;

    this.updateScaledScore();

    this.stats.update(stats => {
      const combo = stats.combo + 1;
      return {
        ...stats,
        combo,
        maxCombo: Math.max(stats.maxCombo, combo)
      };
    });
    this.updateAccuracy();
  }

  private startHold(note: ChartNote, lane: number, timingDelta: number, timeSinceNote: number): void {
    note.judged = true;
    note.missed = false;

    const pressResult = this.judgeTiming(timingDelta);
    const endTime = note.time + (note.durationMs ?? 500);

    this.activeHolds.push({
      note,
      lane,
      pressPoints: pressResult.points,
      pressGrade: pressResult.grade,
      nextTickTime: note.time,
      tickCount: 0,
      ticksAwarded: 0,
      released: false,
      missed: false
    });

    this.triggerBulbFlash(lane);

    const geometry = this.getLaneGeometry(this.canvas.width);
    const hitZoneY = this.getHitZoneY(this.canvas.height);
    const laneCenterX = this.getLaneCenterX(lane, geometry);
    const color = this.laneColors[lane];
    this.spawnShatter(laneCenterX, hitZoneY, color);
    this.spawnHitFeedback(lane, pressResult.label, pressResult.color);
    this.playHitSound();
    this.lastJudgment = pressResult.label;
    this.lastLaneActivity = { lane: lane as 0 | 1 | 2 | 3, judgment: this.judgmentTextToLaneJudgment(pressResult.label) };

    this.stats.update(stats => {
      const combo = stats.combo + 1;
      return {
        ...stats,
        combo,
        maxCombo: Math.max(stats.maxCombo, combo)
      };
    });
  }

  private judgmentTextToLaneJudgment(text: string): LaneActivity['judgment'] {
    switch (text) {
      case 'Radiant': return 'radiant';
      case 'Shinning': return 'shinning';
      case 'Glimmer': return 'glimmer';
      case 'Shattered': return 'shattered';
      default: return null;
    }
  }

  private judgeTiming(timingDelta: number): { points: number; grade: 'perfect' | 'good' | 'glimmer' | 'miss'; label: string; color: string } {
    if (timingDelta <= this.perfectWindow) {
      return { points: 3, grade: 'perfect', label: 'Radiant', color: this.accentColor };
    }
    if (timingDelta <= this.shinningWindow) {
      return { points: 2, grade: 'good', label: 'Shinning', color: '#78dcff' };
    }
    if (timingDelta <= this.okayWindow) {
      return { points: 1, grade: 'glimmer', label: 'Glimmer', color: '#d2c7ff' };
    }
    return { points: 0, grade: 'miss', label: 'Shattered', color: '#ff9ea8' };
  }

  private finalizeHoldRelease(lane: number, audioTime: number): void {
    const holdIndex = this.activeHolds.findIndex(h => h.lane === lane && !h.released && !h.missed);
    if (holdIndex === -1) return;

    const hold = this.activeHolds[holdIndex];
    hold.released = true;

    const endTime = hold.note.time + (hold.note.durationMs ?? 500);
    const releaseResult = this.judgeHoldReleaseTiming(audioTime, endTime);

    this.finalizeHoldScoring(hold, releaseResult);
  }

  private judgeHoldReleaseTiming(
    releaseTime: number,
    endTime: number
  ): { points: number; grade: 'perfect' | 'good' | 'glimmer' | 'miss'; label: string; color: string } {
    const lateMs = releaseTime - endTime;

    if (lateMs < 0) {
      return { points: 0, grade: 'miss', label: 'Shattered', color: '#ff9ea8' };
    }
    if (lateMs < 100) {
      return { points: 3, grade: 'perfect', label: 'Radiant', color: this.accentColor };
    }
    if (lateMs < 200) {
      return { points: 2, grade: 'good', label: 'Shinning', color: '#78dcff' };
    }
    if (lateMs < 300) {
      return { points: 1, grade: 'glimmer', label: 'Glimmer', color: '#d2c7ff' };
    }
    return { points: 0, grade: 'miss', label: 'Shattered', color: '#ff9ea8' };
  }

  private finalizeHoldAsMiss(note: ChartNote): void {
    note.judged = true;
    note.missed = true;
    this.stats.update(stats => ({
      ...stats,
      miss: stats.miss + 1,
      combo: 0
    }));
    this.updateAccuracy();
    this.spawnHitFeedback(note.lane, 'Shattered', '#ff9ea8');
    this.playMissSound();
  }

  private finalizeHoldScoring(hold: ActiveHold, releaseResult: { points: number; grade: 'perfect' | 'good' | 'glimmer' | 'miss'; label: string; color: string }): void {
    const worsePoints = Math.min(hold.pressPoints, releaseResult.points);
    const worseGrade = this.worseGrade(hold.pressGrade, releaseResult.grade);

    this.scoreUnits += worsePoints;

    this.stats.update(stats => {
      const combo = worseGrade === 'miss' ? 0 : stats.combo + 1;
      const updates: Partial<GameStats> = { combo };
      if (worseGrade === 'perfect') updates.perfect = stats.perfect + 1;
      else if (worseGrade === 'good') updates.good = stats.good + 1;
      else if (worseGrade === 'glimmer') updates.glimmer = stats.glimmer + 1;
      else updates.miss = stats.miss + 1;
      return { ...stats, ...updates, maxCombo: Math.max(stats.maxCombo, combo) };
    });

    this.updateScaledScore();
    this.updateAccuracy();

    const feedbackText = worseGrade === 'miss' ? 'Shattered' : releaseResult.label;
    const feedbackColor = worseGrade === 'miss' ? '#ff9ea8' : releaseResult.color;
    this.spawnHitFeedback(hold.lane, feedbackText, feedbackColor);

    if (worseGrade === 'miss') {
      this.playMissSound();
    } else {
      this.playHitSound();
    }
  }

  private worseGrade(
    a: 'perfect' | 'good' | 'glimmer' | 'miss',
    b: 'perfect' | 'good' | 'glimmer' | 'miss'
  ): 'perfect' | 'good' | 'glimmer' | 'miss' {
    const order = { miss: 0, glimmer: 1, good: 2, perfect: 3 };
    return order[a] < order[b] ? a : b;
  }

  private updateActiveHolds(audioTime: number): void {
    for (let i = this.activeHolds.length - 1; i >= 0; i--) {
      const hold = this.activeHolds[i];
      if (hold.released || hold.missed) continue;

      const endTime = hold.note.time + (hold.note.durationMs ?? 500);
      const tickInterval = 100;

      // Award ticks while the key is held
      while (hold.nextTickTime + tickInterval <= audioTime && hold.nextTickTime + tickInterval <= endTime) {
        hold.nextTickTime += tickInterval;
        if (this.keyStates[hold.lane]) {
          hold.ticksAwarded++;
          this.scoreUnits += 1;
        }
      }

      // Key released early
      if (!this.keyStates[hold.lane] && audioTime < endTime + this.hitWindow) {
        hold.missed = true;
        this.stats.update(stats => ({ ...stats, combo: 0 }));
        this.spawnHitFeedback(hold.lane, 'Dropped', '#ff9ea8');
        this.playMissSound();
        this.activeHolds.splice(i, 1);
        this.updateScaledScore();
        this.updateAccuracy();
        continue;
      }

      // Hold completed without explicit release
      if (audioTime > endTime + this.hitWindow) {
        hold.released = true;
        const releaseResult = this.judgeTiming(0); // perfect release for holding through
        this.finalizeHoldScoring(hold, releaseResult);
        this.activeHolds.splice(i, 1);
      }
    }
  }

  private applyBombPenalty(): void {
    const totalNotes = this.chartNotes.length;
    if (totalNotes <= 0) return;
    const radiantHitValue = this.maxSongScore / totalNotes;
    this.scorePenalty += Math.round(2 * radiantHitValue);
  }

  private findNextUnjudgedNoteInLane(lane: number): ChartNote | null {
    const audioTime = this.getAudioTimeMs();
    for (const note of this.notes) {
      if (note.judged) {
        continue;
      }

      if (note.lane !== lane) {
        continue;
      }

      // Skip notes that are too far in the past (way beyond the hit window)
      const timeSinceNote = audioTime - note.time;
      if (timeSinceNote > this.hitWindow + 50) {
        // Auto-mark this old note as judged so we don't keep returning it
        note.judged = true;
        if (note.type !== NoteType.Bomb) {
          note.missed = true;
        }
        continue;
      }

      return note;
    }

    return null;
  }

  private updateAccuracy(): void {
    // Use the granular scoreUnits (which already takes timing into account) to compute
    // accuracy relative to the maximum possible units for the currently judged notes.
    // This produces a smoother, timing-aware accuracy value while still penalizing
    // misses (they contribute 0 units but are counted in the judged total).
    const judgedCount = this.totalJudgedCount();

    if (judgedCount === 0) {
      this.stats.update(current => ({ ...current, accuracy: 0 }));
      return;
    }

    const maxUnitsForJudged = judgedCount * 3; // 3 units is the max per note
    let accuracy = (this.scoreUnits / maxUnitsForJudged) * 100;
    if (!Number.isFinite(accuracy) || accuracy < 0) accuracy = 0;
    if (accuracy > 100) accuracy = 100;

    // Debug: expose computed values to the console to help verify accuracy calculations
    // (leave as debug-level so it doesn't spam in normal usage)
    try {
      console.debug('[Gameplay] updateAccuracy', {
        scoreUnits: this.scoreUnits,
        judgedCount,
        maxUnitsForJudged,
        accuracy: Number(accuracy.toFixed(4))
      });
    } catch (e) {
      // ignore console errors in restricted environments
    }

    this.stats.update(current => ({ ...current, accuracy }));
  }

  private updateScaledScore(): void {
    const totalNotes = this.chartNotes.length;
    if (totalNotes <= 0) {
      this.stats.update(current => ({ ...current, score: 0 }));
      return;
    }

    const maxUnits = this.chartNotes.reduce((sum, note) => sum + this.getNoteMaxUnits(note), 0);
    const baseScore = Math.round((this.scoreUnits / maxUnits) * this.maxSongScore);
    const score = Math.max(0, baseScore - this.scorePenalty);
    this.stats.update(current => ({ ...current, score }));
  }

  private getNoteMaxUnits(note: ChartNote): number {
    if (note.type === NoteType.Hold && note.durationMs && note.durationMs > 0) {
      const tickCount = Math.floor(note.durationMs / 100);
      return 3 + tickCount;
    }
    return 3;
  }

  private render(audioTime: number): void {
    if (!this.ctx) {
      return;
    }

    if (this.audio) {
      this.audio.volume = this.gameSettingsService.masterVolume();
    }

    const width = this.canvas.width;
    const height = this.canvas.height;

    this.ctx.clearRect(0, 0, width, height);
    this.drawBackground(width, height);

    if (this.redFlashAlpha > 0) {
      this.ctx.save();
      this.ctx.fillStyle = `rgba(255, 71, 87, ${this.redFlashAlpha})`;
      this.ctx.fillRect(0, 0, width, height);
      this.ctx.restore();
      this.redFlashAlpha = Math.max(0, this.redFlashAlpha - 0.05);
    }

    this.drawLaneGuides(height);
    this.drawHitZone(width, height);
    const geometry = this.getLaneGeometry(width);
    const hitZoneY = this.getHitZoneY(height);
    this.drawFlashes(hitZoneY, geometry);
    this.drawNotes(audioTime, width, height);
    this.drawActiveHolds(audioTime, width, height);
    this.updateAndDrawShatters();
    this.updateAndDrawHitFeedbacks(geometry);
    this.drawLaneLabels(height);

    if (this.gameSettingsService.fpsCounter()) {
      this.updateFps();
      this.drawFpsCounter();
    }
  }

  private updateFps(): void {
    const now = performance.now();
    if (this.lastFrameTime > 0) {
      const frameTime = now - this.lastFrameTime;
      this.currentFps = frameTime > 0 ? Math.round(1000 / frameTime) : 0;
    }
    this.lastFrameTime = now;
  }

  private drawFpsCounter(): void {
    if (!this.ctx) return;
    this.ctx.save();
    this.ctx.font = 'bold 14px Oxanium, Rajdhani, sans-serif';
    this.ctx.fillStyle = `rgba(${this.textPrimaryRgb}, 0.9)`;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.shadowColor = `rgba(${this.textPrimaryRgb}, 0.5)`;
    this.ctx.shadowBlur = 6;
    this.ctx.fillText(`FPS ${this.currentFps}`, 12, 12);
    this.ctx.restore();
  }

  private drawBackground(width: number, height: number): void {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, this.mainColor);
    gradient.addColorStop(1, this.mainColor);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height);
  }

  private drawLaneGuides(height: number): void {
    const geometry = this.getLaneGeometry();

    this.ctx.strokeStyle = `rgba(${this.textPrimaryRgb}, 0.12)`;
    this.ctx.lineWidth = 3;

    for (let lane = 0; lane < this.laneCount; lane++) {
      const laneCenterX = this.getLaneCenterX(lane, geometry);
      this.ctx.beginPath();
      this.ctx.moveTo(laneCenterX, 0);
      this.ctx.lineTo(laneCenterX, height);
      this.ctx.stroke();
    }
  }

  private drawHitZone(width: number, height: number): void {
    /*void width;
    const hitZoneY = this.getHitZoneY(height);
    const geometry = this.getLaneGeometry();

    for (let lane = 0; lane < this.laneCount; lane++) {
      const laneCenterX = this.getLaneCenterX(lane, geometry);
      const color = this.laneColors[lane] ?? '#ffd700';

      this.ctx.beginPath();
      this.ctx.fillStyle = `rgba(${this.textPrimaryRgb}, 0.08)`;
      this.ctx.arc(laneCenterX, hitZoneY, this.hitAreaRadius, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 4;
      this.ctx.arc(laneCenterX, hitZoneY, this.hitAreaRadius, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.strokeStyle = `rgba(${this.textPrimaryRgb}, 0.45)`;
      this.ctx.lineWidth = 1.5;
      this.ctx.arc(laneCenterX, hitZoneY, this.hitAreaRadius - 8, 0, Math.PI * 2);
      this.ctx.stroke();
    }*/
    void width;
    const hitZoneY = this.getHitZoneY(height);
    const geometry = this.getLaneGeometry();

    for (let lane = 0; lane < this.laneCount; lane++) {
      const laneCenterX = this.getLaneCenterX(lane, geometry);
      const color = this.laneColors[lane] ?? '#ffd700';

      this.drawLightbulb(laneCenterX, hitZoneY, this.hitAreaRadius, color, false);
    }
  }

  private drawNotes(audioTime: number, width: number, height: number): void {
    /*const geometry = this.getLaneGeometry(width);
    const hitZoneY = this.getHitZoneY(height);
    const noteRadius = this.noteSize / 2;

    for (const note of this.notes) {
      if (note.judged) {
        continue;
      }

      const timeDiff = note.time - audioTime;
      const yCenter = hitZoneY - timeDiff * this.fallingSpeed;

      if (yCenter < -noteRadius || yCenter > height + noteRadius) {
        continue;
      }

      const xCenter = this.getLaneCenterX(note.lane, geometry);

      this.ctx.beginPath();
      this.ctx.fillStyle = this.laneColors[note.lane] ?? '#ffffff';
      this.ctx.shadowColor = this.laneColors[note.lane] ?? '#ffffff';
      this.ctx.shadowBlur = 14;
      this.ctx.arc(xCenter, yCenter, noteRadius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;

      this.ctx.beginPath();
      this.ctx.strokeStyle = `rgba(${this.textPrimaryRgb}, 1)`;
      this.ctx.lineWidth = 3;
      this.ctx.arc(xCenter, yCenter, noteRadius, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.35';
      this.ctx.lineWidth = 2;
      this.ctx.arc(xCenter, yCenter, noteRadius - 8, 0, Math.PI * 2);
      this.ctx.stroke();
    }*/
    const geometry = this.getLaneGeometry(width);
    const hitZoneY = this.getHitZoneY(height);
    const noteRadius = this.noteSize / 2;

    for (const note of this.notes) {
      if (note.judged) continue;

      const timeDiff = note.time - audioTime;
      const yCenter = hitZoneY - timeDiff * this.fallingSpeed;

      const xCenter = this.getLaneCenterX(note.lane, geometry);
      const color = this.laneColors[note.lane] ?? '#ffffff';

      if (note.type === NoteType.Hold) {
        const durationMs = note.durationMs ?? 500;
        const endTime = note.time + durationMs;
        const endTimeDiff = endTime - audioTime;
        const endY = hitZoneY - endTimeDiff * this.fallingSpeed;
        const minY = Math.min(yCenter, endY);
        const maxY = Math.max(yCenter, endY);
        if (maxY < -noteRadius * 2 || minY > height + noteRadius * 2) continue;
        this.drawHoldNote(audioTime, xCenter, yCenter, note, noteRadius, color);
      } else {
        if (yCenter < -noteRadius * 2 || yCenter > height + noteRadius * 2) continue;
        if (note.type === NoteType.Bomb) {
          this.drawBombNote(xCenter, yCenter, noteRadius);
        } else {
          // Glowing falling bulb
          this.drawLightbulb(xCenter, yCenter, noteRadius, color, true);
        }
      }
    }
  }

  private drawActiveHolds(audioTime: number, width: number, height: number): void {
    const geometry = this.getLaneGeometry(width);
    const hitZoneY = this.getHitZoneY(height);
    const noteRadius = this.noteSize / 2;

    for (const hold of this.activeHolds) {
      if (hold.released || hold.missed) continue;

      const note = hold.note;
      const xCenter = this.getLaneCenterX(note.lane, geometry);
      const yCenter = hitZoneY - (note.time - audioTime) * this.fallingSpeed;
      const color = this.laneColors[note.lane] ?? '#ffffff';
      this.drawHoldNote(audioTime, xCenter, yCenter, note, noteRadius, color, false);
    }
  }

  private drawHoldNote(
    audioTime: number,
    x: number,
    y: number,
    note: ChartNote,
    radius: number,
    color: string,
    drawHead: boolean = true
  ): void {
    const durationMs = note.durationMs ?? 500;
    const endTime = note.time + durationMs;
    const hitZoneY = this.getHitZoneY(this.canvas.height);
    const startY = y;
    const endY = hitZoneY - (endTime - audioTime) * this.fallingSpeed;

    const activeHold = this.activeHolds.find(h => h.note === note && !h.released && !h.missed);
    const isActive = activeHold != null;

    // Body: for active holds, anchor the body at the receptor and let the tail
    // descend until it reaches the receptor. For falling holds, draw normally.
    const bodyWidth = radius * 1.4;
    const bodyTop = isActive ? Math.min(endY, hitZoneY) : Math.min(startY, endY);
    const bodyBottom = isActive ? hitZoneY : Math.max(startY, endY);
    const bodyHeight = Math.max(0, bodyBottom - bodyTop);

    if (bodyHeight > 0) {
      this.ctx.save();
      this.ctx.fillStyle = color + '60';
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2;
      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = 12;
      this.ctx.beginPath();
      this.ctx.roundRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight, 4);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Head
    if (drawHead) {
      this.drawLightbulb(x, startY, radius, color, true);
    }

    // Tail
    const tailVisible = isActive ? endY <= hitZoneY : true;
    if (tailVisible && endY > -radius * 2 && endY < this.canvas.height + radius * 2) {
      this.drawLightbulb(x, endY, radius * 0.7, color, false);
    }
  }

  private drawBombNote(x: number, y: number, radius: number): void {
    const ctx = this.ctx;
    const size = radius * 1.3;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);

    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size, 0);
    ctx.closePath();

    ctx.fillStyle = '#ff4757';
    ctx.shadowColor = '#ff4757';
    ctx.shadowBlur = 16;
    ctx.fill();

    ctx.strokeStyle = '#2c0b0e';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();

    // Skull/X symbol
    ctx.save();
    ctx.font = `bold ${Math.max(10, radius)}px Oxanium, Rajdhani, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2c0b0e';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.fillText('!', x, y + 1);
    ctx.restore();
  }

  private drawLaneLabels(height: number): void {
    if (!this.gameSettingsService.showKeyLabels()) {
      return;
    }
    /*const geometry = this.getLaneGeometry();
    const hitZoneY = this.getHitZoneY(height);

    this.ctx.font = '700 28px Arial, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    for (let lane = 0; lane < this.laneCount; lane++) {
      const xPos = this.getLaneCenterX(lane, geometry);
      this.ctx.fillStyle = `rgba(${this.textPrimaryRgb}, 0.8)`;
      this.ctx.fillText(this.laneLabels[lane], xPos, hitZoneY + this.hitAreaRadius + 26);
    }*/
    const geometry = this.getLaneGeometry();
    const hitZoneY = this.getHitZoneY(height);
    const bulbTotalHeight = this.hitAreaRadius * 2.6;
    const labelY = hitZoneY + bulbTotalHeight / 2 + 18;

    this.ctx.font = '700 22px Arial, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = `rgba(${this.textPrimaryRgb}, 0.75)`;

    for (let lane = 0; lane < this.laneCount; lane++) {
      const xPos = this.getLaneCenterX(lane, geometry);
      this.ctx.fillText(this.laneLabels[lane], xPos, labelY);
    }
  }

  private get laneLabels(): string[] {
    return this.gameSettingsService.laneBindings().map(binding => formatBindingLabel(binding));
  }

  private get fallingSpeed(): number {
    return this.gameSettingsService.noteSpeed();
  }

  private getLaneCenterX(lane: number, geometry: { leftMargin: number; laneWidth: number; gap: number }): number {
    return geometry.leftMargin + lane * (geometry.laneWidth + geometry.gap) + geometry.laneWidth / 2;
  }

  private getLaneGeometry(width: number = this.canvas.width ): { leftMargin: number; laneWidth: number; gap: number } {
    const leftMargin = 32;
    const gap = 6;
    const laneWidth = (width - leftMargin * 2 - gap * (this.laneCount - 1)) / this.laneCount;
    return { leftMargin, laneWidth, gap };
  }

  private getHitZoneY(height: number): number {
    return height - 140;
  }

  private cloneNotes(notes: ChartNote[]): ChartNote[] {
    return notes.map(note => ({ ...note, judged: false, missed: false }));
  }

  private normalizeNoteType(type: unknown): NoteType {
    if (type === NoteType.Bomb || type === NoteType.Hold || type === NoteType.Normal) {
      return type;
    }
    if (Number.isInteger(type)) {
      const num = Number(type);
      if (num === NoteType.Bomb || num === NoteType.Hold || num === NoteType.Normal) {
        return num as NoteType;
      }
    }
    return NoteType.Normal;
  }

  private resetGameState(): void {
    this.stopPlaytimeTracking();
    this.stats.set(this.createInitialStats());
    this.previousScore = 0;
    this.previousCombo = 0;
    this.spEarned.set(null);
    this.totalSp.set(null);
    this.highscoreImproved.set(null);
    this.scoreUnits = 0;
    this.scorePenalty = 0;
    this.keyStates = [false, false, false, false]; // Reset key states
    this.activeHolds = [];
    this.notes = this.cloneNotes(this.chartNotes);
    this.hitFeedbacks = [];
    this.gameStarted.set(false);
    this.gameRunning.set(false);
    this.gameFinished.set(false);
    this.playCountReported = false;
    this.challengeSent.set(false);
    this.audio.pause();
    this.audio.currentTime = 0;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private allNotesJudged(): boolean {
    return this.notes.every(n => n.judged);
  }

  private finishGame(): void {
    if (this.gameFinished()) {
      return;
    }

    this.currentSongTimeMs.set(this.totalSongDurationMs());

    // Finalize any active holds as misses
    for (const hold of this.activeHolds) {
      if (!hold.released && !hold.missed) {
        hold.missed = true;
        this.stats.update(stats => ({ ...stats, miss: stats.miss + 1, combo: 0 }));
      }
    }
    this.activeHolds = [];

    // Count any remaining unjudged notes as misses (bombs and holds are ignored)
    let remainingMisses = 0;
    for (const note of this.notes) {
      if (!note.judged) {
        note.judged = true;
        if (note.type !== NoteType.Bomb && note.type !== NoteType.Hold) {
          note.missed = true;
          remainingMisses++;
        }
      }
    }

    if (remainingMisses > 0) {
      this.stats.update(stats => ({
        ...stats,
        miss: stats.miss + remainingMisses
      }));
    }

    this.updateAccuracy();
    try {
      // Log final breakdown for easier inspection when a run finishes
      const s = this.stats();
      const judged = this.totalJudgedCount();
      console.info('[Gameplay] finishGame summary', {
        perfect: s.perfect,
        good: s.good,
        glimmer: s.glimmer,
        miss: s.miss,
        scoreUnits: this.scoreUnits,
        judgedCount: judged,
        computedAccuracy: s.accuracy
      });
    } catch (e) {
      // ignore
    }
    this.stopPlaytimeTracking();
    this.gameRunning.set(false);

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.isMultiplayerMode()) {
      const stats = this.stats();
      this.multiplayerService.emitFinished({
        score: stats.score,
        maxCombo: stats.maxCombo,
        accuracy: stats.accuracy,
        radiant: stats.perfect,
        shinning: stats.good,
        glimmer: stats.glimmer,
        shattered: stats.miss
      });
      this.waitingForOpponent.set(true);
      this.finishGameShowResults();
      return;
    }

    this.finishGameShowResults();
  }

  private finishGameShowResults(): void {
    if (this.gameFinished()) {
      return;
    }
    this.gameFinished.set(true);

    // Check run-based skill achievements
    const currentStats = this.stats();
    const currentSong = this.currentSong();
    const currentDiff = this.resolvedDifficulty();
    this.achievementService.checkRunAchievements({
      maxCombo: currentStats.maxCombo,
      accuracy: currentStats.accuracy,
      miss: currentStats.miss,
      difficultyLevel: currentDiff?.difficulty ?? 1,
      songId: currentSong?.id ?? 0,
      rank: this.resultRank()
    });

    if (this.challengeFromUserId) {
      this.sendChallengeResponse();
    }

    this.render(this.getAudioTimeMs());
    void this.submitFinalScore();
  }

  private submitFinalScore(): void {
    const songId = this.currentSong()?.id;
    const difficultyId = this.resolvedDifficultyId;
    const userId = this.authService.currentUser?.id;

    if (!songId || !difficultyId || !userId) {
      return;
    }

    const currentStats = this.stats();
    // Submit leaderboard highscore (may update user's best per difficulty)
    this.songService.submitDifficultyHighscore(songId, difficultyId, {
      score: currentStats.score,
      maxCombo: currentStats.maxCombo,
      accuracy: currentStats.accuracy,
      date: new Date().toISOString()
    }).subscribe({
      next: response => {
        console.log('[Gameplay] submitDifficultyHighscore response:', response);
        if (!response.success) {
          console.warn('Failed to submit leaderboard score:', response.error);
        } else {
          this.spEarned.set(response.sp ?? 0);
          this.totalSp.set(response.totalSp ?? null);
          this.highscoreImproved.set(response.improved ?? null);
          // Check leaderboard position achievements
          this.achievementService.checkLeaderboardAchievements(songId, difficultyId);
        }
      },
      error: error => {
        console.warn('Failed to submit leaderboard score:', error);
      }
    });

    // Also submit per-run breakdown to aggregate analytics on the server
    try {
      this.authService.submitRunStats(userId, {
        perfect: currentStats.perfect,
        good: currentStats.good,
        glimmer: currentStats.glimmer,
        miss: currentStats.miss,
        score: currentStats.score,
        accuracy: currentStats.accuracy,
        date: new Date().toISOString()
      }).subscribe({
        next: resp => {
          if (!resp.success) {
            console.warn('Failed to submit run stats:', resp.error);
          }
        },
        error: err => console.warn('Failed to submit run stats:', err)
      });
    } catch (e) {
      // ignore errors submitting analytics
      console.warn('Error while sending run stats:', e);
    }
  }

  openSendScoreModal(): void {
    this.showSendScoreModal.set(true);
    this.sendScoreError.set(null);
    this.sendScoreSuccess.set(false);
    this.selectedFriendIds.set(new Set());
    this.loadFriends();
  }

  closeSendScoreModal(): void {
    this.showSendScoreModal.set(false);
    this.sendScoreError.set(null);
    this.sendScoreSuccess.set(false);
  }

  private loadFriends(): void {
    const userId = this.authService.currentUser?.id;
    if (!userId) {
      this.friendsList.set([]);
      return;
    }
    this.loadingFriends.set(true);
    this.friendshipService.getFriends(userId).subscribe({
      next: response => {
        if (response.success) {
          this.friendsList.set(response.friends);
        } else {
          this.friendsList.set([]);
        }
        this.loadingFriends.set(false);
      },
      error: err => {
        this.sendScoreError.set(err.message || 'Failed to load friends');
        this.friendsList.set([]);
        this.loadingFriends.set(false);
      }
    });
  }

  toggleFriendSelection(friendId: number): void {
    this.selectedFriendIds.update(current => {
      const next = new Set(current);
      if (next.has(friendId)) {
        next.delete(friendId);
      } else {
        next.add(friendId);
      }
      return next;
    });
  }

  sendScoreToFriends(): void {
    const userId = this.authService.currentUser?.id;
    if (!userId) {
      this.sendScoreError.set('You must be logged in to send scores');
      return;
    }
    const selectedIds = Array.from(this.selectedFriendIds());
    if (selectedIds.length === 0) {
      this.sendScoreError.set('Please select at least one friend');
      return;
    }

    const song = this.currentSong();
    const diff = this.resolvedDifficulty();
    const stats = this.stats();
    const mapName = song?.name || this.chartMetadata().title || 'Unknown Map';
    const diffName = diff ? difficultyNumberToName(diff.difficulty) : 'Unknown';
    const coverUrl = song?.coverUrl || '';
    const songId = song?.id ?? 0;
    const difficultyId = diff?.id ?? 0;
    const message = `Score Share\nMap: ${mapName}\nDifficulty: ${diffName}\nScore: ${stats.score.toLocaleString()}\nAccuracy: ${stats.accuracy.toFixed(1)}%\nRank: ${this.resultRank()}\nSong ID: ${songId}\nDifficulty ID: ${difficultyId}${coverUrl ? '\nCover: ' + coverUrl : ''}`;

    this.sendingScore.set(true);
    this.sendScoreError.set(null);
    this.sendScoreSuccess.set(false);

    let completed = 0;
    let failed = 0;
    for (const friendId of selectedIds) {
      this.messageService.sendMessage(friendId, message).subscribe({
        next: response => {
          completed++;
          if (response.success && completed === selectedIds.length && failed === 0) {
            this.sendingScore.set(false);
            this.sendScoreSuccess.set(true);
            this.achievementService.trackScoreShare();
          } else if (!response.success) {
            failed++;
            this.sendingScore.set(false);
            this.sendScoreError.set(response.error || `Failed to send to friend ${friendId}`);
          }
        },
        error: err => {
          failed++;
          completed++;
          this.sendingScore.set(false);
          this.sendScoreError.set(err.message || 'Failed to send score');
        }
      });
    }
  }

  private sendChallengeResponse(): void {
    const userId = this.authService.currentUser?.id;
    if (!userId || !this.challengeFromUserId) {
      return;
    }

    const song = this.currentSong();
    const diff = this.resolvedDifficulty();
    const stats = this.stats();
    const mapName = song?.name || this.chartMetadata().title || 'Unknown Map';
    const diffName = diff ? difficultyNumberToName(diff.difficulty) : 'Unknown';
    const coverUrl = song?.coverUrl || '';
    const songId = song?.id ?? 0;
    const difficultyId = diff?.id ?? 0;
    const message = `Score Share\nMap: ${mapName}\nDifficulty: ${diffName}\nScore: ${stats.score.toLocaleString()}\nAccuracy: ${stats.accuracy.toFixed(1)}%\nRank: ${this.resultRank()}\nSong ID: ${songId}\nDifficulty ID: ${difficultyId}${coverUrl ? '\nCover: ' + coverUrl : ''}`;

    this.messageService.sendMessage(this.challengeFromUserId, message).subscribe({
      next: response => {
        if (response.success) {
          this.challengeSent.set(true);
          this.achievementService.trackScoreShare();
        }
      },
      error: err => console.warn('Failed to send challenge response:', err)
    });
  }

  private createInitialStats(): GameStats {
    return {
      score: 0,
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      good: 0,
      glimmer: 0,
      miss: 0,
      accuracy: 0
    };
  }

  private teardown(): void {
    window.removeEventListener('resize', this.onResize);
    this.audio.removeEventListener('ended', this.onAudioEnded);
    this.audio.pause();
    this.audio.currentTime = 0;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.isMultiplayerMode()) {
      this.multiplayerService.disconnect();
    }
  }

  // Playtime tracking helpers
  private startPlaytimeTracking(): void {
    if (!this.authService.isLoggedIn) return;

    // Clear any previous interval
    this.stopPlaytimeTracking();

    this.playtimePendingSeconds = 0;
    this.playtimeIntervalId = window.setInterval(() => {
      this.playtimePendingSeconds++;

      if (this.playtimePendingSeconds >= this.playtimeSendInterval) {
        const toSend = this.playtimePendingSeconds;
        this.playtimePendingSeconds = 0;
        const userId = this.authService.currentUser?.id;
        if (!userId) return;
        this.authService.addPlaytime(userId, toSend).subscribe({
          next: _ => {
            // successful update handled by authService
          },
          error: err => {
            console.warn('Failed to send playtime:', err);
          }
        });
      }
    }, 1000);
  }

  private stopPlaytimeTracking(): void {
    if (this.playtimeIntervalId != null) {
      clearInterval(this.playtimeIntervalId);
      this.playtimeIntervalId = null;
    }
    // flush remaining seconds
    this.flushPlaytime();
  }

  private flushPlaytime(): void {
    if (!this.authService.isLoggedIn) return;
    const userId = this.authService.currentUser?.id;
    if (!userId) return;
    const toSend = this.playtimePendingSeconds;
    if (toSend <= 0) return;
    this.playtimePendingSeconds = 0;
    this.authService.addPlaytime(userId, toSend).subscribe({
      next: _ => {},
      error: err => console.warn('Failed to flush playtime:', err)
    });
  }

  private resizeCanvasToDisplaySize() {
    const rect = this.canvas.getBoundingClientRect();
    const displayWidth = Math.round(rect.width);
    const displayHeight = Math.round(rect.height);

    if(this.canvas.width !== displayWidth || this.canvas.height !== displayHeight){
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;
    }
  }

  private drawLightbulb(x: number, y: number, radius: number, color: string, isGlowing: boolean) {
    const ctx = this.ctx;

    ctx.save();

    // Glow for falling notes
    if (isGlowing) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 28;
    }

    // Outer circle (main body)
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isGlowing ? color : color;
    ctx.globalAlpha = isGlowing ? 0.85 : 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Border
    ctx.strokeStyle = isGlowing ? 'rgba(255, 255, 255, 0.9)' : color;
    ctx.lineWidth = isGlowing ? 2.5 : 3;
    ctx.stroke();

    // Inner highlight circle (subtle reflection)
    ctx.beginPath();
    ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();

    ctx.restore();
  }

  private triggerBulbFlash(lane: number): void {
    this.activeFlashes.set(lane, performance.now() + 150); // 150ms flash
  }


  private drawFlashes(hitZoneY: number, geometry: { leftMargin: number; laneWidth: number; gap: number }) {
    const now = performance.now();

    for (const [lane, endTime] of this.activeFlashes.entries()) {
      if (now > endTime) {
        this.activeFlashes.delete(lane);
        continue;
      }

      const progress = 1 - (endTime - now) / 150;
      const intensity = Math.sin(progress * Math.PI); // Fade in then out
      const laneCenterX = this.getLaneCenterX(lane, geometry);
      const color = this.laneColors[lane];

      // Bright flash overlay
      this.ctx.save();
      this.ctx.globalAlpha = intensity * 0.6;
      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = 30;
      this.drawLightbulb(laneCenterX, hitZoneY, this.hitAreaRadius * 1.1, color, true);
      this.ctx.restore();
    }
  }

  private triggerRedFlash(): void {
    this.redFlashAlpha = 0.35;
  }

  private spawnBombDebris(lane: number): void {
    const geometry = this.getLaneGeometry(this.canvas.width);
    const hitZoneY = this.getHitZoneY(this.canvas.height);
    const x = this.getLaneCenterX(lane, geometry);
    const y = hitZoneY;
    const count = 10;

    for (let i = 0; i < count; i++) {
      const s = 4 + Math.random() * 5;
      const points = [0, -s, s * 0.8, s * 0.6, -s * 0.6, s * 0.4];
      this.shatterShards.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 3,
        vy: 3 + Math.random() * 5,
        angle: Math.random() * Math.PI * 2,
        angularVelocity: (Math.random() - 0.5) * 0.2,
        life: 1,
        maxLife: 0.6 + Math.random() * 0.4,
        color: '#4a4a4a',
        size: s,
        points
      });
    }
  }

  private spawnShatter(x: number, y: number, color: string): void {
    const intensity = this.gameSettingsService.particleIntensity();
    if (intensity === 'off') {
      return;
    }
    const multiplier = PARTICLE_INTENSITY_OPTIONS.find(o => o.value === intensity)?.multiplier ?? 1;
    const baseCount = 16 + Math.floor(Math.random() * 8); // 16-24 shards
    const shardCount = Math.max(1, Math.round(baseCount * multiplier));

    for (let i = 0; i < shardCount; i++) {
      const angle = (Math.PI * 2 * i) / shardCount + (Math.random() - 0.5) * 0.8;
      const speed = 2 + Math.random() * 5;

      // Random triangular shard shape
      const s = 3 + Math.random() * 6;
      const points = [
        0, -s,
        s * 0.8, s * 0.6,
        -s * 0.6, s * 0.4
      ];

      this.shatterShards.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2, // slight upward initial burst
        angle: Math.random() * Math.PI * 2,
        angularVelocity: (Math.random() - 0.5) * 0.3,
        life: 1,
        maxLife: 0.6 + Math.random() * 0.5, // 0.6-1.1 seconds
        color,
        size: s,
        points
      });
    }
  }

  private updateAndDrawShatters(): void {
    const ctx = this.ctx;

    for (let i = this.shatterShards.length - 1; i >= 0; i--) {
      const shard = this.shatterShards[i];

      // Physics
      shard.x += shard.vx;
      shard.y += shard.vy;
      shard.vy += this.shardGravity;
      shard.angle += shard.angularVelocity;
      shard.life -= 1 / (shard.maxLife * 60); // assume ~60fps

      if (shard.life <= 0) {
        this.shatterShards.splice(i, 1);
        continue;
      }

      // Draw shard
      ctx.save();
      ctx.translate(shard.x, shard.y);
      ctx.rotate(shard.angle);
      ctx.globalAlpha = shard.life;
      ctx.fillStyle = shard.color;
      ctx.shadowColor = shard.color;
      ctx.shadowBlur = 8 * shard.life;

      ctx.beginPath();
      ctx.moveTo(shard.points[0], shard.points[1]);
      for (let p = 2; p < shard.points.length; p += 2) {
        ctx.lineTo(shard.points[p], shard.points[p + 1]);
      }
      ctx.closePath();
      ctx.fill();

      // White core for glass look
      ctx.fillStyle = `rgba(${this.textPrimaryRgb}, ${shard.life * 0.6})`;
      ctx.beginPath();
      ctx.arc(0, 0, shard.size * 0.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private spawnHitFeedback(lane: number, text: string, color: string): void {
    const hitZoneY = this.getHitZoneY(this.canvas.height);
    this.hitFeedbacks.push({
      lane,
      y: hitZoneY - 55,
      text,
      color,
      life: 1,
      maxLife: 0.75,
      vy: -1.8,
    });
  }

  private playHitSound(): void {
    const url = this.gameSettingsService.hitSoundUrl();
    if (!url) return;
    this.hitSoundAudio.src = url;
    this.hitSoundAudio.volume = this.gameSettingsService.masterVolume();
    this.hitSoundAudio.currentTime = 0;
    this.hitSoundAudio.play().catch(() => {});
  }

  private playMissSound(): void {
    const url = this.gameSettingsService.missSoundUrl();
    if (!url) return;
    this.missSoundAudio.src = url;
    this.missSoundAudio.volume = this.gameSettingsService.masterVolume();
    this.missSoundAudio.currentTime = 0;
    this.missSoundAudio.play().catch(() => {});
  }

  private updateAndDrawHitFeedbacks(
    geometry: { leftMargin: number; laneWidth: number; gap: number }
  ): void {
    for (let i = this.hitFeedbacks.length - 1; i >= 0; i--) {
      const fb = this.hitFeedbacks[i];
      fb.life -= 1 / (fb.maxLife * 60);
      fb.y += fb.vy;

      if (fb.life <= 0) {
        this.hitFeedbacks.splice(i, 1);
        continue;
      }

      const x = this.getLaneCenterX(fb.lane, geometry);
      const alpha = fb.life;
      const progress = 1 - fb.life;
      const scale = 1 + Math.sin(progress * Math.PI) * 0.2;

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.translate(x, fb.y);
      this.ctx.scale(scale, scale);

      this.ctx.font = 'bold 24px Arial, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';

      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      this.ctx.lineWidth = 4;
      this.ctx.strokeText(fb.text, 0, 0);

      this.ctx.fillStyle = fb.color;
      this.ctx.shadowColor = fb.color;
      this.ctx.shadowBlur = 14;
      this.ctx.fillText(fb.text, 0, 0);

      this.ctx.restore();
    }
  }

  private triggerScoreFlash(direction: 'up' | 'down'): void {
    const el = this.scoreCardRef?.nativeElement;
    if (!el) {
      return;
    }
    const className = `flash-${direction}`;
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth; // force reflow so re-adding the class replays the animation
    el.classList.add(className);
    window.setTimeout(() => el.classList.remove(className), 300);
  }

  private triggerComboFlash(): void {
    const el = this.comboCardRef?.nativeElement;
    if (!el) {
      return;
    }
    el.classList.remove('flash-down');
    void el.offsetWidth;
    el.classList.add('flash-down');
    window.setTimeout(() => el.classList.remove('flash-down'), 300);
  }

  private formatSpDecimal(value: number): string {
    return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  }

  protected formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }


}

