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

export type DifficultyLevel =
  | 'Easy' | 'Normal' | 'Hard' | 'Expert' | 'Master'
  | 'Lunatic' | 'Insane' | 'Extreme' | 'Nightmare' | 'Impossible';

const DIFFICULTY_MAP: Record<DifficultyLevel, number> = {
  'Easy': 1,
  'Normal': 2,
  'Hard': 3,
  'Expert': 4,
  'Master': 5,
  'Lunatic': 6,
  'Insane': 7,
  'Extreme': 8,
  'Nightmare': 9,
  'Impossible': 10
};

const REVERSE_DIFFICULTY_MAP: Record<number, DifficultyLevel> = {
  1: 'Easy',
  2: 'Normal',
  3: 'Hard',
  4: 'Expert',
  5: 'Master',
  6: 'Lunatic',
  7: 'Insane',
  8: 'Extreme',
  9: 'Nightmare',
  10: 'Impossible'
};

export function difficultyNumberToName(num: number): DifficultyLevel {
  return REVERSE_DIFFICULTY_MAP[num] || 'Normal';
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
  isPublic: boolean;
}

export interface UpdateSongVisibilityResponse {
  success: boolean;
  song?: Song;
  error?: string;
  message?: string;
}

export interface UpdateSongRequest {
  name?: string;
  author?: string;
  bpm?: number;
  length?: string;
  genre?: string | null;
  isPublic?: boolean;
  audioBase64?: string;
  audioMimeType?: string;
  coverBase64?: string;
  coverMimeType?: string;
}

export interface UpdateSongResponse {
  success: boolean;
  song?: Song;
  error?: string;
  message?: string;
}

export interface DeleteDifficultyResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface UpdateDifficultyResponse {
  success: boolean;
  difficulty?: SongDifficulty;
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

  private buildViewerParams(): HttpParams {
    return new HttpParams();
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

  getUploadStatus(): Observable<{ success: boolean; canUpload: boolean; remainingSeconds?: number; error?: string }> {
    return this.http.get<{ success: boolean; canUpload: boolean; remainingSeconds?: number; error?: string }>(`${this.apiUrl}/upload-status`).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to check upload status')))
    );
  }

  getAllSongs(options?: { search?: string; genre?: string; sort?: string; ownerId?: number }): Observable<GetSongsResponse> {
    const endpoint = `${this.apiUrl}/all`;
    let params = new HttpParams();
    if (options?.search) {
      params = params.set('search', options.search);
    }
    if (options?.genre) {
      params = params.set('genre', options.genre);
    }
    if (options?.sort) {
      params = params.set('sort', options.sort);
    }
    if (options?.ownerId != null) {
      params = params.set('ownerId', options.ownerId.toString());
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

  likeSong(songId: number): Observable<{ success: boolean; message?: string; error?: string }> {
    return this.http.post<{ success: boolean; message?: string; error?: string }>(
      `${this.apiUrl}/${songId}/like`,
      {}
    ).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to like song')))
    );
  }

  unlikeSong(songId: number): Observable<{ success: boolean; message?: string; error?: string }> {
    return this.http.delete<{ success: boolean; message?: string; error?: string }>(
      `${this.apiUrl}/${songId}/like`
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

  getSongById(id: number): Observable<{ success: boolean; song?: Song; error?: string }> {
    return this.http
      .get<{ success: boolean; song?: Song; error?: string }>(`${this.apiUrl}/${id}`)
      .pipe(
        catchError(error => {
          return throwError(
            () => new Error(error.error?.error || 'Failed to fetch song')
          );
        })
      );
  }

  deleteSong(id: number): Observable<{ success: boolean; message?: string; error?: string }> {
    return this.http
      .delete<{ success: boolean; message?: string; error?: string }>(`${this.apiUrl}/${id}`)
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

  updateSong(songId: number, request: UpdateSongRequest): Observable<UpdateSongResponse> {
    return this.http.patch<UpdateSongResponse>(`${this.apiUrl}/${songId}`, request).pipe(
      catchError(error => {
        return throwError(
          () => new Error(error.error?.error || 'Failed to update song')
        );
      })
    );
  }

  deleteDifficulty(songId: number, difficultyId: number): Observable<DeleteDifficultyResponse> {
    return this.http
      .delete<DeleteDifficultyResponse>(`${this.apiUrl}/${songId}/difficulties/${difficultyId}`)
      .pipe(
        catchError(error => {
          return throwError(
            () => new Error(error.error?.error || 'Failed to delete difficulty')
          );
        })
      );
  }

  updateDifficulty(
    songId: number,
    difficultyId: number,
    request: AddDifficultyRequest
  ): Observable<UpdateDifficultyResponse> {
    return this.http
      .put<UpdateDifficultyResponse>(`${this.apiUrl}/${songId}/difficulties/${difficultyId}`, request)
      .pipe(
        catchError(error => {
          return throwError(
            () => new Error(error.error?.error || 'Failed to update difficulty')
          );
        })
      );
  }

  getUploadedSongCount(ownerId: number): Observable<UploadedSongCountResponse> {
    return this.http
      .get<UploadedSongCountResponse>(`${this.apiUrl}/count/${ownerId}`)
      .pipe(
        catchError(error => {
          return throwError(
            () => new Error(error.error?.error || 'Failed to fetch uploaded song count')
          );
        })
      );
  }

  getSongDifficulties(songId: number): Observable<GetDifficultiesResponse> {
    return this.http
      .get<GetDifficultiesResponse>(`${this.apiUrl}/${songId}/difficulties`)
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

  getDifficultyLeaderboard(songId: number, difficultyId: number): Observable<GetLeaderboardResponse> {
    return this.http
      .get<GetLeaderboardResponse>(`${this.apiUrl}/${songId}/difficulties/${difficultyId}/leaderboard`)
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

  getDifficultyChart(songId: number, difficultyId: number): Observable<GetDifficultyChartResponse> {
    return this.http
      .get<GetDifficultyChartResponse>(`${this.apiUrl}/${songId}/difficulties/${difficultyId}/chart`)
      .pipe(
        catchError(error => {
          return throwError(
            () => new Error(error.error?.error || 'Failed to fetch chart')
          );
        })
      );
  }

  getComments(songId: number): Observable<GetCommentsResponse> {
    return this.http.get<GetCommentsResponse>(`${this.apiUrl}/${songId}/comments`).pipe(
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
