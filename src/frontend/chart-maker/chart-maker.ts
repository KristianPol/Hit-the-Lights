import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NoteType, SongService, Song, SongDifficulty } from '../../app/services/song.service';
import { AuthService } from '../../app/services/auth.service';
import { calculateDifficultyEstimate, formatDifficultyEstimate } from '../utils/difficulty-calculator';

interface EditorNote {
  time: number;
  lane: number;
  type: NoteType;
  durationMs?: number | null;
}

@Component({
  selector: 'app-chart-maker',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './chart-maker.html',
  styleUrl: './chart-maker.scss'
})
export class ChartMaker implements AfterViewInit, OnDestroy {
  // Theme-aware color helpers
  private getCssVar(name: string): string {
    if (typeof window === 'undefined') return '';
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '';
  }
  private get accentColor(): string {
    return this.getCssVar('--color-accent') || '#ffcc33';
  }
  private get textPrimaryRgb(): string {
    return this.getCssVar('--color-text-primary-rgb') || '255, 255, 255';
  }

  @ViewChild('editorCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private songService = inject(SongService);
  private authService = inject(AuthService);

  readonly editingDifficultyId = signal<number | null>(null);
  readonly editingDifficulty = signal<SongDifficulty | null>(null);
  readonly isEditingChart = computed(() => this.editingDifficultyId() !== null);
  readonly chartSaveError = signal<string | null>(null);
  readonly chartSaveSuccess = signal<boolean>(false);

  // Canvas
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private dpr = 1;
  private animFrameId: number | null = null;

  // State
  readonly notes = signal<EditorNote[]>([]);
  readonly bpm = signal(120);
  readonly title = signal('');
  readonly artist = signal('');
  readonly durationMs = signal(60000);
  readonly currentTimeMs = signal(0);
  readonly cursorTimeMs = signal(0);
  readonly isPlaying = signal(false);
  readonly zoom = signal(0.15);
  readonly scrollY = signal(0);
  readonly showBeatLines = signal(true);
  readonly isAudioLoaded = signal(false);
  readonly ownedSongs = signal<Song[]> ([]);
  readonly selectedSongId = signal<number | null>(null);
  readonly audioFileName = signal<string>('');
  readonly selectedTool = signal<NoteType>(NoteType.Normal);
  readonly noteTypeOptions = [
    { value: NoteType.Normal, label: 'Basic', icon: 'fa-circle' },
    { value: NoteType.Bomb, label: 'Bomb', icon: 'fa-bomb' },
    { value: NoteType.Hold, label: 'Hold', icon: 'fa-grip-lines' }
  ];

  // Modals
  readonly showFinishModal = signal(false);
  readonly showAssignModal = signal(false);
  readonly assignDifficulty = signal<number>(1);
  readonly isAssigning = signal(false);
  readonly assignError = signal<string | null>(null);
  readonly assignSuccess = signal(false);

  // Load chart modal
  readonly showLoadChartModal = signal(false);
  readonly loadChartTab = signal<'file' | 'song'>('file');
  readonly loadChartError = signal<string | null>(null);
  readonly selectedLoadSongId = signal<number | null>(null);
  readonly selectedLoadDifficultyId = signal<number | null>(null);
  readonly loadDifficulties = signal<SongDifficulty[]>([]);

  // Audio
  audio = new Audio();
  private audioObjectUrl: string | null = null;

  // Constants
  private readonly laneCount = 4;
  private readonly laneColors = ['#ff6b6b', '#4ecdc4', '#4d96ff', '#ff9f43'];
  private readonly minZoom = 0.02;
  private readonly maxZoom = 2.0;

  // Dragging
  private isDragging = false;
  private dragStartY = 0;
  private dragStartScrollY = 0;

  // Hold resizing
  private isResizingHold = false;
  private resizingHoldNote: EditorNote | null = null;
  private resizeStartTime = 0;
  private resizeStartDuration = 0;
  private resizeMode: 'tail' | 'body' = 'tail';

  // Hover
  private hoverLane: number | null = null;
  private hoverTime = 0;
  readonly hoverResize = signal(false);

  // Computed
  readonly formattedCurrentTime = computed(() => this.formatMs(this.currentTimeMs()));
  readonly formattedDuration = computed(() => this.formatMs(this.durationMs()));
  readonly noteCountText = computed(() => {
    const bombs = this.notes().filter(n => n.type === NoteType.Bomb).length;
    const holds = this.notes().filter(n => n.type === NoteType.Hold).length;
    let text = `${this.notes().length} notes`;
    if (bombs > 0 || holds > 0) {
      const parts: string[] = [];
      if (bombs > 0) parts.push(`${bombs} bomb${bombs === 1 ? '' : 's'}`);
      if (holds > 0) parts.push(`${holds} hold${holds === 1 ? '' : 's'}`);
      text += ` (${parts.join(', ')})`;
    }
    return text;
  });
  readonly difficultyEstimate = computed(() => {
    const normalCount = this.notes().filter(n => n.type === NoteType.Normal).length;
    const holdCount = this.notes().filter(n => n.type === NoteType.Hold).length;
    const bombCount = this.notes().filter(n => n.type === NoteType.Bomb).length;
    return calculateDifficultyEstimate({
      bpm: this.bpm(),
      durationMs: this.durationMs(),
      normalCount,
      holdCount,
      bombCount
    });
  });
  readonly formattedDifficultyEstimate = computed(() => formatDifficultyEstimate(this.difficultyEstimate()));

  constructor() {
    this.loadOwnedSongs();
    this.route.queryParams.subscribe(params => {
      const difficultyId = Number(params['difficultyId']);
      const songId = Number(params['songId']);
      if (!isNaN(difficultyId) && difficultyId > 0 && !isNaN(songId) && songId > 0) {
        this.editingDifficultyId.set(difficultyId);
        this.tryLoadChartForEditing(songId, difficultyId);
      }
    });

    const navState = window.history.state as any;
    if (navState?.returnToCharting && navState.chart) {
      this.restoreFromGameplayState(navState);
    }
  }

  private tryLoadChartForEditing(songId: number, difficultyId: number): void {
    const userId = this.authService.currentUser?.id;
    if (!userId) return;

    const songs = this.ownedSongs();
    if (songs.length === 0) {
      // Songs not loaded yet; retry after a short delay
      setTimeout(() => this.tryLoadChartForEditing(songId, difficultyId), 100);
      return;
    }

    const song = songs.find(s => s.id === songId && s.ownerId === userId);
    if (!song) {
      this.chartSaveError.set('You can only edit charts for songs you own.');
      return;
    }

    this.loadChartForEditing(song, difficultyId);
  }

  ngAfterViewInit(): void {
    this.setupCanvas();
    this.startRenderLoop();
    this.audio.addEventListener('ended', () => this.isPlaying.set(false));
  }

  ngOnDestroy(): void {
    this.stopRenderLoop();
    this.audio.pause();
    this.audio.src = '';
    if (this.audioObjectUrl) {
      URL.revokeObjectURL(this.audioObjectUrl);
      this.audioObjectUrl = null;
    }
  }

  // ─── Song Loading ─────────────────────────────────────────

  private loadOwnedSongs(): void {
    const userId = this.authService.currentUser?.id;
    if (!userId) return;
    this.songService.getAllSongs({ viewerId: userId }).subscribe({
      next: res => {
        if (res.success) {
          this.ownedSongs.set(res.songs.filter(s => s.ownerId === userId));
        }
      },
      error: err => console.error('Failed to load owned songs', err)
    });
  }

  private loadChartForEditing(song: Song, difficultyId: number): void {
    this.selectedSongId.set(song.id);
    this.title.set(song.name);
    this.artist.set(song.author);
    this.bpm.set(song.bpm);
    this.audio.src = song.songUrl;
    this.audio.load();
    this.isAudioLoaded.set(true);
    this.audioFileName.set(`${song.name} - ${song.author}`);
    this.updateDurationFromAudio(this.parseDuration(song.length));

    const viewerId = this.authService.currentUser?.id ?? undefined;
    this.songService.getDifficultyChart(song.id, difficultyId, viewerId).subscribe({
      next: res => {
        if (res.success && res.chart) {
          this.notes.set(res.chart.notes.map(n => ({
            time: n.time,
            lane: n.lane,
            type: this.normalizeNoteType(n.type),
            durationMs: n.durationMs ?? null
          })));
          this.editingDifficulty.set({
            id: difficultyId,
            difficulty: this.findDifficultyNumber(song.difficulties, difficultyId),
            noteCount: res.chart.notes.length,
            difficultyEstimate: this.difficultyEstimate()
          });
          this.assignDifficulty.set(this.editingDifficulty()?.difficulty ?? 1);
        } else {
          this.chartSaveError.set(res.error || 'Failed to load chart for editing.');
        }
      },
      error: err => this.chartSaveError.set(err.message || 'Failed to load chart for editing.')
    });
  }

  private findDifficultyNumber(
    difficulties: SongDifficulty[] | undefined,
    difficultyId: number
  ): number {
    const match = difficulties?.find(d => d.id === difficultyId);
    return match?.difficulty ?? 1;
  }

  onSelectExistingSong(songIdStr: string): void {
    const id = Number(songIdStr);
    if (!id || isNaN(id)) {
      this.selectedSongId.set(null);
      return;
    }
    this.selectedSongId.set(id);
    const song = this.ownedSongs().find(s => s.id === id);
    if (song) {
      this.title.set(song.name);
      this.artist.set(song.author);
      this.bpm.set(song.bpm);
      this.audio.src = song.songUrl;
      this.audio.load();
      this.isAudioLoaded.set(true);
      this.audioFileName.set(`${song.name} - ${song.author}`);
      this.updateDurationFromAudio(this.parseDuration(song.length));
    }
  }

  onAudioFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (this.audioObjectUrl) {
      URL.revokeObjectURL(this.audioObjectUrl);
    }
    this.audioObjectUrl = URL.createObjectURL(file);
    this.audio.src = this.audioObjectUrl;
    this.audio.load();
    this.isAudioLoaded.set(true);
    this.audioFileName.set(file.name);
    this.selectedSongId.set(null);
    this.updateDurationFromAudio(60000);
  }

