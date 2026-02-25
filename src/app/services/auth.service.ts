import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, catchError, throwError, map } from 'rxjs';

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
  private currentUserSubject: BehaviorSubject<User | null>;
  public currentUser$: Observable<User | null>;

  constructor(private http: HttpClient) {
    // Load user from localStorage on service initialization
    const storedUser = localStorage.getItem('currentUser');
    this.currentUserSubject = new BehaviorSubject<User | null>(
      storedUser ? JSON.parse(storedUser) : null
    );
    this.currentUser$ = this.currentUserSubject.asObservable();
  }

  /**
   * Get current user value (synchronous)
   */
  public get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Check if user is logged in
   */
  public get isLoggedIn(): boolean {
    return this.currentUserSubject.value !== null;
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
          this.currentUserSubject.next(response.user);
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
            username: request.username
          };
          // Store user in localStorage and update subject
          localStorage.setItem('currentUser', JSON.stringify(user));
          this.currentUserSubject.next(user);
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
    this.currentUserSubject.next(null);
  }
}
