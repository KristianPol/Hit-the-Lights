import { Component, OnInit, OnDestroy, signal, ViewChild, ElementRef } from '@angular/core';
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
import { SongService } from '../../app/services/song.service';
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
  private currentUserSignal = signal<User | null>(null);
  get currentUser(): User | null { return this.currentUserSignal(); }
  set currentUser(v: User | null) { this.currentUserSignal.set(v); }
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
  private authSubscription: Subscription | null = null;

  @ViewChild('messagesScroll') messagesScrollRef!: ElementRef<HTMLDivElement>;
  @ViewChild('messageInput') messageInputRef!: ElementRef<HTMLInputElement>;

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
    private songService: SongService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // subscribe to auth changes so the view updates when user logs in/out
    this.currentUser = this.authService.currentUser;
    this.authSubscription = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });

    if (!this.currentUser) {
      this.router.navigate(['/login']);
      return;
    }

    this.loadAllData();

    // Auto-refresh conversations and chat every 3 seconds
    this.refreshSubscription = interval(3000).subscribe(() => {
      this.refreshData();
    });

    // Check if we should open a specific chat from navigation state
    const openChatWith = window.history.state?.openChatWith as number | undefined;
    if (openChatWith) {
      setTimeout(() => this.tryOpenChatWith(openChatWith), 500);
    }
  }

  private tryOpenChatWith(userId: number): void {
    // First check conversations
    const conv = this.conversations().find(c => c.otherUserId === userId);
    if (conv) {
      this.selectConversation(conv);
      return;
    }
    // Then check friends
    const friend = this.friends().find(f => f.otherUser.id === userId);
    if (friend) {
      this.selectFriend(friend);
      return;
    }
    // If not found yet, wait for data to load and retry once
    setTimeout(() => {
      const retryConv = this.conversations().find(c => c.otherUserId === userId);
      if (retryConv) {
        this.selectConversation(retryConv);
        return;
      }
      const retryFriend = this.friends().find(f => f.otherUser.id === userId);
      if (retryFriend) {
        this.selectFriend(retryFriend);
      }
    }, 800);
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
    this.authSubscription?.unsubscribe();
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
    this.friendshipService.sendFriendRequest(addresseeId).subscribe({
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

    this.friendshipService.sendFriendRequest(target.id, content).subscribe({
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
    this.friendshipService.acceptFriendRequest(friendshipId).subscribe({
      next: response => {
        if (response.success) {
          this.loadAllData();
        }
      }
    });
  }

  declineRequest(friendshipId: number): void {
    if (!this.currentUser) return;
    this.friendshipService.declineFriendRequest(friendshipId).subscribe({
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
            this.messageService.markAsRead(unreadIds).subscribe();
          }
          this.messageService.markConversationAsRead(otherUserId, this.currentUser!.id).subscribe();
          setTimeout(() => this.scrollToBottom(), 0);
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

    this.messageService.sendMessage(receiverId, content).subscribe({
      next: response => {
        if (response.success) {
          this.newMessageContent.set('');
          this.loadChat(receiverId, false);
          this.loadConversations();
          setTimeout(() => this.scrollToBottom(), 0);
        } else {
          this.chatError.set(response.error || 'Failed to send message');
        }
        this.sendingMessage.set(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.messageInputRef?.nativeElement?.focus();
          });
        });
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

  goToProfile(userId: number): void {
    this.router.navigate(['/profile', userId]);
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

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = this.messagesScrollRef?.nativeElement;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      }, 50);
    });
  }

  isScoreShareMessage(content: string): boolean {
    return content.startsWith('Score Share');
  }

  parseScoreShare(content: string): { lines: string[]; coverUrl: string | null; songId: number | null; difficultyId: number | null } {
    const lines = content.split('\n');
    let coverUrl: string | null = null;
    let songId: number | null = null;
    let difficultyId: number | null = null;
    const filteredLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('Cover: ')) {
        coverUrl = line.slice('Cover: '.length).trim();
      } else if (line.startsWith('Song ID: ')) {
        const parsed = Number(line.slice('Song ID: '.length).trim());
        if (Number.isFinite(parsed) && parsed > 0) songId = parsed;
      } else if (line.startsWith('Difficulty ID: ')) {
        const parsed = Number(line.slice('Difficulty ID: '.length).trim());
        if (Number.isFinite(parsed) && parsed > 0) difficultyId = parsed;
      } else {
        filteredLines.push(line);
      }
    }
    return { lines: filteredLines, coverUrl, songId, difficultyId };
  }

  canChallenge(content: string): boolean {
    const share = this.parseScoreShare(content);
    return share.songId != null && share.difficultyId != null;
  }

  challengeFriend(content: string, senderId: number): void {
    const share = this.parseScoreShare(content);
    if (!share.songId || !share.difficultyId) return;

    const viewerId = this.authService.currentUser?.id ?? undefined;
    this.songService.getSongById(share.songId, viewerId).subscribe({
      next: response => {
        if (response.success && response.song) {
          this.router.navigate(['/gameplay'], {
            state: {
              song: response.song,
              difficultyId: share.difficultyId,
              challengeFrom: senderId
            }
          });
        }
      },
      error: err => console.warn('Failed to load song for challenge:', err)
    });
  }
}
