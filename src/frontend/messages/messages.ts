import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService, User } from '../../app/services/auth.service';
import {
  FriendshipService,
  SearchUserResult,
  FriendshipResult
} from '../../app/services/friendship.service';
import {
  MessageService,
  MessageResult,
  ConversationPreview
} from '../../app/services/message.service';
import { Subscription, interval } from 'rxjs';

type TabType = 'conversations' | 'friends' | 'requests';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [RouterModule, FormsModule, CommonModule],
  templateUrl: './messages.html',
  styleUrls: ['./messages.scss']
})
export class Messages implements OnInit, OnDestroy {
  currentUser: User | null = null;
  activeTab = signal<TabType>('conversations');
  searchQuery = signal('');
  searchResults = signal<SearchUserResult[]>([]);
  searching = signal(false);
  searchError = signal('');

  friends = signal<FriendshipResult[]>([]);
  pendingRequests = signal<FriendshipResult[]>([]);
  sentRequests = signal<FriendshipResult[]>([]);
  conversations = signal<ConversationPreview[]>([]);

  loadingFriends = signal(false);
  loadingRequests = signal(false);
  loadingConversations = signal(false);

  selectedFriend = signal<FriendshipResult | null>(null);
  selectedConversation = signal<ConversationPreview | null>(null);
  chatMessages = signal<MessageResult[]>([]);
  newMessageContent = signal('');
  sendingMessage = signal(false);
  chatError = signal('');
  loadingChat = signal(false);

  unreadCount = signal(0);
  requestMessageContent = signal('');
  showRequestForm = signal(false);
  requestTarget = signal<SearchUserResult | null>(null);

  private refreshSubscription: Subscription | null = null;

  get selectedOtherUserId(): number | null {
    const friend = this.selectedFriend();
    if (friend) {
      return friend.otherUser.id;
    }
    const conv = this.selectedConversation();
    if (conv) {
      return conv.otherUserId;
    }
    return null;
  }

  get selectedOtherUserName(): string | null {
    const friend = this.selectedFriend();
    if (friend) {
      return friend.otherUser.username;
    }
    const conv = this.selectedConversation();
    if (conv) {
      return conv.otherUsername;
    }
    return null;
  }

  get selectedOtherUserProfilePicture(): string | undefined {
    const friend = this.selectedFriend();
    if (friend) {
      return friend.otherUser.profilePictureUrl;
    }
    const conv = this.selectedConversation();
    if (conv) {
      return conv.otherUserProfilePictureUrl;
    }
    return undefined;
  }

