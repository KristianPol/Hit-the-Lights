import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Song, SongService } from '../../app/services/song.service';
import { AuthService } from '../../app/services/auth.service';


interface ChartNote {
  time: number;
  lane: number;
  judged?: boolean;
  missed?: boolean; // Track if note was missed vs just judged
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

@Component({
  selector: 'app-gameplay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gameplay.component.html',
  styleUrls: ['./gameplay.component.scss']
})
export class GameplayComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly defaultSongUrl = '/assets/music/SpearOfJustice.mp3';
  private readonly laneLabels = ['D', 'F', 'J', 'K'];
  private readonly laneColors = ['#ff6b6b', '#4ecdc4', '#4d96ff', '#ff9f43'];
  private readonly laneCount = 4;

  private shatterShards: ShatterShard[] = [];
  private readonly shardGravity = 0.15;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animationFrameId: number | null = null;
  // Playtime tracking
  private playtimeIntervalId: number | null = null;
  private playtimePendingSeconds = 0;
  private readonly playtimeSendInterval = 10; // send to server every 10 seconds
  private readonly onResize = () => this.handleResize();
  private readonly onAudioEnded = () => this.finishGame();
  private activeFlashes: Map<number, number> = new Map();
  private readonly difficultyIdFromState: number | null = (() => {
    const value = Number(window.history.state?.difficultyId);
    return Number.isFinite(value) && value > 0 ? value : null;
  })();
  private resolvedDifficultyId: number | null = this.difficultyIdFromState;

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

  readonly stats = signal<GameStats>(this.createInitialStats());
  private readonly maxSongScore = 1_000_000;
  private scoreUnits = 0;

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
    return 'Press D, F, J, or K to start';
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

  // FIX: Added key state tracking to prevent held-key spamming
  private keyStates: boolean[] = [false, false, false, false];

