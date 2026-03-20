import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';

export interface Song {
  id: number;
  name: string;
  author: string;
  bpm: number;
  length: string;
  songUrl: string;
  coverUrl: string;
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
}

export interface AddSongResponse {
  success: boolean;
  songId?: number;
  songUrl?: string;
  coverUrl?: string;
  error?: string;
  message?: string;
}

export interface GetSongsResponse {
  success: boolean;
  songs: Song[];
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SongService {
  private apiUrl = 'http://localhost:3000/api/songs';

  constructor(private http: HttpClient) {}

  addSong(song: AddSongRequest): Observable<AddSongResponse> {
    return this.http.post<AddSongResponse>(`${this.apiUrl}/add`, song).pipe(
      catchError(error => {
        return throwError(
          () => new Error(error.error?.error || 'Failed to add song')
        );
      })
    );
  }

  getAllSongs(): Observable<GetSongsResponse> {
    const endpoint = `${this.apiUrl}/all`;
    console.log(`🌐 SongService: Fetching songs from ${endpoint}`);
    return this.http.get<GetSongsResponse>(endpoint).pipe(
      catchError(error => {
        console.error(`❌ SongService: Failed to fetch songs from ${endpoint}`, error);
        return throwError(
          () => new Error(error.error?.error || 'Failed to fetch songs')
        );
      })
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
}
