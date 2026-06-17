import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { signal, computed } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, catchError, throwError, map, tap } from 'rxjs';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface User {
  id: number;
  username: string;
  joinDate?: string;
  profilePictureUrl?: string;
  playtimeSeconds?: number;
  gamesPlayed?: number;
  role?: string;
  isBanned?: boolean;
  bio?: string | null;
  location?: string | null;
  favoriteGenre?: string | null;
  githubUrl?: string | null;
  osuUrl?: string | null;
  robloxUrl?: string | null;
  discordUrl?: string | null;
  youtubeUrl?: string | null;
  twitchUrl?: string | null;
  totalSp?: number;
  lastLoginDate?: string;
  loginStreak?: number;
  longestStreak?: number;
}

export interface UpdateProfileRequest {
  bio?: string | null;
  location?: string | null;
  favoriteGenre?: string | null;
  githubUrl?: string | null;
  osuUrl?: string | null;
  robloxUrl?: string | null;
  discordUrl?: string | null;
  youtubeUrl?: string | null;
  twitchUrl?: string | null;
}

export interface UpdateProfilePictureResponse {
  success: boolean;
  profilePictureUrl?: string;
  error?: string;
  message?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  userId?: number;
  token?: string;
  error?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = '/api/auth';
  private readonly currentUserSignal = signal<User | null>(null);
  readonly currentUser$ = toObservable(this.currentUserSignal);
  private readonly loggedInSignal = computed(() => this.currentUserSignal() !== null);

  constructor(private http: HttpClient) {
    // Load user from localStorage on service initialization
    const storedUser = localStorage.getItem('currentUser');
    let user: User | null = null;
    if (storedUser) {
      user = this.normalizeUser(JSON.parse(storedUser));
    }
    this.currentUserSignal.set(user);
  }

  /**
   * Get current user value (synchronous)
   */
  public get currentUser(): User | null {
    return this.currentUserSignal();
  }

  /**
   * Check if user is logged in
   */
  public get isLoggedIn(): boolean {
    return this.loggedInSignal();
  }

  /**
   * Check if current user is admin
   */
  public get isAdmin(): boolean {
    const user = this.currentUserSignal();
    return user?.id === 2 || user?.role === 'admin';
  }