  // ─── Canvas ───────────────────────────────────────────────

  private updateDurationFromAudio(fallbackMs: number): void {
    const applyDuration = () => {
      const durationMs = this.audio.duration ? Math.round(this.audio.duration * 1000) : fallbackMs;
      this.durationMs.set(Math.max(durationMs, fallbackMs));
    };

    if (this.audio.readyState >= 1 && Number.isFinite(this.audio.duration)) {
      applyDuration();
    } else {
      this.audio.onloadedmetadata = applyDuration;
      this.audio.oncanplaythrough = applyDuration;
    }
  }

  private setupCanvas(): void {
    this.canvas = this.canvasRef.nativeElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;
    this.resizeCanvas();
    window.addEventListener('resize', this.onWindowResize);
  }

  private onWindowResize = (): void => {
    this.resizeCanvas();
  };

  private resizeCanvas(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private startRenderLoop(): void {
    const loop = (): void => {
      if (this.isPlaying()) {
        this.currentTimeMs.set(this.audio.currentTime * 1000);
        this.keepPlaybackHeadVisible();
      }
      this.render();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private stopRenderLoop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    window.removeEventListener('resize', this.onWindowResize);
  }

  // ─── Rendering ────────────────────────────────────────────

  private render(): void {
    if (!this.ctx) return;
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    this.ctx.clearRect(0, 0, width, height);
    this.drawGrid(width, height);
    if (this.showBeatLines()) {
      this.drawBeatLines(width, height);
    }
    this.drawLanes(width, height);
    this.drawNotes(width, height);
    this.drawPlaybackHead(width, height);
    this.drawCursorLine(width, height);
  }

  private drawGrid(width: number, height: number): void {
    const zoom = this.zoom();
    const startMs = Math.max(0, this.yToTime(0));
    const endMs = this.yToTime(height);

    const gridStart = Math.floor(startMs / 5) * 5;
    const gridEnd = Math.ceil(endMs / 5) * 5;

    // 5ms background bands (squares)
    if (zoom >= 0.08) {
      for (let ms = gridStart; ms <= gridEnd; ms += 5) {
        const y = this.timeToY(ms);
        const nextY = this.timeToY(ms + 5);
        const bandHeight = nextY - y;
        if (bandHeight < 0.5) continue;
        const idx = Math.floor(ms / 5);
        this.ctx.fillStyle = idx % 2 === 0 ? `rgba(${this.textPrimaryRgb}, 0.015)` : `rgba(${this.textPrimaryRgb}, 0.005)`;
        this.ctx.fillRect(0, y, width, bandHeight);
      }
    }

    // Grid lines
    for (let ms = gridStart; ms <= gridEnd; ms += 5) {
      const y = this.timeToY(ms);
      if (y < -2 || y > height + 2) continue;

      const isMajor = ms % 100 === 0;
      const isMedium = ms % 10 === 0;

      if (isMajor) {
        this.ctx.strokeStyle = `rgba(${this.textPrimaryRgb}, 0.22)`;
        this.ctx.lineWidth = 1;
      } else if (isMedium) {
        this.ctx.strokeStyle = `rgba(${this.textPrimaryRgb}, 0.09)`;
        this.ctx.lineWidth = 0.5;
      } else {
        if (zoom < 0.12) continue;
        this.ctx.strokeStyle = `rgba(${this.textPrimaryRgb}, 0.04)`;
        this.ctx.lineWidth = 0.5;
      }

      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();

      if (isMajor) {
        this.ctx.fillStyle = `rgba(${this.textPrimaryRgb}, 0.35)`;
        this.ctx.font = '11px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'bottom';
        this.ctx.fillText(`${ms}ms`, 6, y - 2);
      }
    }
  }

  private drawBeatLines(width: number, height: number): void {
    const bpm = this.bpm();
    if (!bpm || bpm <= 0) return;

    const beatIntervalMs = 60000 / bpm;
    const startMs = Math.max(0, this.yToTime(0));
    const endMs = this.yToTime(height);

    const firstBeat = Math.floor(startMs / beatIntervalMs);
    const lastBeat = Math.ceil(endMs / beatIntervalMs);

    this.ctx.strokeStyle = this.accentColor;
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([]);

    for (let beat = firstBeat; beat <= lastBeat; beat++) {
      const timeMs = beat * beatIntervalMs;
      const y = this.timeToY(timeMs);
      if (y < -2 || y > height + 2) continue;

      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();

      this.ctx.fillStyle = this.accentColor;
      this.ctx.font = 'bold 11px sans-serif';
      this.ctx.textAlign = 'right';
      this.ctx.textBaseline = 'bottom';
      this.ctx.fillText(`B ${beat + 1}`, width - 6, y - 2);
    }
  }

  private drawLanes(width: number, height: number): void {
    const laneWidth = width / this.laneCount;
    for (let i = 0; i <= this.laneCount; i++) {
      const x = i * laneWidth;
      this.ctx.strokeStyle = `rgba(${this.textPrimaryRgb}, 0.12)`;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();
    }

    this.ctx.fillStyle = `rgba(${this.textPrimaryRgb}, 0.45)`;
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    for (let i = 0; i < this.laneCount; i++) {
      this.ctx.fillText(`${i + 1}`, i * laneWidth + laneWidth / 2, 6);
    }
  }

  private drawNotes(width: number, height: number): void {
    const laneWidth = width / this.laneCount;
    const noteRadius = Math.min(laneWidth * 0.32, 12);

    for (const note of this.notes()) {
      const y = this.timeToY(note.time);
      if (y < -noteRadius * 2 || y > height + noteRadius * 2) continue;

      const x = note.lane * laneWidth + laneWidth / 2;
      const color = this.laneColors[note.lane];
      const isHovered = this.hoverLane === note.lane && Math.abs(this.hoverTime - note.time) <= 2;

      if (note.type === NoteType.Bomb) {
        this.drawEditorBombNote(x, y, noteRadius, isHovered);
      } else if (note.type === NoteType.Hold) {
        const endY = this.timeToY(note.time + (note.durationMs ?? 500));
        const tailTime = note.time + (note.durationMs ?? 500);
        const isTailHovered = this.hoverLane === note.lane && Math.abs(this.hoverTime - tailTime) <= 15 / this.zoom();
        this.drawEditorHoldNote(x, y, endY, noteRadius, color, isHovered, isTailHovered);
      } else {
        // Glow
        this.ctx.beginPath();
        this.ctx.fillStyle = isHovered ? color + '70' : color + '40';
        this.ctx.arc(x, y, noteRadius + (isHovered ? 6 : 4), 0, Math.PI * 2);
        this.ctx.fill();

        // Note body
        this.ctx.beginPath();
        this.ctx.fillStyle = color;
        this.ctx.arc(x, y, noteRadius, 0, Math.PI * 2);
        this.ctx.fill();

        // Border
        this.ctx.beginPath();
        this.ctx.strokeStyle = isHovered ? `rgba(${this.textPrimaryRgb}, 1)` : `rgba(${this.textPrimaryRgb}, 0.7)`;
        this.ctx.lineWidth = isHovered ? 2 : 1.5;
        this.ctx.arc(x, y, noteRadius, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }
  }

  private drawEditorBombNote(x: number, y: number, radius: number, isHovered: boolean): void {
    const ctx = this.ctx;
    const size = radius * 1.1;
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
    ctx.shadowBlur = isHovered ? 16 : 10;
    ctx.fill();

    ctx.strokeStyle = isHovered ? `rgba(${this.textPrimaryRgb}, 1)` : `rgba(${this.textPrimaryRgb}, 0.7)`;
    ctx.lineWidth = isHovered ? 2.5 : 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = `bold ${Math.max(8, radius * 0.8)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2c0b0e';
    ctx.shadowBlur = 0;
    ctx.fillText('!', x, y + 1);
    ctx.restore();
  }

  private drawEditorHoldNote(x: number, y: number, endY: number, radius: number, color: string, isHovered: boolean, isTailHovered: boolean): void {
    const ctx = this.ctx;
    const width = radius * 1.6;
    const bodyHeight = Math.max(2, endY - y);

    // Hold body
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y, width, bodyHeight, 4);
    ctx.fillStyle = color + '40';
    ctx.shadowColor = color;
    ctx.shadowBlur = isHovered || isTailHovered ? 14 : 8;
    ctx.fill();

    // Head
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Tail handle (larger, with drag grip lines)
    const tailRadius = Math.max(radius * 0.9, 10);
    ctx.beginPath();
    ctx.arc(x, endY, tailRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, endY, tailRadius, 0, Math.PI * 2);
    ctx.strokeStyle = isTailHovered ? `rgba(${this.textPrimaryRgb}, 1)` : `rgba(${this.textPrimaryRgb}, 0.7)`;
    ctx.lineWidth = isTailHovered ? 2.5 : 1.5;
    ctx.stroke();

    // Grip indicator
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${this.textPrimaryRgb}, 0.9)`;
    ctx.lineWidth = 1.5;
    ctx.moveTo(x - tailRadius * 0.5, endY);
    ctx.lineTo(x + tailRadius * 0.5, endY);
    ctx.stroke();

    ctx.shadowBlur = 0;
  }

  private drawPlaybackHead(width: number, height: number): void {
    const y = this.timeToY(this.currentTimeMs());
    if (y < -2 || y > height + 2) return;

    this.ctx.strokeStyle = this.accentColor;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, y);
    this.ctx.lineTo(width, y);
    this.ctx.stroke();

    this.ctx.fillStyle = this.accentColor;
    this.ctx.beginPath();
    this.ctx.moveTo(0, y);
    this.ctx.lineTo(8, y - 5);
    this.ctx.lineTo(8, y + 5);
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawCursorLine(width: number, height: number): void {
    const y = this.timeToY(this.cursorTimeMs());
    if (y < -2 || y > height + 2) return;

    this.ctx.strokeStyle = `rgba(${this.textPrimaryRgb}, 0.25)`;
    this.ctx.setLineDash([4, 4]);
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, y);
    this.ctx.lineTo(width, y);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  // ─── Coordinates ──────────────────────────────────────────

  private timeToY(ms: number): number {
    return ms * this.zoom() - this.scrollY();
  }

  private yToTime(y: number): number {
    return (y + this.scrollY()) / this.zoom();
  }

  private xToLane(x: number, width: number): number | null {
    const laneWidth = width / this.laneCount;
    const lane = Math.floor(x / laneWidth);
    if (lane < 0 || lane >= this.laneCount) return null;
    return lane;
  }

  private findHoldNoteAt(lane: number, time: number): EditorNote | null {
    return this.notes().find(n =>
      n.type === NoteType.Hold &&
      n.lane === lane &&
      Math.abs(n.time - time) <= 2
    ) ?? null;
  }

  private findHoldTailAt(lane: number, time: number): EditorNote | null {
    const tailToleranceMs = 15 / this.zoom(); // ~15px tolerance
    return this.notes().find(n => {
      if (n.type !== NoteType.Hold || n.lane !== lane || !n.durationMs) return false;
      const tailTime = n.time + n.durationMs;
      return Math.abs(tailTime - time) <= tailToleranceMs;
    }) ?? null;
  }

  private findHoldBodyAt(lane: number, time: number): EditorNote | null {
    const headToleranceMs = 3;
    const tailToleranceMs = 15 / this.zoom();
    return this.notes().find(n => {
      if (n.type !== NoteType.Hold || n.lane !== lane || !n.durationMs) return false;
      const tailTime = n.time + n.durationMs;
      return (
        time > n.time + headToleranceMs &&
        time < tailTime - tailToleranceMs
      );
    }) ?? null;
  }

  // ─── Interaction ──────────────────────────────────────────

  onCanvasMouseDown(event: MouseEvent): void {
    if (event.button !== 0 && event.button !== 1) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const width = rect.width;
    const lane = this.xToLane(x, width);
    const time = Math.round(Math.max(0, Math.min(this.yToTime(y), this.durationMs())));

    if (lane !== null) {
      const tailHold = this.findHoldTailAt(lane, time);
      if (tailHold) {
        this.isResizingHold = true;
        this.resizeMode = 'tail';
        this.resizingHoldNote = tailHold;
        this.resizeStartTime = time;
        this.resizeStartDuration = tailHold.durationMs ?? 500;
        document.body.style.cursor = 'ns-resize';
        return;
      }

      const bodyHold = this.findHoldBodyAt(lane, time);
      if (bodyHold) {
        this.isResizingHold = true;
        this.resizeMode = 'body';
        this.resizingHoldNote = bodyHold;
        this.resizeStartTime = time;
        this.resizeStartDuration = bodyHold.durationMs ?? 500;
        document.body.style.cursor = 'ns-resize';
        return;
      }
    }

    this.isDragging = true;
    this.dragStartY = event.clientY;
    this.dragStartScrollY = this.scrollY();
  }

  onCanvasMouseMove(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const width = rect.width;
    const time = Math.round(Math.max(0, Math.min(this.yToTime(y), this.durationMs())));

    const lane = this.xToLane(x, width);
    this.hoverLane = lane;
    this.hoverTime = time;
    this.hoverResize.set(
      lane !== null &&
      (this.findHoldTailAt(lane, time) !== null || this.findHoldBodyAt(lane, time) !== null)
    );

    // Snap cursor to nearest note if close
    if (lane !== null) {
      const nearest = this.notes().find(n => n.lane === lane && Math.abs(n.time - time) <= 3);
      this.cursorTimeMs.set(nearest ? nearest.time : time);
    } else {
      this.cursorTimeMs.set(time);
    }

    if (this.isDragging) {
      const deltaY = this.dragStartY - event.clientY;
      this.scrollY.set(Math.max(0, this.dragStartScrollY + deltaY));
    }
  }

  onCanvasMouseUp(event: MouseEvent): void {
    if (this.isResizingHold) {
      this.isResizingHold = false;
      this.resizingHoldNote = null;
      this.resizeMode = 'tail';
      document.body.style.cursor = '';
      return;
    }

    if (!this.isDragging) return;
    const wasDragging = Math.abs(event.clientY - this.dragStartY) > 3;
    this.isDragging = false;

    if (!wasDragging && event.button === 0) {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const width = rect.width;
      const lane = this.xToLane(x, width);
      if (lane !== null) {
        const time = Math.round(Math.max(0, Math.min(this.yToTime(y), this.durationMs())));
        this.toggleNote(lane, time);
      }
    }
  }

  onCanvasWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseY = event.clientY - rect.top;
    const mouseTime = this.yToTime(mouseY);
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom() * zoomFactor));
    this.zoom.set(newZoom);
    const newScrollY = mouseTime * newZoom - mouseY;
    this.scrollY.set(Math.max(0, newScrollY));
  }

  onCanvasMouseLeave(): void {
    this.isDragging = false;
    // Keep hold resize active so dragging outside the canvas doesn't drop it.
    this.hoverLane = null;
    this.hoverResize.set(false);
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent): void {
    if (!this.isResizingHold || !this.resizingHoldNote) return;

    const rect = this.canvas.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const height = rect.height;

    // Auto-scroll when dragging near the canvas edges.
    const edgeMargin = 40;
    const maxScrollSpeed = 25;
    const currentScrollY = this.scrollY();
    let newScrollY = currentScrollY;
    if (y < edgeMargin) {
      const speed = Math.min(maxScrollSpeed, (edgeMargin - y) / 2);
      newScrollY = Math.max(0, currentScrollY - speed);
    } else if (y > height - edgeMargin) {
      const speed = Math.min(maxScrollSpeed, (y - (height - edgeMargin)) / 2);
      const maxScroll = Math.max(0, this.durationMs() * this.zoom() - height);
      newScrollY = Math.min(maxScroll, currentScrollY + speed);
    }
    if (newScrollY !== currentScrollY) {
      this.scrollY.set(newScrollY);
    }

    const time = Math.round(Math.max(0, Math.min(this.yToTime(y), this.durationMs())));
    const note = this.resizingHoldNote;
    let newDuration: number;

    if (this.resizeMode === 'body') {
      const deltaMs = time - this.resizeStartTime;
      const maxDuration = this.durationMs() - note.time;
      newDuration = Math.max(100, Math.min(Math.round(this.resizeStartDuration + deltaMs), maxDuration));
    } else {
      const newEndTime = Math.max(note.time + 100, Math.min(time, this.durationMs()));
      newDuration = Math.round(newEndTime - note.time);
    }

    this.notes.update(notes => notes.map(n =>
      n === note ? { ...n, durationMs: newDuration } : n
    ));
  }

  @HostListener('window:mouseup')
  onWindowMouseUp(): void {
    if (this.isResizingHold) {
      this.isResizingHold = false;
      this.resizingHoldNote = null;
      this.resizeMode = 'tail';
      document.body.style.cursor = '';
    }
  }

  toggleBeatLines(): void {
    this.showBeatLines.update(show => !show);
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
      return;
    }

    switch (event.key) {
      case ' ':
        event.preventDefault();
        this.togglePlay();
        break;
      case '1':
      case '2':
      case '3':
      case '4':
        event.preventDefault();
        this.toggleNote(Number(event.key) - 1, this.cursorTimeMs());
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.cursorTimeMs.set(Math.max(0, this.cursorTimeMs() - 1));
        this.scrollToCursor();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.cursorTimeMs.set(Math.min(this.durationMs(), this.cursorTimeMs() + 1));
        this.scrollToCursor();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.cursorTimeMs.set(Math.max(0, this.cursorTimeMs() - 5));
        this.scrollToCursor();
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.cursorTimeMs.set(Math.min(this.durationMs(), this.cursorTimeMs() + 5));
        this.scrollToCursor();
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        this.removeNoteAtCursor();
        break;
      case 'Home':
        event.preventDefault();
        this.seekTo(0);
        break;
      case 'End':
        event.preventDefault();
        this.seekTo(this.durationMs());
        break;
    }
  }

