import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpParams } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';

export interface Song {
  id: number;
  name: string;
  author: string;
  bpm: number;
  length: string;
  songUrl: string;
  coverUrl: string;
  ownerId?: number | null;
  isPublic?: boolean;
  genre?: string | null;
  playCount?: number;
  likeCount?: number;
  isLikedByUser?: boolean;
  difficulties?: SongDifficulty[];
}

export interface SongDifficulty {
  id: number;
  difficulty: number;
  noteCount: number;
}

export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard' | 'Expert';

const DIFFICULTY_MAP: Record<DifficultyLevel, number> = {
  'Easy': 1,
  'Medium': 2,
  'Hard': 3,
  'Expert': 4
};

const REVERSE_DIFFICULTY_MAP: Record<number, DifficultyLevel> = {
  1: 'Easy',
  2: 'Medium',
  3: 'Hard',
  4: 'Expert'
};

export function difficultyNumberToName(num: number): DifficultyLevel {
  return REVERSE_DIFFICULTY_MAP[num] || 'Medium';
}

export function difficultyNameToNumber(name: DifficultyLevel): number {
  return DIFFICULTY_MAP[name];
}

export interface ChartNote {
  time: number;
  lane: number;
  type?: number;
  durationMs?: number | null;
}

export interface AddSongRequest {
  name: string;
  author: string;
  bpm: number;
  length: string;
  audioBase64: string;
  audioMimeType: string;
  coverBase64: string;
  coverMimeType: string;
  ownerId?: number | null;
  isPublic?: boolean;
  genre?: string | null;
}

export interface AddSongResponse {
  success: boolean;
  songId?: number;
  songUrl?: string;
  coverUrl?: string;
  ownerId?: number | null;
  isPublic?: boolean;
  error?: string;
  message?: string;
}

export interface GetSongsResponse {
  success: boolean;
  songs: Song[];
  error?: string;
}

export interface UpdateSongVisibilityRequest {
  ownerId: number;
  isPublic: boolean;
}

export interface UpdateSongVisibilityResponse {
  success: boolean;
  song?: Song;
  error?: string;
  message?: string;
}

export interface UploadedSongCountResponse {
  success: boolean;
  count: number;
  error?: string;
}

export interface GetDifficultiesResponse {
  success: boolean;
  difficulties?: SongDifficulty[];
  error?: string;
}

export interface AddDifficultyRequest {
  ownerId: number;
  difficulty: number;
  notes: ChartNote[];
}

export interface AddDifficultyResponse {
  success: boolean;
  difficulty?: SongDifficulty;
  error?: string;
  message?: string;
}

export interface LeaderboardEntry {
  position: number;
  userId: number;
  username: string;
  score: number;
  maxCombo: number;
  accuracy: number;
  date: string;
  isCurrentUser: boolean;
}

export interface GetLeaderboardResponse {
  success: boolean;
  songId: number;
  difficultyId: number;
  entries: LeaderboardEntry[];
  error?: string;
}

export interface SubmitLeaderboardRequest {
  userId: number;
  score: number;
  maxCombo: number;
  accuracy: number;
  date?: string;
}

export interface SubmitLeaderboardResponse {
  success: boolean;
  improved: boolean;
  entry?: LeaderboardEntry;
  error?: string;
}

export interface DifficultyChartNote {
  time: number;
  lane: number;
}

export interface DifficultyChart {
  metadata: {
    title: string;
    artist: string;
    bpm: number;
  };
  notes: DifficultyChartNote[];
}

export interface GetDifficultyChartResponse {
  success: boolean;
  songId: number;
  difficultyId: number;
  chart: DifficultyChart;
  error?: string;
}

export interface Comment {
  id: number;
  songId: number;
  senderId: number;
  senderUsername?: string;
  parentCommentId?: number | null;
  content: string;
  createdAt: string;
}

export interface GetCommentsResponse {
  success: boolean;
  comments?: Comment[];
  error?: string;
}

export interface PostCommentRequest {
  senderId: number;
  content: string;
  parentCommentId?: number | null;
}

export interface PostCommentResponse {
  success: boolean;
  comment?: Comment;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SongService {
  private apiUrl = '/api/songs';

  constructor(private http: HttpClient) {}

  private buildViewerParams(viewerId?: number): HttpParams {
    return viewerId == null ? new HttpParams() : new HttpParams().set('viewerId', viewerId.toString());
  }

  addSong(song: AddSongRequest): Observable<AddSongResponse> {
    return this.http.post<AddSongResponse>(`${this.apiUrl}/add`, song).pipe(
      catchError(error => {
        return throwError(
          () => new Error(error.error?.error || 'Failed to add song')
        );
      })
    );
  }

  getAllSongs(viewerId?: number, options?: { search?: string; genre?: string; sort?: string }): Observable<GetSongsResponse> {
    const endpoint = `${this.apiUrl}/all`;
    let params = this.buildViewerParams(viewerId);
    if (options?.search) {
      params = params.set('search', options.search);
    }
    if (options?.genre) {
      params = params.set('genre', options.genre);
    }
    if (options?.sort) {
      params = params.set('sort', options.sort);
    }
    console.log(`🌐 SongService: Fetching songs from ${endpoint}`);
    return this.http.get<GetSongsResponse>(endpoint, { params }).pipe(
      catchError(error => {
        console.error(`❌ SongService: Failed to fetch songs from ${endpoint}`, error);
        return throwError(
          () => new Error(error.error?.error || 'Failed to fetch songs')
        );
      })
    );
  }

  likeSong(songId: number, userId: number): Observable<{ success: boolean; message?: string; error?: string }> {
    return this.http.post<{ success: boolean; message?: string; error?: string }>(
      `${this.apiUrl}/${songId}/like`,
      { userId }
    ).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to like song')))
    );
  }