  /**
   * Get stored JWT token
   */
  public getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('authToken');
  }

  /**
   * Login user
   */
  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, request).pipe(
      map(response => {
        if (response.success && response.user) {
          // Store user in localStorage and update subject
          const normalized = this.normalizeUser(response.user);
          localStorage.setItem('currentUser', JSON.stringify(normalized));
          if (response.token) {
            localStorage.setItem('authToken', response.token);
          }
          this.currentUserSignal.set(normalized);
        }
        return response;
      }),
      tap(response => {
        if (response.success && response.user?.id) {
          this.refreshUser(response.user.id).subscribe({
            error: err => console.warn('Failed to refresh user after login:', err)
          });
        }
      }),
      catchError(error => {
        return throwError(() => new Error(error.error?.error || 'Login failed'));
      })
    );
  }

  /**
   * Register new user
   */
  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, request).pipe(
      map(response => {
        if (response.success && (response.user || response.userId)) {
          const user: User = response.user ?? {
            id: response.userId!,
            username: request.username,
            profilePictureUrl: undefined,
            joinDate: new Date().toISOString()
          };
          // Store user in localStorage and update subject
          const normalized = this.normalizeUser(user);
          localStorage.setItem('currentUser', JSON.stringify(normalized));
          if (response.token) {
            localStorage.setItem('authToken', response.token);
          }
          this.currentUserSignal.set(normalized);
        }
        return response;
      }),
      tap(response => {
        const userId = response.user?.id ?? response.userId;
        if (response.success && userId) {
          this.refreshUser(userId).subscribe({
            error: err => console.warn('Failed to refresh user after registration:', err)
          });
        }
      }),
      catchError(error => {
        return throwError(() => new Error(error.error?.error || 'Registration failed'));
      })
    );
  }

  /**
   * Logout user
   */
  logout(): void {
    // Remove user from localStorage and update subject
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    this.currentUserSignal.set(null);
  }

  /**
   * Update profile picture
   */
  updateProfilePicture(userId: number, base64Image: string): Observable<UpdateProfilePictureResponse> {
    return this.http.post<UpdateProfilePictureResponse>(
      `${this.apiUrl}/profile-picture`,
      { profilePictureBase64: base64Image }
    ).pipe(
      map(response => {
        console.log('updateProfilePicture response:', response);
        if (response.success && response.profilePictureUrl) {
          // Update current user with new profile picture URL
          const currentUser = this.currentUser;
          if (currentUser && currentUser.id === userId) {
            const updatedUser: User = {
              ...currentUser,
              profilePictureUrl: response.profilePictureUrl
            };
            console.log('Updating user in localStorage:', updatedUser);
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));
            this.currentUserSignal.set(updatedUser);
          }
        }
        return response;
      }),
      catchError(error => {
        console.error('updateProfilePicture error:', error);
        return throwError(() => new Error(error.error?.error || 'Failed to update profile picture'));
      })
    );
  }

  updateProfile(request: UpdateProfileRequest): Observable<{ success: boolean; user?: User; error?: string }> {
    return this.http.patch<{ success: boolean; user?: User; error?: string }>(
      `${this.apiUrl}/profile`,
      request
    ).pipe(
      map(response => {
        if (response.success && response.user) {
          const user = this.normalizeUser(response.user);
          const currentUser = this.currentUser;
          if (currentUser && currentUser.id === user.id) {
            const merged: User = { ...(currentUser ?? {}), ...user };
            localStorage.setItem('currentUser', JSON.stringify(merged));
            this.currentUserSignal.set(merged);
          }
          return { success: true, user };
        }
        return response;
      }),
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to update profile')))
    );
  }

  /**
   * Refresh user data from server
   */
  refreshUser(userId: number): Observable<AuthResponse> {
    return this.http.get<{ success: boolean; user?: User; error?: string }>(
      `${this.apiUrl}/user/${userId}`
    ).pipe(
      map(response => {
        console.log('refreshUser response:', response);
        if (response.success && response.user) {
          // Preserve existing stored user fields where backend may not return them
          const existing = this.currentUser;
          const merged: User = {
            ...(existing ?? {}),
            ...response.user
          } as User;
          localStorage.setItem('currentUser', JSON.stringify(merged));
          this.currentUserSignal.set(merged);
          return { success: true, user: response.user };
        }
        return { success: false, error: response.error };
      }),
      catchError(error => {
        console.error('refreshUser error:', error);
        return throwError(() => new Error(error.error?.error || 'Failed to refresh user'));
      })
    );
  }

  /**
   * Add playtime seconds to user's total on server. Updates local user on success.
   */
  addPlaytime(userId: number, seconds: number) {
    return this.http.post<{ success: boolean; playtimeSeconds?: number; error?: string }>(
      `${this.apiUrl}/playtime`,
      { seconds }
    ).pipe(
      map(response => {
        if (response.success && typeof response.playtimeSeconds === 'number') {
          const current = this.currentUser;
          if (current && current.id === userId) {
            const updated: User = this.normalizeUser({ ...current, playtimeSeconds: response.playtimeSeconds });
            localStorage.setItem('currentUser', JSON.stringify(updated));
            this.currentUserSignal.set(updated);
          }
        }
        return response;
      })
    );
  }

  /**
   * Submit per-run gameplay statistics for the given user
   */
  submitRunStats(userId: number, payload: { perfect?: number; good?: number; glimmer?: number; miss?: number; score?: number; accuracy?: number; date?: string }) {
    return this.http.post<{ success: boolean; error?: string }>(`${this.apiUrl}/user/${userId}/run`, payload).pipe(
      catchError(error => {
        return throwError(() => new Error(error.error?.error || 'Failed to submit run stats'));
      })
    );
  }

  /**
   * Fetch aggregated analytics for a user
   */
  getAnalytics(userId: number) {
    return this.http.get<{ success: boolean; analytics?: any; error?: string }>(`${this.apiUrl}/user/${userId}/analytics`).pipe(
      catchError(error => {
        return throwError(() => new Error(error.error?.error || 'Failed to fetch analytics'));
      })
    );
  }

  /**
   * Get public user data by ID (does not update current user)
   */
  getUserById(userId: number): Observable<{ success: boolean; user?: User; error?: string }> {
    return this.http.get<{ success: boolean; user?: User; error?: string }>(
      `${this.apiUrl}/user/${userId}`
    ).pipe(
      map(response => {
        if (response.success && response.user) {
          return { success: true, user: this.normalizeUser(response.user) };
        }
        return response;
      }),
      catchError(error => {
        return throwError(() => new Error(error.error?.error || 'Failed to fetch user'));
      })
    );
  }

  // ─── Admin Endpoints ──────────────────────────────────────

  getAllUsers(search?: string): Observable<{ success: boolean; users?: Array<{ id: number; username: string; joinDate: string; role: string; isBanned: boolean }>; error?: string }> {
    let params = new HttpParams();
    if (search) {
      params = params.set('search', search);
    }
    return this.http.get<any>(`${this.apiUrl}/users`, { params }).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to fetch users')))
    );
  }

  grantAdmin(userId: number): Observable<{ success: boolean; message?: string; error?: string }> {
    return this.http.post<any>(`${this.apiUrl}/grant-admin`, { userId }).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to grant admin')))
    );
  }

  revokeAdmin(userId: number): Observable<{ success: boolean; message?: string; error?: string }> {
    return this.http.post<any>(`${this.apiUrl}/revoke-admin`, { userId }).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to revoke admin')))
    );
  }

  banUser(userId: number): Observable<{ success: boolean; message?: string; error?: string }> {
    return this.http.post<any>(`${this.apiUrl}/ban`, { userId }).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to ban user')))
    );
  }

  unbanUser(userId: number): Observable<{ success: boolean; message?: string; error?: string }> {
    return this.http.post<any>(`${this.apiUrl}/unban`, { userId }).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to unban user')))
    );
  }

  resetPassword(currentPassword: string, newPassword: string): Observable<{ success: boolean; message?: string; error?: string }> {
    return this.http.post<any>(`${this.apiUrl}/reset-password`, { currentPassword, newPassword }).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to reset password')))
    );
  }

  private normalizeUser(user: User): User {
    return {
      ...user,
      id: Number(user.id),
      playtimeSeconds: typeof user.playtimeSeconds === 'number' ? user.playtimeSeconds : undefined
    };
  }

  /**
   * Get profile picture URL for a user
   */
  getProfilePictureUrl(userId: number): string {
    return `${this.apiUrl}/profile-picture/${userId}`;
  }
}
