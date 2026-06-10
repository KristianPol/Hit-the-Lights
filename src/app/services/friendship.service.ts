import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';

export interface SearchUserResult {
  id: number;
  username: string;
  profilePictureUrl?: string;
}

export interface FriendshipResult {
  id: number;
  requesterId: number;
  addresseeId: number;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  otherUser: SearchUserResult;
  initialMessage?: string;
}

export interface FriendActionResult {
  success: boolean;
  error?: string;
}

export interface SearchUsersResponse {
  success: boolean;
  users: SearchUserResult[];
  error?: string;
}

export interface FriendsListResponse {
  success: boolean;
  friends: FriendshipResult[];
  error?: string;
}

export interface PendingRequestsResponse {
  success: boolean;
  requests: FriendshipResult[];
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FriendshipService {
  private apiUrl = '/api/friends';

  constructor(private http: HttpClient) {}

  searchUsers(query: string, excludeUserId?: number): Observable<SearchUsersResponse> {
    let url = `${this.apiUrl}/search?q=${encodeURIComponent(query)}`;
    if (excludeUserId != null) {
      url += `&excludeUserId=${excludeUserId}`;
    }
    return this.http.get<SearchUsersResponse>(url).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to search users')))
    );
  }

  sendFriendRequest(addresseeId: number, initialMessage?: string): Observable<FriendActionResult & { friendshipId?: number }> {
    return this.http.post<FriendActionResult & { friendshipId?: number }>(`${this.apiUrl}/request`, {
      addresseeId,
      initialMessage
    }).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to send friend request')))
    );
  }

  acceptFriendRequest(friendshipId: number): Observable<FriendActionResult> {
    return this.http.post<FriendActionResult>(`${this.apiUrl}/accept`, { friendshipId }).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to accept friend request')))
    );
  }

  declineFriendRequest(friendshipId: number): Observable<FriendActionResult> {
    return this.http.post<FriendActionResult>(`${this.apiUrl}/decline`, { friendshipId }).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to decline friend request')))
    );
  }

  getFriends(userId: number): Observable<FriendsListResponse> {
    return this.http.get<FriendsListResponse>(`${this.apiUrl}/friends/${userId}`).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to load friends')))
    );
  }

  getPendingRequests(userId: number): Observable<PendingRequestsResponse> {
    return this.http.get<PendingRequestsResponse>(`${this.apiUrl}/pending/${userId}`).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to load pending requests')))
    );
  }

  getSentRequests(userId: number): Observable<PendingRequestsResponse> {
    return this.http.get<PendingRequestsResponse>(`${this.apiUrl}/sent/${userId}`).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to load sent requests')))
    );
  }

  removeFriend(userId: number, friendId: number): Observable<FriendActionResult> {
    return this.http.delete<FriendActionResult>(`${this.apiUrl}/${userId}/${friendId}`).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to remove friend')))
    );
  }
}
