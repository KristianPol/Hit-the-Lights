import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { AuthService } from './auth.service';

export type GameRoomStatus = 'pending' | 'active' | 'finished' | 'cancelled';

export interface RoomResult {
  id: string;
  difficultyId: number;
  challengerId: number;
  inviteeId: number;
  status: GameRoomStatus;
  winnerId: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface LaneActivity {
  lane: 0 | 1 | 2 | 3;
  judgment: 'radiant' | 'shinning' | 'glimmer' | 'shattered' | null;
}

export interface MatchState {
  score: number;
  combo: number;
  accuracy: number;
  lastJudgment?: string | null;
  laneActivity?: LaneActivity;
}

export interface MatchResult {
  winnerId: number | null;
  results: any[];
}

export interface CreateRoomResponse {
  success: boolean;
  roomId?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class MultiplayerService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private socket: Socket | null = null;

  readonly roomId = signal<string | null>(null);
  readonly role = signal<'challenger' | 'invitee' | null>(null);
  readonly opponentId = signal<number | null>(null);
  readonly opponentConnected = signal(false);

  private readonly opponentState$ = new Subject<MatchState>();
  private readonly countdown$ = new Subject<number>();
  private readonly start$ = new Subject<{ serverTimeMs: number }>();
  private readonly result$ = new Subject<MatchResult>();
  private readonly error$ = new Subject<string>();
  private readonly joined$ = new Subject<{ roomId: string; opponentId: number; role: 'challenger' | 'invitee' }>();

  get opponentState(): Observable<MatchState> { return this.opponentState$.asObservable(); }
  get countdown(): Observable<number> { return this.countdown$.asObservable(); }
  get matchStart(): Observable<{ serverTimeMs: number }> { return this.start$.asObservable(); }
  get matchResult(): Observable<MatchResult> { return this.result$.asObservable(); }
  get roomError(): Observable<string> { return this.error$.asObservable(); }
  get roomJoined(): Observable<{ roomId: string; opponentId: number; role: 'challenger' | 'invitee' }> { return this.joined$.asObservable(); }

  connect(): void {
    if (this.socket?.connected) return;
    const token = this.authService.getToken();
    this.socket = io({
      auth: { token }
    });

    this.socket.on('room:joined', (payload: { roomId: string; opponentId: number; role: 'challenger' | 'invitee' }) => {
      this.roomId.set(payload.roomId);
      this.opponentId.set(payload.opponentId);
      this.role.set(payload.role);
      this.opponentConnected.set(true);
      this.joined$.next(payload);
    });

    this.socket.on('room:opponent-joined', () => {
      this.opponentConnected.set(true);
    });

    this.socket.on('match:countdown', (payload: { value: number }) => {
      this.countdown$.next(payload.value);
    });

    this.socket.on('match:start', (payload: { serverTimeMs: number }) => {
      this.start$.next(payload);
    });

    this.socket.on('match:opponent-state', (state: MatchState) => {
      this.opponentState$.next(state);
    });

    this.socket.on('match:result', (payload: MatchResult) => {
      this.result$.next(payload);
    });

    this.socket.on('room:error', (payload: { message: string }) => {
      this.error$.next(payload.message);
      this.disconnect();
    });

    this.socket.on('disconnect', () => {
      this.opponentConnected.set(false);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.roomId.set(null);
    this.role.set(null);
    this.opponentId.set(null);
    this.opponentConnected.set(false);
  }

  createRoom(request: {
    difficultyId: number;
    inviteeId: number;
    songId?: number | null;
    songName?: string;
    songArtist?: string;
    songCoverUrl?: string;
    difficultyName?: string;
    difficultyEstimate?: number | null;
  }): Observable<CreateRoomResponse> {
    return this.http.post<CreateRoomResponse>('/api/multiplayer/rooms', {
      difficultyId: request.difficultyId,
      inviteeId: request.inviteeId,
      songId: request.songId ?? null,
      songName: request.songName ?? null,
      songArtist: request.songArtist ?? null,
      songCoverUrl: request.songCoverUrl ?? null,
      difficultyName: request.difficultyName ?? null,
      difficultyEstimate: request.difficultyEstimate ?? null
    });
  }

  acceptInvite(roomId: string): Observable<CreateRoomResponse> {
    return this.http.post<CreateRoomResponse>(`/api/multiplayer/rooms/${roomId}/accept`, {});
  }

  getRoom(roomId: string): Observable<{ success: boolean; room?: RoomResult; error?: string }> {
    return this.http.get<{ success: boolean; room?: RoomResult; error?: string }>(`/api/multiplayer/rooms/${roomId}`);
  }

  joinRoom(roomId: string): void {
    this.connect();
    this.socket?.emit('room:join', { roomId });
  }

  markReady(): void {
    const roomId = this.roomId();
    if (roomId) {
      this.socket?.emit('room:ready', { roomId });
    }
  }

  emitState(state: MatchState): void {
    const roomId = this.roomId();
    if (roomId) {
      this.socket?.emit('match:state', { roomId, state });
    }
  }

  emitFinished(stats: {
    score: number;
    maxCombo: number;
    accuracy: number;
    radiant: number;
    shinning: number;
    glimmer: number;
    shattered: number;
  }): void {
    const roomId = this.roomId();
    if (roomId) {
      this.socket?.emit('match:finished', { roomId, stats });
    }
  }
}