  // readonly canvasWidth = 1280;
  // readonly canvasHeight = 800;
  readonly noteSize = 80;
  readonly hitAreaRadius = 40;
  readonly hitWindow = 130;
  readonly perfectWindow = 55;
  readonly shinningWindow = 90;
  readonly fallingSpeed = 1.7;
  readonly earlyBuffer = 100; // ms before note where presses are ignored (ghost hit)

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private songService: SongService,
    private authService: AuthService
  ) {}

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
      // start background playtime tracking when component is initialized
      this.startPlaytimeTracking();
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

  private async initializeGame(): Promise<void> {
    const song = await this.resolveSong();
    this.currentSong.set(song);
    this.resolvedDifficultyId = this.resolveDifficultyId(song);
    await Promise.all([this.loadChart(song, this.resolvedDifficultyId), this.configureAudio(song?.songUrl ?? this.defaultSongUrl)]);
  }

  private resolveDifficultyId(song: Song | null): number | null {
    if (this.difficultyIdFromState) {
      return this.difficultyIdFromState;
    }

    const firstDifficulty = song?.difficulties?.[0];
    return firstDifficulty?.id ?? null;
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
        .map(note => ({ ...note, judged: false, missed: false }))
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
    this.chartNotes = this.buildFallbackChart();
    this.notes = this.cloneNotes(this.chartNotes);
  }

  private buildFallbackChart(): ChartNote[] {
    const notes: ChartNote[] = [];
    for (let index = 0; index < 24; index++) {
      notes.push({
        time: 1500 + index * 375,
        lane: index % this.laneCount,
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
    const mapping: Record<string, number> = {
      d: 0, D: 0,
      f: 1, F: 1,
      j: 2, J: 2,
      k: 3, K: 3
    };

    return mapping[key] ?? null;
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

    this.audio.play().catch(error => {
      console.error('Audio playback failed:', error);
      this.loadingError.set('The song could not be played. Check the audio file path or browser permissions.');
      this.gameRunning.set(false);
      this.gameStarted.set(false);
    });

    this.gameLoop();
  }

  private gameLoop = (): void => {
    if (!this.gameRunning()) {
      return;
    }

    const audioTime = this.getAudioTimeMs();

    // Note: No automatic miss detection. Misses are only counted when player actively presses at wrong time.
    // Ghost hits (pressing empty lane) do not count as misses.
    this.render(audioTime);

    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  };

  private getAudioTimeMs(): number {
    return this.audio.currentTime * 1000;
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

    // Presses way too early (before earlyBuffer) are treated like ghost hits - just ignore them
    if (timeSinceNote < -this.earlyBuffer) {
      return;
    }

    // Presses outside the valid hit window (but not too early) = miss
    if (timeSinceNote < 0 || timeSinceNote > this.hitWindow) {
      nextNote.judged = true;
      nextNote.missed = true;
      this.stats.update(stats => ({
        ...stats,
        miss: stats.miss + 1,
        combo: 0
      }));
      this.updateAccuracy();
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

    if (timeSinceNote <= this.perfectWindow) {
      this.scoreUnits += 3;
      this.stats.update(stats => ({ ...stats, perfect: stats.perfect + 1 }));
    } else if (timeSinceNote <= this.shinningWindow) {
      this.scoreUnits += 2;
      this.stats.update(stats => ({ ...stats, good: stats.good + 1 }));
    } else {
      this.scoreUnits += 1;
      this.stats.update(stats => ({ ...stats, glimmer: stats.glimmer + 1 }));
    }

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
        // Auto-mark this old note as missed so we don't keep returning it
        note.judged = true;
        note.missed = true;
        continue;
      }

      return note;
    }

    return null;
  }

  private updateAccuracy(): void {
    const stats = this.stats();
    const total = stats.perfect + stats.good + stats.glimmer + stats.miss;
    const weightedJudgements = (stats.perfect * 3) + (stats.good * 2) + stats.glimmer;
    if (total === 0) {
      this.stats.update(current => ({ ...current, accuracy: 0 }));
      return;
    }

    const accuracy = (weightedJudgements / (total * 3)) * 100;
    this.stats.update(current => ({ ...current, accuracy }));
  }

  private updateScaledScore(): void {
    const totalNotes = this.chartNotes.length;
    if (totalNotes <= 0) {
      this.stats.update(current => ({ ...current, score: 0 }));
      return;
    }

    const maxUnits = totalNotes * 3;
    const score = Math.round((this.scoreUnits / maxUnits) * this.maxSongScore);
    this.stats.update(current => ({ ...current, score }));
  }

  private render(audioTime: number): void {
    if (!this.ctx) {
      return;
    }

    const width = this.canvas.width;
    const height = this.canvas.height;

    this.ctx.clearRect(0, 0, width, height);
    this.drawBackground(width, height);
    this.drawLaneGuides(height);
    this.drawHitZone(width, height);
    const geometry = this.getLaneGeometry(width);
    const hitZoneY = this.getHitZoneY(height);
    this.drawFlashes(hitZoneY, geometry);
    this.drawNotes(audioTime, width, height);
    this.updateAndDrawShatters();
    this.drawLaneLabels(height);
  }

  private drawBackground(width: number, height: number): void {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#050505');
    gradient.addColorStop(1, '#111111');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height);
  }

  private drawLaneGuides(height: number): void {
    const geometry = this.getLaneGeometry();

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
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
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      this.ctx.arc(laneCenterX, hitZoneY, this.hitAreaRadius, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 4;
      this.ctx.arc(laneCenterX, hitZoneY, this.hitAreaRadius, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
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
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 3;
      this.ctx.arc(xCenter, yCenter, noteRadius, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
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

      if (yCenter < -noteRadius * 2 || yCenter > height + noteRadius * 2) continue;

      const xCenter = this.getLaneCenterX(note.lane, geometry);
      const color = this.laneColors[note.lane] ?? '#ffffff';

      // Glowing falling bulb
      this.drawLightbulb(xCenter, yCenter, noteRadius, color, true);
    }
  }

  private drawLaneLabels(height: number): void {
    /*const geometry = this.getLaneGeometry();
    const hitZoneY = this.getHitZoneY(height);

    this.ctx.font = '700 28px Arial, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    for (let lane = 0; lane < this.laneCount; lane++) {
      const xPos = this.getLaneCenterX(lane, geometry);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.fillText(this.laneLabels[lane], xPos, hitZoneY + this.hitAreaRadius + 26);
    }*/
    const geometry = this.getLaneGeometry();
    const hitZoneY = this.getHitZoneY(height);
    const bulbTotalHeight = this.hitAreaRadius * 2.6;
    const labelY = hitZoneY + bulbTotalHeight / 2 + 18;

    this.ctx.font = '700 22px Arial, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';

    for (let lane = 0; lane < this.laneCount; lane++) {
      const xPos = this.getLaneCenterX(lane, geometry);
      this.ctx.fillText(this.laneLabels[lane], xPos, labelY);
    }
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

  private resetGameState(): void {
    this.stats.set(this.createInitialStats());
    this.scoreUnits = 0;
    this.keyStates = [false, false, false, false]; // Reset key states
    this.notes = this.cloneNotes(this.chartNotes);
    this.gameStarted.set(false);
    this.gameRunning.set(false);
    this.gameFinished.set(false);
    this.audio.pause();
    this.audio.currentTime = 0;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private finishGame(): void {
    if (this.gameFinished()) {
      return;
    }

    // Count any remaining unjudged notes as misses
    let remainingMisses = 0;
    for (const note of this.notes) {
      if (!note.judged) {
        note.judged = true;
        note.missed = true;
        remainingMisses++;
      }
    }

    if (remainingMisses > 0) {
      this.stats.update(stats => ({
        ...stats,
        miss: stats.miss + remainingMisses
      }));
    }

    this.updateAccuracy();
    this.gameRunning.set(false);
    this.gameFinished.set(true);

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
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
    this.songService.submitDifficultyHighscore(songId, difficultyId, {
      userId,
      score: currentStats.score,
      maxCombo: currentStats.maxCombo,
      accuracy: currentStats.accuracy,
      date: new Date().toISOString()
    }).subscribe({
      next: response => {
        if (!response.success) {
          console.warn('Failed to submit leaderboard score:', response.error);
        }
      },
      error: error => {
        console.warn('Failed to submit leaderboard score:', error);
      }
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
    const w = radius * 1.35;      // bulb width
    const h = radius * 2.6;       // total bulb height
    const glassH = h * 0.72;      // glass portion
    const baseH = h * 0.28;       // metal base portion
    const baseW = w * 0.42;       // base width
    const glassBottom = y - h / 2 + glassH;

    ctx.save();

    // ─── Glow for falling notes ───
    if (isGlowing) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 28;
    }

    // ─── Glass Bulb Body ───
    ctx.beginPath();
    // Top center
    ctx.moveTo(x, y - h / 2);
    // Right dome (bulbous top)
    ctx.bezierCurveTo(
      x + w * 0.55, y - h / 2,
      x + w * 0.6, y - h * 0.15,
      x + w * 0.38, y + glassH * 0.45 - h / 2
    );
    // Right taper to neck
    ctx.bezierCurveTo(
      x + w * 0.32, y + glassH * 0.75 - h / 2,
      x + baseW * 0.55, glassBottom - baseH * 0.15,
      x + baseW * 0.5, glassBottom
    );
    // Bottom glass curve
    ctx.quadraticCurveTo(x, glassBottom + baseH * 0.08, x - baseW * 0.5, glassBottom);
    // Left taper up
    ctx.bezierCurveTo(
      x - baseW * 0.55, glassBottom - baseH * 0.15,
      x - w * 0.32, y + glassH * 0.75 - h / 2,
      x - w * 0.38, y + glassH * 0.45 - h / 2
    );
    // Left dome
    ctx.bezierCurveTo(
      x - w * 0.6, y - h * 0.15,
      x - w * 0.55, y - h / 2,
      x, y - h / 2
    );
    ctx.closePath();

    // Fill
    ctx.fillStyle = isGlowing ? color : color;
    ctx.globalAlpha = isGlowing ? 0.85 : 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Glass highlight (subtle reflection on left side)
    ctx.beginPath();
    ctx.ellipse(
      x - w * 0.18, y - h * 0.15,
      w * 0.1, h * 0.18,
      -0.2, 0, Math.PI * 2
    );
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fill();

    // ─── Outline ───
    ctx.beginPath();
    ctx.moveTo(x, y - h / 2);
    ctx.bezierCurveTo(x + w * 0.55, y - h / 2, x + w * 0.6, y - h * 0.15, x + w * 0.38, y + glassH * 0.45 - h / 2);
    ctx.bezierCurveTo(x + w * 0.32, y + glassH * 0.75 - h / 2, x + baseW * 0.55, glassBottom - baseH * 0.15, x + baseW * 0.5, glassBottom);
    ctx.quadraticCurveTo(x, glassBottom + baseH * 0.08, x - baseW * 0.5, glassBottom);
    ctx.bezierCurveTo(x - baseW * 0.55, glassBottom - baseH * 0.15, x - w * 0.32, y + glassH * 0.75 - h / 2, x - w * 0.38, y + glassH * 0.45 - h / 2);
    ctx.bezierCurveTo(x - w * 0.6, y - h * 0.15, x - w * 0.55, y - h / 2, x, y - h / 2);
    ctx.closePath();
    ctx.strokeStyle = isGlowing ? 'rgba(255, 255, 255, 0.9)' : color;
    ctx.lineWidth = isGlowing ? 2.5 : 3;
    ctx.stroke();

    // ─── Filament (inside the glass) ───
    if (isGlowing) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const fy = y - h * 0.12;
      const fh = h * 0.22;
      ctx.moveTo(x - w * 0.08, fy + fh / 2);
      ctx.lineTo(x - w * 0.04, fy - fh / 2);
      ctx.lineTo(x, fy + fh / 2);
      ctx.lineTo(x + w * 0.04, fy - fh / 2);
      ctx.lineTo(x + w * 0.08, fy + fh / 2);
      ctx.stroke();
    }

    // ─── Metal Screw Base ───
    const baseTop = glassBottom;
    const baseBottom = baseTop + baseH;

    // Base body
    ctx.fillStyle = isGlowing ? 'rgba(90, 90, 90, 0.9)' : 'rgba(55, 55, 55, 0.7)';
    ctx.beginPath();
    ctx.moveTo(x + baseW * 0.5, baseTop);
    ctx.lineTo(x + baseW * 0.45, baseBottom);
    ctx.quadraticCurveTo(x, baseBottom + 3, x - baseW * 0.45, baseBottom);
    ctx.lineTo(x - baseW * 0.5, baseTop);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = isGlowing ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Screw threads (horizontal lines)
    ctx.strokeStyle = isGlowing ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const ty = baseTop + (baseH * i / 4);
      const tw = baseW * (0.5 - i * 0.03); // slightly narrower as we go down
      ctx.beginPath();
      ctx.moveTo(x - tw, ty);
      ctx.lineTo(x + tw, ty);
      ctx.stroke();
    }

    // ─── Bottom contact ───
    ctx.beginPath();
    ctx.fillStyle = isGlowing ? 'rgba(120, 120, 120, 0.95)' : 'rgba(80, 80, 80, 0.8)';
    ctx.arc(x, baseBottom + 2, baseW * 0.18, 0, Math.PI * 2);
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

  private spawnShatter(x: number, y: number, color: string): void {
    const shardCount = 16 + Math.floor(Math.random() * 8); // 16-24 shards

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
      ctx.fillStyle = `rgba(255, 255, 255, ${shard.life * 0.6})`;
      ctx.beginPath();
      ctx.arc(0, 0, shard.size * 0.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }
}

