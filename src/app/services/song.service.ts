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

@Injectable({
  providedIn: 'root'
})
export class SongService {
  private apiUrl = 'http://localhost:3000/api/songs';

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

  getAllSongs(viewerId?: number): Observable<GetSongsResponse> {
    const endpoint = `${this.apiUrl}/all`;
    console.log(`🌐 SongService: Fetching songs from ${endpoint}`);
    return this.http.get<GetSongsResponse>(endpoint, { params: this.buildViewerParams(viewerId) }).pipe(
      catchError(error => {
        console.error(`❌ SongService: Failed to fetch songs from ${endpoint}`, error);
        return throwError(
          () => new Error(error.error?.error || 'Failed to fetch songs')
        );
      })
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
}