  unlikeSong(songId: number, userId: number): Observable<{ success: boolean; message?: string; error?: string }> {
    return this.http.delete<{ success: boolean; message?: string; error?: string }>(
      `${this.apiUrl}/${songId}/like`,
      { params: new HttpParams().set('userId', userId.toString()) }
    ).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to unlike song')))
    );
  }

  incrementPlayCount(songId: number): Observable<{ success: boolean; message?: string; error?: string }> {
    return this.http.post<{ success: boolean; message?: string; error?: string }>(
      `${this.apiUrl}/${songId}/play`,
      {}
    ).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to increment play count')))
    );
  }

  getSongById(id: number, viewerId?: number): Observable<{ success: boolean; song?: Song; error?: string }> {
    return this.http
      .get<{ success: boolean; song?: Song; error?: string }>(`${this.apiUrl}/${id}`, { params: this.buildViewerParams(viewerId) })
      .pipe(
        catchError(error => {
          return throwError(
            () => new Error(error.error?.error || 'Failed to fetch song')
          );
        })
      );
  }

  deleteSong(id: number, viewerId?: number): Observable<{ success: boolean; message?: string; error?: string }> {
    return this.http
      .delete<{ success: boolean; message?: string; error?: string }>(`${this.apiUrl}/${id}`, { params: this.buildViewerParams(viewerId) })
      .pipe(
        catchError(error => {
          return throwError(
            () => new Error(error.error?.error || 'Failed to delete song')
          );
        })
      );
  }

  updateSongVisibility(songId: number, request: UpdateSongVisibilityRequest): Observable<UpdateSongVisibilityResponse> {
    return this.http.patch<UpdateSongVisibilityResponse>(`${this.apiUrl}/${songId}/visibility`, request).pipe(
      catchError(error => {
        return throwError(
          () => new Error(error.error?.error || 'Failed to update song visibility')
        );
      })
    );
  }

  getUploadedSongCount(ownerId: number, viewerId?: number): Observable<UploadedSongCountResponse> {
    return this.http
      .get<UploadedSongCountResponse>(`${this.apiUrl}/count/${ownerId}`, { params: this.buildViewerParams(viewerId) })
      .pipe(
        catchError(error => {
          return throwError(
            () => new Error(error.error?.error || 'Failed to fetch uploaded song count')
          );
        })
      );
  }

  getSongDifficulties(songId: number, viewerId?: number): Observable<GetDifficultiesResponse> {
    return this.http
      .get<GetDifficultiesResponse>(`${this.apiUrl}/${songId}/difficulties`, { params: this.buildViewerParams(viewerId) })
      .pipe(
        catchError(error => {
          return throwError(
            () => new Error(error.error?.error || 'Failed to fetch difficulties')
          );
        })
      );
  }

  addSongDifficulty(songId: number, request: AddDifficultyRequest): Observable<AddDifficultyResponse> {
    return this.http
      .post<AddDifficultyResponse>(`${this.apiUrl}/${songId}/difficulties`, request)
      .pipe(
        catchError(error => {
          return throwError(
            () => new Error(error.error?.error || 'Failed to upload difficulty')
          );
        })
      );
  }

  getDifficultyLeaderboard(songId: number, difficultyId: number, viewerId?: number): Observable<GetLeaderboardResponse> {
    return this.http
      .get<GetLeaderboardResponse>(`${this.apiUrl}/${songId}/difficulties/${difficultyId}/leaderboard`, {
        params: this.buildViewerParams(viewerId)
      })
      .pipe(
        catchError(error => {
          return throwError(
            () => new Error(error.error?.error || 'Failed to fetch leaderboard')
          );
        })
      );
  }

  submitDifficultyHighscore(
    songId: number,
    difficultyId: number,
    request: SubmitLeaderboardRequest
  ): Observable<SubmitLeaderboardResponse> {
    return this.http
      .post<SubmitLeaderboardResponse>(`${this.apiUrl}/${songId}/difficulties/${difficultyId}/leaderboard`, request)
      .pipe(
        catchError(error => {
          return throwError(
            () => new Error(error.error?.error || 'Failed to submit score')
          );
        })
      );
  }

  getDifficultyChart(songId: number, difficultyId: number, viewerId?: number): Observable<GetDifficultyChartResponse> {
    return this.http
      .get<GetDifficultyChartResponse>(`${this.apiUrl}/${songId}/difficulties/${difficultyId}/chart`, {
        params: this.buildViewerParams(viewerId)
      })
      .pipe(
        catchError(error => {
          return throwError(
            () => new Error(error.error?.error || 'Failed to fetch chart')
          );
        })
      );
  }

  getComments(songId: number, viewerId?: number): Observable<GetCommentsResponse> {
    const params = viewerId == null ? new HttpParams() : new HttpParams().set('viewerId', viewerId.toString());
    return this.http.get<GetCommentsResponse>(`${this.apiUrl}/${songId}/comments`, { params }).pipe(
      catchError(error => {
        return throwError(() => new Error(error.error?.error || 'Failed to fetch comments'));
      })
    );
  }

  postComment(songId: number, request: PostCommentRequest): Observable<PostCommentResponse> {
    return this.http.post<PostCommentResponse>(`${this.apiUrl}/${songId}/comments`, request).pipe(
      catchError(error => {
        return throwError(() => new Error(error.error?.error || 'Failed to post comment'));
      })
    );
  }
}