  constructor(
    private authService: AuthService,
    private friendshipService: FriendshipService,
    private messageService: MessageService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.currentUser;
    if (!this.currentUser) {
      this.router.navigate(['/login']);
      return;
    }

    this.loadAllData();

    // Auto-refresh conversations and chat every 3 seconds
    this.refreshSubscription = interval(3000).subscribe(() => {
      this.refreshData();
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  private loadAllData(): void {
    this.loadFriends();
    this.loadPendingRequests();
    this.loadSentRequests();
    this.loadConversations();
    this.loadUnreadCount();
  }

  private refreshData(): void {
    if (!this.currentUser) return;

    // Refresh conversations silently
    this.messageService.getConversations(this.currentUser.id).subscribe({
      next: response => {
        if (response.success) {
          this.conversations.set(response.conversations);
        }
      }
    });

    // Refresh pending requests silently
    this.friendshipService.getPendingRequests(this.currentUser.id).subscribe({
      next: response => {
        if (response.success) {
          this.pendingRequests.set(response.requests);
        }
      }
    });

    // Refresh unread count
    this.loadUnreadCount();

    // Refresh chat if open
    const otherId = this.selectedOtherUserId;
    if (otherId != null) {
      this.loadChat(otherId, false);
    }
  }

  loadFriends(): void {
    if (!this.currentUser) return;
    this.loadingFriends.set(true);
    this.friendshipService.getFriends(this.currentUser.id).subscribe({
      next: response => {
        if (response.success) {
          this.friends.set(response.friends);
        }
        this.loadingFriends.set(false);
      },
      error: () => {
        this.loadingFriends.set(false);
      }
    });
  }

  loadPendingRequests(): void {
    if (!this.currentUser) return;
    this.loadingRequests.set(true);
    this.friendshipService.getPendingRequests(this.currentUser.id).subscribe({
      next: response => {
        if (response.success) {
          this.pendingRequests.set(response.requests);
        }
      }
    });
    this.friendshipService.getSentRequests(this.currentUser.id).subscribe({
      next: response => {
        if (response.success) {
          this.sentRequests.set(response.requests);
        }
        this.loadingRequests.set(false);
      },
      error: () => {
        this.loadingRequests.set(false);
      }
    });
  }

  loadSentRequests(): void {
    if (!this.currentUser) return;
    this.friendshipService.getSentRequests(this.currentUser.id).subscribe({
      next: response => {
        if (response.success) {
          this.sentRequests.set(response.requests);
        }
      }
    });
  }

  loadConversations(): void {
    if (!this.currentUser) return;
    this.loadingConversations.set(true);
    this.messageService.getConversations(this.currentUser.id).subscribe({
      next: response => {
        if (response.success) {
          this.conversations.set(response.conversations);
        }
        this.loadingConversations.set(false);
      },
      error: () => {
        this.loadingConversations.set(false);
      }
    });
  }

  loadUnreadCount(): void {
    if (!this.currentUser) return;
    this.messageService.getUnreadCount(this.currentUser.id).subscribe({
      next: response => {
        if (response.success) {
          this.unreadCount.set(response.count);
        }
      }
    });
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    if (value.trim().length >= 2) {
      this.performSearch(value.trim());
    } else {
      this.searchResults.set([]);
      this.searchError.set('');
    }
  }

  performSearch(query: string): void {
    if (!this.currentUser) return;
    this.searching.set(true);
    this.searchError.set('');
    this.friendshipService.searchUsers(query, this.currentUser.id).subscribe({
      next: response => {
        if (response.success) {
          this.searchResults.set(response.users);
        }
        this.searching.set(false);
      },
      error: err => {
        this.searchError.set(err.message || 'Search failed');
        this.searching.set(false);
      }
    });
  }

  sendFriendRequest(addresseeId: number): void {
    if (!this.currentUser) return;
    this.friendshipService.sendFriendRequest(this.currentUser.id, addresseeId).subscribe({
      next: response => {
        if (response.success) {
          this.loadSentRequests();
          this.searchResults.update(users => users.filter(u => u.id !== addresseeId));
        } else {
          this.searchError.set(response.error || 'Failed to send request');
        }
      },
      error: err => {
        this.searchError.set(err.message || 'Failed to send request');
      }
    });
  }

  openRequestForm(user: SearchUserResult): void {
    this.requestTarget.set(user);
    this.showRequestForm.set(true);
    this.requestMessageContent.set('');
    this.searchError.set('');
  }

  closeRequestForm(): void {
    this.showRequestForm.set(false);
    this.requestTarget.set(null);
    this.requestMessageContent.set('');
  }

  sendMessageRequest(): void {
    const target = this.requestTarget();
    const content = this.requestMessageContent().trim();
    if (!this.currentUser || !target || !content) return;

    this.friendshipService.sendFriendRequest(this.currentUser.id, target.id, content).subscribe({
      next: response => {
        if (response.success) {
          this.closeRequestForm();
          this.loadSentRequests();
          this.searchResults.update(users => users.filter(u => u.id !== target.id));
          this.activeTab.set('requests');
        } else {
          this.searchError.set(response.error || 'Failed to send request');
        }
      },
      error: err => {
        this.searchError.set(err.message || 'Failed to send request');
      }
    });
  }

  acceptRequest(friendshipId: number): void {
    if (!this.currentUser) return;
    this.friendshipService.acceptFriendRequest(friendshipId, this.currentUser.id).subscribe({
      next: response => {
        if (response.success) {
          this.loadAllData();
        }
      }
    });
  }

  declineRequest(friendshipId: number): void {
    if (!this.currentUser) return;
    this.friendshipService.declineFriendRequest(friendshipId, this.currentUser.id).subscribe({
      next: response => {
        if (response.success) {
          this.loadPendingRequests();
        }
      }
    });
  }

  removeFriend(friendId: number): void {
    if (!this.currentUser) return;
    this.friendshipService.removeFriend(this.currentUser.id, friendId).subscribe({
      next: () => {
        this.loadFriends();
        this.loadConversations();
        if (this.selectedOtherUserId === friendId) {
          this.closeChat();
        }
      }
    });
  }

  selectFriend(friend: FriendshipResult): void {
    this.selectedFriend.set(friend);
    this.selectedConversation.set(null);
    this.loadChat(friend.otherUser.id, true);
  }

  selectConversation(conversation: ConversationPreview): void {
    this.selectedConversation.set(conversation);
    this.selectedFriend.set(null);
    this.loadChat(conversation.otherUserId, true);
  }

  closeChat(): void {
    this.selectedFriend.set(null);
    this.selectedConversation.set(null);
    this.chatMessages.set([]);
    this.chatError.set('');
  }

  private loadChat(otherUserId: number, showLoading: boolean): void {
    if (!this.currentUser) return;
    if (showLoading) {
      this.loadingChat.set(true);
    }
    this.chatError.set('');

    this.messageService.getConversation(this.currentUser.id, otherUserId).subscribe({
      next: response => {
        if (response.success) {
          this.chatMessages.set(response.messages);
          const unreadIds = response.messages
            .filter(m => m.receiverId === this.currentUser!.id && !m.isRead)
            .map(m => m.id);
          if (unreadIds.length > 0) {
            this.messageService.markAsRead(unreadIds, this.currentUser!.id).subscribe();
          }
          this.messageService.markConversationAsRead(otherUserId, this.currentUser!.id).subscribe();
        }
        this.loadingChat.set(false);
      },
      error: err => {
        this.chatError.set(err.message || 'Failed to load conversation');
        this.loadingChat.set(false);
      }
    });
  }

  sendMessage(): void {
    const content = this.newMessageContent().trim();
    const receiverId = this.selectedOtherUserId;
    if (!this.currentUser || !content || receiverId == null) return;

    this.sendingMessage.set(true);
    this.chatError.set('');

    this.messageService.sendMessage(this.currentUser.id, receiverId, content).subscribe({
      next: response => {
        if (response.success) {
          this.newMessageContent.set('');
          this.loadChat(receiverId, false);
          this.loadConversations();
        } else {
          this.chatError.set(response.error || 'Failed to send message');
        }
        this.sendingMessage.set(false);
      },
      error: err => {
        this.chatError.set(err.message || 'Failed to send message');
        this.sendingMessage.set(false);
      }
    });
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  setTab(tab: TabType): void {
    this.activeTab.set(tab);
  }

  goBack(): void {
    this.router.navigate(['/menu']);
  }

  isFriend(userId: number): boolean {
    return this.friends().some(f => f.otherUser.id === userId);
  }

  startChatWithFriend(userId: number): void {
    const friend = this.friends().find(f => f.otherUser.id === userId);
    if (friend) {
      this.selectFriend(friend);
    }
  }

  hasPendingRequest(userId: number): boolean {
    return this.sentRequests().some(r => r.otherUser.id === userId);
  }

  formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  getUserDisplayName(userId: number): string {
    if (this.currentUser && this.currentUser.id === userId) {
      return 'You';
    }
    return this.selectedOtherUserName ?? 'Unknown';
  }
}
