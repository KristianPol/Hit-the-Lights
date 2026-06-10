import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';

export interface MessageResult {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  createdAt: string;
  isRead: boolean;
}

export interface ConversationPreview {
  otherUserId: number;
  otherUsername: string;
  otherUserProfilePictureUrl?: string;
  lastMessage: MessageResult;
  unreadCount: number;
}

export interface SendMessageResponse {
  success: boolean;
  messageId?: number;
  error?: string;
}

export interface ConversationResponse {
  success: boolean;
  messages: MessageResult[];
  error?: string;
}

export interface ConversationsResponse {
  success: boolean;
  conversations: ConversationPreview[];
  error?: string;
}

export interface UnreadCountResponse {
  success: boolean;
  count: number;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  private apiUrl = '/api/messages';

  constructor(private http: HttpClient) {}

  sendMessage(receiverId: number, content: string): Observable<SendMessageResponse> {
    return this.http.post<SendMessageResponse>(`${this.apiUrl}/send`, {
      receiverId,
      content
    }).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to send message')))
    );
  }

  getConversation(userId: number, otherUserId: number): Observable<ConversationResponse> {
    return this.http.get<ConversationResponse>(`${this.apiUrl}/conversation/${userId}/${otherUserId}`).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to load conversation')))
    );
  }

  getConversations(userId: number): Observable<ConversationsResponse> {
    return this.http.get<ConversationsResponse>(`${this.apiUrl}/conversations/${userId}`).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to load conversations')))
    );
  }

  markAsRead(messageIds: number[]): Observable<{ success: boolean; error?: string }> {
    return this.http.post<{ success: boolean; error?: string }>(`${this.apiUrl}/read`, {
      messageIds
    }).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to mark messages as read')))
    );
  }

  markConversationAsRead(senderId: number, receiverId: number): Observable<{ success: boolean; error?: string }> {
    return this.http.post<{ success: boolean; error?: string }>(`${this.apiUrl}/read-conversation`, {
      senderId,
      receiverId
    }).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to mark conversation as read')))
    );
  }

  getUnreadCount(userId: number): Observable<UnreadCountResponse> {
    return this.http.get<UnreadCountResponse>(`${this.apiUrl}/unread/${userId}`).pipe(
      catchError(error => throwError(() => new Error(error.error?.error || 'Failed to get unread count')))
    );
  }
}
