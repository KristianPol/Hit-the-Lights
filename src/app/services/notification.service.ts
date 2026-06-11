import { Injectable, signal } from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { AuthService } from './auth.service';
import { MessageService, ConversationPreview } from './message.service';

export interface Toast {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'message' | 'error';
  duration: number;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly toastsSignal = signal<Toast[]>([]);
  readonly toasts = this.toastsSignal.asReadonly();

  private toastIdCounter = 0;
  private messagePollSubscription: Subscription | null = null;
  private lastConversations: Map<number, number> = new Map(); // conversation otherUserId -> last message id
  private lastUnreadCount = 0;

  constructor(
    private authService: AuthService,
    private messageService: MessageService
  ) {
    this.startMessagePolling();
  }

  showToast(title: string, message: string, type: Toast['type'] = 'info', duration = 5000): void {
    const id = ++this.toastIdCounter;
    const toast: Toast = { id, title, message, type, duration };
    this.toastsSignal.update(current => [...current, toast]);

    if (duration > 0) {
      setTimeout(() => this.dismissToast(id), duration);
    }
  }

  dismissToast(id: number): void {
    this.toastsSignal.update(current => current.filter(t => t.id !== id));
  }

  private startMessagePolling(): void {
    // Poll every 8 seconds for new messages when logged in
    this.messagePollSubscription = interval(8000).subscribe(() => {
      this.checkForNewMessages();
    });

    // Initial check after a short delay to let auth state settle
    setTimeout(() => this.checkForNewMessages(), 2000);
  }

  private checkForNewMessages(): void {
    const user = this.authService.currentUser;
    if (!user) {
      this.lastConversations.clear();
      this.lastUnreadCount = 0;
      return;
    }

    this.messageService.getConversations(user.id).subscribe({
      next: response => {
        if (!response.success || !response.conversations) {
          return;
        }

        const conversations = response.conversations;

        // Check for new unread messages
        const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
        const hadUnreadBefore = this.lastUnreadCount;
        this.lastUnreadCount = totalUnread;

        if (totalUnread > hadUnreadBefore && hadUnreadBefore >= 0) {
          // Find conversations with new unread messages
          for (const conv of conversations) {
            if (conv.unreadCount > 0) {
              const prevLastMsgId = this.lastConversations.get(conv.otherUserId);
              const currentLastMsgId = conv.lastMessage.id;

              if (prevLastMsgId !== undefined && currentLastMsgId > prevLastMsgId) {
                // New message in this conversation
                const preview = conv.lastMessage.content.slice(0, 60);
                this.showToast(
                  conv.otherUsername,
                  preview,
                  'message',
                  6000
                );
              }
            }
            this.lastConversations.set(conv.otherUserId, conv.lastMessage.id);
          }
        } else {
          // Just update tracking without showing toasts
          for (const conv of conversations) {
            this.lastConversations.set(conv.otherUserId, conv.lastMessage.id);
          }
        }
      },
      error: () => {
        // Silently ignore polling errors
      }
    });
  }
}
