import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { signal, computed } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, catchError, throwError, map } from 'rxjs';

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
  profilePictureUrl?: string;
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
  error?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:3000/api/auth';
  private readonly currentUserSignal = signal<User | null>(null);
  readonly currentUser$ = toObservable(this.currentUserSignal);
  private readonly loggedInSignal = computed(() => this.currentUserSignal() !== null);

  constructor(private http: HttpClient) {
    // Load user from localStorage on service initialization
    const storedUser = localStorage.getItem('currentUser');
    let user: User | null = null;
    if (storedUser) {
      user = JSON.parse(storedUser);
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
   * Login user
   */
  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, request).pipe(
      map(response => {
        if (response.success && response.user) {
          // Store user in localStorage and update subject
          localStorage.setItem('currentUser', JSON.stringify(response.user));
          this.currentUserSignal.set(response.user);
        }
        return response;
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
        if (response.success && response.userId) {
          // Create user object from registration data
          const user: User = {
            id: response.userId,
            username: request.username,
            profilePictureUrl: undefined
          };
          // Store user in localStorage and update subject
          localStorage.setItem('currentUser', JSON.stringify(user));
          this.currentUserSignal.set(user);
        }
        return response;
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
    this.currentUserSignal.set(null);
  }

  /**
   * Update profile picture
   */
  updateProfilePicture(userId: number, base64Image: string): Observable<UpdateProfilePictureResponse> {
    return this.http.post<UpdateProfilePictureResponse>(
      `${this.apiUrl}/profile-picture`,
      { userId, profilePictureBase64: base64Image }
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
          localStorage.setItem('currentUser', JSON.stringify(response.user));
          this.currentUserSignal.set(response.user);
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
   * Get profile picture URL for a user
   */
  getProfilePictureUrl(userId: number): string {
    return `${this.apiUrl}/profile-picture/${userId}`;
  }
}
