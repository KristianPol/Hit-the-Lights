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
  songUrl: string;
  coverUrl: string;
}

export interface AddSongResponse {
  success: boolean;
  songId?: number;
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

  /**
   * Add a new song to the database
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addSong(song: AddSongRequest): Observable<AddSongResponse> {
    return this.http.post<AddSongResponse>(`${this.apiUrl}/add`, song).pipe(
      catchError(error => {
        return throwError(
          () => new Error(error.error?.error || 'Failed to add song')
        );
      })
    );
  }

  /**
   * Get all songs from the database
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getAllSongs(): Observable<GetSongsResponse> {
    return this.http.get<GetSongsResponse>(`${this.apiUrl}/all`).pipe(
      catchError(error => {
        return throwError(
          () => new Error(error.error?.error || 'Failed to fetch songs')
        );
      })
    );
  }

  /**
   * Get a specific song by ID
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
}

