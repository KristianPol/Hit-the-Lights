import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SongService, Song } from '../../app/services/song.service';
import { AuthService } from '../../app/services/auth.service';

interface EditorNote {
  time: number;
  lane: number;
}

@Component({
  selector: 'app-chart-maker',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './chart-maker.html',
  styleUrl: './chart-maker.scss'
})
export class ChartMaker implements AfterViewInit, OnDestroy {
  @ViewChild('editorCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private router = inject(Router);
  private songService = inject(SongService);
  private authService = inject(AuthService);

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
  readonly isAudioLoaded = signal(false);
  readonly ownedSongs = signal<Song[]>([]);
  readonly selectedSongId = signal<number | null>(null);
  readonly audioFileName = signal<string>('');

  // Modals
  readonly showFinishModal = signal(false);
  readonly showAssignModal = signal(false);
  readonly assignDifficulty = signal<number>(1);
  readonly isAssigning = signal(false);
  readonly assignError = signal<string | null>(null);
  readonly assignSuccess = signal(false);

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

  // Hover
  private hoverLane: number | null = null;
  private hoverTime = 0;

  // Computed
  readonly formattedCurrentTime = computed(() => this.formatMs(this.currentTimeMs()));
  readonly formattedDuration = computed(() => this.formatMs(this.durationMs()));
  readonly noteCountText = computed(() => `${this.notes().length} notes`);

  constructor() {
    this.loadOwnedSongs();
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
    this.songService.getAllSongs(userId).subscribe({
      next: res => {
        if (res.success) {
          this.ownedSongs.set(res.songs.filter(s => s.ownerId === userId));
        }
      },
      error: err => console.error('Failed to load owned songs', err)
    });
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
      this.durationMs.set(this.parseDuration(song.length));
      this.audio.src = song.songUrl;
      this.audio.load();
      this.isAudioLoaded.set(true);
      this.audioFileName.set(`${song.name} - ${song.author}`);
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

    this.audio.onloadedmetadata = () => {
      this.durationMs.set(Math.round(this.audio.duration * 1000));
    };
  }

  // ─── Canvas ───────────────────────────────────────────────

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
        this.ctx.fillStyle = idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.005)';
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
        this.ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        this.ctx.lineWidth = 1;
      } else if (isMedium) {
        this.ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        this.ctx.lineWidth = 0.5;
      } else {
        if (zoom < 0.12) continue;
        this.ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        this.ctx.lineWidth = 0.5;
      }

      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();

      if (isMajor) {
        this.ctx.fillStyle = 'rgba(255,255,255,0.35)';
        this.ctx.font = '11px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'bottom';
        this.ctx.fillText(`${ms}ms`, 6, y - 2);
      }
    }
  }

  private drawLanes(width: number, height: number): void {
    const laneWidth = width / this.laneCount;
    for (let i = 0; i <= this.laneCount; i++) {
      const x = i * laneWidth;
      this.ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();
    }

    this.ctx.fillStyle = 'rgba(255,255,255,0.45)';
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
      this.ctx.strokeStyle = isHovered ? '#fff' : 'rgba(255,255,255,0.7)';
      this.ctx.lineWidth = isHovered ? 2 : 1.5;
      this.ctx.arc(x, y, noteRadius, 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }

  private drawPlaybackHead(width: number, height: number): void {
    const y = this.timeToY(this.currentTimeMs());
    if (y < -2 || y > height + 2) return;

    this.ctx.strokeStyle = '#ffcc33';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, y);
    this.ctx.lineTo(width, y);
    this.ctx.stroke();

    this.ctx.fillStyle = '#ffcc33';
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

    this.ctx.strokeStyle = 'rgba(255,255,255,0.25)';
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

  // ─── Interaction ──────────────────────────────────────────

  onCanvasMouseDown(event: MouseEvent): void {
    if (event.button !== 0 && event.button !== 1) return;
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
    this.hoverLane = null;
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
      this.notes.update(notes => [...notes, { time, lane }].sort((a, b) => a.time - b.time || a.lane - b.lane));
    }
  }

  private removeNoteAtCursor(): void {
    const toRemove = this.notes().filter(n => n.lane === this.hoverLane && Math.abs(n.time - this.cursorTimeMs()) <= 2);
    if (toRemove.length === 0) return;
    this.notes.update(notes => notes.filter(n => !toRemove.some(r => r.time === n.time && r.lane === n.lane)));
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
      notes: this.notes().map(n => ({ time: n.time, lane: n.lane }))
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
      state: { song, chartTest: true, chart }
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
      notes: this.notes().map(n => ({ time: n.time, lane: n.lane }))
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
    const difficulty = this.assignDifficulty();

    if (!songId || !userId) {
      this.assignError.set('Please select a song.');
      return;
    }

    if (this.notes().length === 0) {
      this.assignError.set('Chart has no notes.');
      return;
    }

    this.isAssigning.set(true);
    this.assignError.set(null);

    const request = {
      ownerId: userId,
      difficulty,
      notes: this.notes().map(n => ({ time: n.time, lane: n.lane }))
    };

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