  private scrollToCursor(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cursorY = this.timeToY(this.cursorTimeMs());
    const margin = 60;
    if (cursorY < margin) {
      this.scrollY.set(Math.max(0, this.cursorTimeMs() * this.zoom() - margin));
    } else if (cursorY > rect.height - margin) {
      this.scrollY.set(Math.max(0, this.cursorTimeMs() * this.zoom() - rect.height + margin));
    }
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

  private keepPlaybackHeadVisible(): void {
    const rect = this.canvas.getBoundingClientRect();
    const headY = this.timeToY(this.currentTimeMs());
    if (headY > rect.height - 40) {
      this.scrollY.set(Math.max(0, this.currentTimeMs() * this.zoom() - rect.height / 2));
    }
  }

  // ─── Notes ────────────────────────────────────────────────

  private toggleNote(lane: number, time: number): void {
    const existingIndex = this.notes().findIndex(n => n.lane === lane && Math.abs(n.time - time) <= 2);
    if (existingIndex >= 0) {
      this.notes.update(notes => {
        const copy = [...notes];
        copy.splice(existingIndex, 1);
        return copy;
      });
    } else {
      const type = this.selectedTool();
      const newNote: EditorNote = { time, lane, type };
      if (type === NoteType.Hold) {
        newNote.durationMs = 1000; // default hold length
      }
      this.notes.update(notes => [...notes, newNote].sort((a, b) => a.time - b.time || a.lane - b.lane));
    }
  }

  private removeNoteAtCursor(): void {
    const toRemove = this.notes().filter(n => n.lane === this.hoverLane && Math.abs(n.time - this.cursorTimeMs()) <= 2);
    if (toRemove.length === 0) return;
    this.notes.update(notes => notes.filter(n => !toRemove.some(r => r.time === n.time && r.lane === n.lane)));
  }

  // ─── Navigation ───────────────────────────────────────────

  goToMenu(): void {
    this.router.navigate(['/menu']);
  }

  // ─── Load Chart ───────────────────────────────────────────

  openLoadChartModal(): void {
    this.showLoadChartModal.set(true);
    this.loadChartError.set(null);
    this.loadChartTab.set('file');
    this.selectedLoadSongId.set(null);
    this.selectedLoadDifficultyId.set(null);
    this.loadDifficulties.set([]);
  }

  closeLoadChartModal(): void {
    this.showLoadChartModal.set(false);
  }

  setLoadChartTab(tab: 'file' | 'song'): void {
    this.loadChartTab.set(tab);
    this.loadChartError.set(null);
  }

  onLoadChartFileSelected(event: Event): void {
    this.loadChartError.set(null);
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        this.loadChartJson(json);
        this.closeLoadChartModal();
      } catch (err) {
        this.loadChartError.set('Invalid JSON file.');
      }
    };
    reader.onerror = () => this.loadChartError.set('Failed to read file.');
    reader.readAsText(file);
  }

  private loadChartJson(json: any): void {
    if (!json || typeof json !== 'object') {
      this.loadChartError.set('Invalid chart file.');
      return;
    }

    const metadata = json.metadata || {};
    const notes = Array.isArray(json.notes) ? json.notes : [];

    if (notes.length > 0 && !notes.every((n: any) => Number.isFinite(n.time) && Number.isFinite(n.lane))) {
      this.loadChartError.set('Chart notes are missing required fields.');
      return;
    }

    this.title.set(String(metadata.title || this.title() || 'Untitled'));
    this.artist.set(String(metadata.artist || this.artist() || 'Unknown'));
    this.bpm.set(Number(metadata.bpm) || this.bpm() || 120);
    this.durationMs.set(Number(metadata.duration_ms) || Number(metadata.durationMs) || this.durationMs() || 60000);

    this.notes.set(notes.map((n: any) => ({
      time: Number(n.time),
      lane: Number(n.lane),
      type: this.normalizeNoteType(n.type),
      durationMs: n.durationMs ?? n.duration_ms ?? null
    })));

    this.scrollY.set(0);
    this.currentTimeMs.set(0);
  }

  private restoreFromGameplayState(state: any): void {
    const chart = state.chart;
    if (!chart) return;

    this.loadChartJson(chart);

    const song = state.song as Song | undefined;
    if (song?.songUrl) {
      this.audio.src = song.songUrl;
      this.audio.load();
      this.isAudioLoaded.set(true);
      this.updateDurationFromAudio(this.durationMs());
    }

    this.selectedSongId.set(state.selectedSongId ?? null);
    this.audioFileName.set(state.audioFileName ?? '');

    const editingDifficultyId = state.editingDifficultyId ?? null;
    const editingDifficulty = state.editingDifficulty ?? null;
    if (editingDifficultyId) {
      this.editingDifficultyId.set(editingDifficultyId);
      this.editingDifficulty.set(editingDifficulty);
      this.assignDifficulty.set(editingDifficulty?.difficulty ?? 1);
    }
  }

  onLoadSongChange(songIdStr: string): void {
    const id = Number(songIdStr);
    if (!id || isNaN(id)) {
      this.selectedLoadSongId.set(null);
      this.selectedLoadDifficultyId.set(null);
      this.loadDifficulties.set([]);
      return;
    }
    this.selectedLoadSongId.set(id);
    this.selectedLoadDifficultyId.set(null);

    const song = this.ownedSongs().find(s => s.id === id);
    if (song?.difficulties && song.difficulties.length > 0) {
      this.loadDifficulties.set(song.difficulties);
    } else {
      const viewerId = this.authService.currentUser?.id ?? undefined;
      this.songService.getSongDifficulties(id, viewerId).subscribe({
        next: res => {
          if (res.success && res.difficulties) {
            this.loadDifficulties.set(res.difficulties);
          } else {
            this.loadDifficulties.set([]);
            this.loadChartError.set(res.error || 'Failed to load difficulties.');
          }
        },
        error: err => {
          this.loadDifficulties.set([]);
          this.loadChartError.set(err.message || 'Failed to load difficulties.');
        }
      });
    }
  }

  onLoadDifficultyChange(diffIdStr: string): void {
    const id = Number(diffIdStr);
    this.selectedLoadDifficultyId.set(!id || isNaN(id) ? null : id);
  }

  loadSelectedChart(): void {
    const songId = this.selectedLoadSongId();
    const difficultyId = this.selectedLoadDifficultyId();
    if (!songId || !difficultyId) {
      this.loadChartError.set('Please select a song and difficulty.');
      return;
    }

    const song = this.ownedSongs().find(s => s.id === songId);
    if (!song) {
      this.loadChartError.set('Song not found.');
      return;
    }

    this.loadChartForEditing(song, difficultyId);
    this.editingDifficultyId.set(difficultyId);
    this.closeLoadChartModal();
  }

  // ─── Audio Controls ───────────────────────────────────────

  togglePlay(): void {
    if (!this.isAudioLoaded()) return;
    if (this.isPlaying()) {
      this.audio.pause();
      this.isPlaying.set(false);
    } else {
      this.audio.play().catch(() => {});
      this.isPlaying.set(true);
    }
  }

  seekTo(ms: number): void {
    const clamped = Math.max(0, Math.min(ms, this.durationMs()));
    this.currentTimeMs.set(clamped);
    if (this.isAudioLoaded()) {
      this.audio.currentTime = clamped / 1000;
    }
  }

  onSeekInput(event: Event): void {
    this.seekTo(Number((event.target as HTMLInputElement).value));
  }

  // ─── Playtest ─────────────────────────────────────────────

  playtest(): void {
    if (this.notes().length === 0) {
      alert('Place some notes first!');
      return;
    }
    if (!this.isAudioLoaded()) {
      alert('Load an audio file or select a song first!');
      return;
    }

    const metadata = {
      title: this.title() || 'Untitled',
      artist: this.artist() || 'Unknown',
      bpm: this.bpm(),
      duration_ms: this.durationMs()
    };

    const chart = {
      metadata,
      notes: this.notes().map(n => ({
        time: n.time,
        lane: n.lane,
        type: n.type,
        durationMs: n.durationMs ?? null
      }))
    };

    const song: Song = {
      id: 0,
      name: this.title() || 'Untitled',
      author: this.artist() || 'Unknown',
      bpm: this.bpm(),
      length: this.formatDuration(this.durationMs()),
      songUrl: this.audio.src,
      coverUrl: ''
    };

    this.router.navigate(['/gameplay'], {
      state: {
        song,
        chartTest: true,
        chart,
        selectedSongId: this.selectedSongId(),
        audioFileName: this.audioFileName(),
        editingDifficultyId: this.editingDifficultyId(),
        editingDifficulty: this.editingDifficulty()
      }
    });
  }

  // ─── Finish Flow ──────────────────────────────────────────

  openFinishModal(): void {
    this.showFinishModal.set(true);
  }

  closeFinishModal(): void {
    this.showFinishModal.set(false);
  }

  downloadChart(): void {
    const chart = {
      metadata: {
        title: this.title() || 'Untitled',
        artist: this.artist() || 'Unknown',
        bpm: this.bpm(),
        duration_ms: this.durationMs(),
        description: `Chart with ${this.notes().length} notes`
      },
      notes: this.notes().map(n => ({
        time: n.time,
        lane: n.lane,
        type: n.type,
        durationMs: n.durationMs ?? null
      }))
    };

    const blob = new Blob([JSON.stringify(chart, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(this.title() || 'chart').replace(/\s+/g, '_')}_chart.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showFinishModal.set(false);
  }

  openAssignModal(): void {
    this.showFinishModal.set(false);
    this.showAssignModal.set(true);
    this.assignError.set(null);
    this.assignSuccess.set(false);
    this.assignDifficulty.set(Math.min(10, Math.max(1, Math.round(this.difficultyEstimate()))));
  }

  closeAssignModal(): void {
    this.showAssignModal.set(false);
  }

  onAssignSongChange(songIdStr: string): void {
    const id = Number(songIdStr);
    this.selectedSongId.set(isNaN(id) || id <= 0 ? null : id);
  }

  onAssignDifficultyChange(diffStr: string): void {
    const d = Number(diffStr);
    this.assignDifficulty.set(isNaN(d) ? 1 : d);
  }

  submitAssign(): void {
    const songId = this.selectedSongId();
    const userId = this.authService.currentUser?.id;
    const difficultyId = this.editingDifficultyId();

    if (!songId || !userId) {
      this.assignError.set('Please select a song.');
      return;
    }

    if (this.notes().length === 0) {
      this.assignError.set('Chart has no notes.');
      return;
    }

    const bombCount = this.notes().filter(n => n.type === NoteType.Bomb).length;
    if (bombCount > this.notes().length * 0.1) {
      this.assignError.set('Bomb notes cannot exceed 10% of the chart.');
      return;
    }

    this.isAssigning.set(true);
    this.assignError.set(null);

    const request = {
      difficulty: this.assignDifficulty(),
      notes: this.notes().map(n => ({
        time: n.time,
        lane: n.lane,
        type: n.type,
        durationMs: n.durationMs ?? null
      }))
    };

    if (difficultyId) {
      this.songService.updateDifficulty(songId, difficultyId, request).subscribe({
        next: res => {
          this.isAssigning.set(false);
          if (res.success) {
            this.assignSuccess.set(true);
            this.editingDifficulty.set(res.difficulty ?? this.editingDifficulty());
            setTimeout(() => this.closeAssignModal(), 1500);
          } else {
            this.assignError.set(res.error || 'Failed to update chart.');
          }
        },
        error: err => {
          this.isAssigning.set(false);
          this.assignError.set(err.message || 'Failed to update chart.');
        }
      });
    } else {
      this.songService.addSongDifficulty(songId, request).subscribe({
        next: res => {
          this.isAssigning.set(false);
          if (res.success) {
            this.assignSuccess.set(true);
            setTimeout(() => this.closeAssignModal(), 1500);
          } else {
            this.assignError.set(res.error || 'Failed to assign chart.');
          }
        },
        error: err => {
          this.isAssigning.set(false);
          this.assignError.set(err.message || 'Failed to assign chart.');
        }
      });
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  private formatMs(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const millis = Math.floor(ms % 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  }

  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private parseDuration(length: string): number {
    const parts = length.split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0], 10);
      const secs = parseInt(parts[1], 10);
      if (!isNaN(mins) && !isNaN(secs)) {
        return (mins * 60 + secs) * 1000;
      }
    }
    return 60000;
  }
}
