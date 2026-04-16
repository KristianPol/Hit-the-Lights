import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
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

interface ChartFile {
  metadata?: ChartMetadata;
  notes: Array<{ time: number; lane: number }>;
}

interface GameStats {
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
  accuracy: number;
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

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animationFrameId: number | null = null;
  private readonly onResize = () => this.handleResize();
  private readonly onAudioEnded = () => this.finishGame();

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
    return currentStats.perfect + currentStats.good + currentStats.miss;
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

  readonly canvasWidth = 1280;
  readonly canvasHeight = 800;
  readonly noteSize = 104;
  readonly hitAreaRadius = 52;
  readonly hitWindow = 130;
  readonly perfectWindow = 55;
  readonly fallingSpeed = 1.7;

  // FIX: Added miss window - notes that pass this point are definitely missed
  readonly missWindow = 150; // ms after note time to count as miss

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private songService: SongService,
    private authService: AuthService,
    private http: HttpClient
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
      await this.loadChart();
    } finally {
      this.isLoading.set(false);
      this.render(this.getAudioTimeMs());
    }
  }

  ngOnDestroy(): void {
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
    await Promise.all([this.loadChart(), this.configureAudio(song?.songUrl ?? this.defaultSongUrl)]);
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

  private async loadChart(): Promise<void> {
    try {
      const chart = await firstValueFrom(this.http.get<ChartFile>('/assets/charts/prototype-chart.json'));
      if (!Array.isArray(chart.notes) || chart.notes.length === 0) {
        console.warn('Prototype chart JSON is invalid; using fallback chart.');
        this.useFallbackChart();
        return;
      }

      this.chartMetadata.set(chart.metadata ?? {});
      this.chartNotes = chart.notes
        .map(note => ({ ...note, judged: false, missed: false }))
        .sort((a, b) => a.time - b.time);
      this.notes = this.cloneNotes(this.chartNotes);
    } catch (error) {
      console.warn('Failed to load prototype chart JSON; using fallback chart.', error);
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
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.focusCanvas();
  }

  private handleResize(): void {
    if (!this.canvas || !this.ctx) {
      return;
    }

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

    // FIX: Process misses BEFORE rendering to ensure accurate state
    this.processMissedNotes(audioTime);
    this.render(audioTime);

    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  };

  private getAudioTimeMs(): number {
    return this.audio.currentTime * 1000;
  }

  /**
   * FIX: Completely rewritten miss detection logic
   *
   * The original code had a bug where it only checked if audioTime - note. time > hitWindow,
   * but this didn't properly handle notes that were completely missed (passed the hit zone).
   *
   * New logic:
   * 1. Notes that pass the missWindow (150ms after their time) are marked as missed
   * 2. We track which notes have already been processed to avoid double-counting
   * 3. Combo is reset immediately when any miss occurs
   */
  private processMissedNotes(audioTime: number): void {
    let newMisses = 0;

    for (const note of this.notes) {
      // Skip already judged notes
      if (note.judged) {
        continue;
      }

      // Calculate how far past the note time we are
      const timeSinceNote = audioTime - note.time;

      // If note has passed the miss window, it's a guaranteed miss
      if (timeSinceNote > this.missWindow) {
        note.judged = true;
        note.missed = true;
        newMisses++;
      }
    }

    // Update stats if we found new misses
    if (newMisses > 0) {
      this.stats.update(stats => ({
        ...stats,
        miss: stats.miss + newMisses,
        combo: 0
      }));
      this.updateAccuracy();
    }
  }

  /**
   * FIX: Improved hit detection with better window checking
   *
   * Original issue: The method didn't properly validate that notes were within
   * the hit window before processing, and didn't handle the case where multiple
   * notes in the same lane could be hit simultaneously.
   */
  private handleKeyPress(lane: number): void {
    if (!this.gameRunning()) {
      return;
    }

    const audioTime = this.getAudioTimeMs();

    // Find the closest unjudged note in this lane
    const hittableNote = this.findHittableNote(lane, audioTime);

    if (!hittableNote) {
      // No note in hit window - this is a valid empty press, no penalty
      return;
    }

    const { note, delta } = hittableNote;

    // Mark as judged first to prevent double-hits
    note.judged = true;
    note.missed = false;

    // Score based on accuracy
    if (delta <= this.perfectWindow) {
      this.scoreUnits += 2;
      this.stats.update(stats => ({ ...stats, perfect: stats.perfect + 1 }));
    } else {
      this.scoreUnits += 1;
      this.stats.update(stats => ({ ...stats, good: stats.good + 1 }));
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

  /**
   * NEW: Helper method to find the best hittable note in a lane
   *
   * Returns the note with the smallest time delta that's within the hit window,
   * or null if no such note exists.
   */
  private findHittableNote(lane: number, audioTime: number): { note: ChartNote; delta: number } | null {
    let bestCandidate: { note: ChartNote; delta: number } | null = null;
    let smallestDelta = Infinity;

    for (const note of this.notes) {
      // Skip judged notes
      if (note.judged) {
        continue;
      }

      // Wrong lane
      if (note.lane !== lane) {
        continue;
      }

      // Calculate time difference (can be negative if note is approaching)
      const delta = Math.abs(note.time - audioTime);

      // Must be within hit window
      if (delta <= this.hitWindow && delta < smallestDelta) {
        smallestDelta = delta;
        bestCandidate = { note, delta };
      }
    }

    return bestCandidate;
  }

  private updateAccuracy(): void {
    const stats = this.stats();
    const total = stats.perfect + stats.good + stats.miss;
    if (total === 0) {
      this.stats.update(current => ({ ...current, accuracy: 0 }));
      return;
    }

    const accuracy = ((stats.perfect * 100 + stats.good * 50) / (total * 100)) * 100;
    this.stats.update(current => ({ ...current, accuracy }));
  }

  private updateScaledScore(): void {
    const totalNotes = this.chartNotes.length;
    if (totalNotes <= 0) {
      this.stats.update(current => ({ ...current, score: 0 }));
      return;
    }

    const maxUnits = totalNotes * 2;
    const score = Math.round((this.scoreUnits / maxUnits) * this.maxSongScore);
    this.stats.update(current => ({ ...current, score }));
  }

  private render(audioTime: number): void {
    if (!this.ctx) {
      return;
    }

    const width = this.canvasWidth;
    const height = this.canvasHeight;

    this.ctx.clearRect(0, 0, width, height);
    this.drawBackground(width, height);
    this.drawLaneGuides(height);
    this.drawHitZone(width, height);
    this.drawNotes(audioTime);
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
    void width;
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
    }
  }

  private drawNotes(audioTime: number): void {
    const geometry = this.getLaneGeometry();
    const hitZoneY = this.getHitZoneY(this.canvasHeight);
    const noteRadius = this.noteSize / 2;

    for (const note of this.notes) {
      if (note.judged) {
        continue;
      }

      const timeDiff = note.time - audioTime;
      const yCenter = hitZoneY - timeDiff * this.fallingSpeed;

      if (yCenter < -noteRadius || yCenter > this.canvasHeight + noteRadius) {
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
    }
  }

  private drawLaneLabels(height: number): void {
    const geometry = this.getLaneGeometry();
    const hitZoneY = this.getHitZoneY(height);

    this.ctx.font = '700 28px Arial, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    for (let lane = 0; lane < this.laneCount; lane++) {
      const xPos = this.getLaneCenterX(lane, geometry);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.fillText(this.laneLabels[lane], xPos, hitZoneY + this.hitAreaRadius + 26);
    }
  }

  private getLaneCenterX(lane: number, geometry: { leftMargin: number; laneWidth: number; gap: number }): number {
    return geometry.leftMargin + lane * (geometry.laneWidth + geometry.gap) + geometry.laneWidth / 2;
  }

  private getLaneGeometry(): { leftMargin: number; laneWidth: number; gap: number } {
    const leftMargin = 32;
    const gap = 6;
    const laneWidth = (this.canvasWidth - leftMargin * 2 - gap * (this.laneCount - 1)) / this.laneCount;
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
  }

  private createInitialStats(): GameStats {
    return {
      score: 0,
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      good: 0,
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
}
