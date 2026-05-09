import { Unit } from '../database/unit';

function getLocalTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export interface SearchUserResult {
  id: number;
  username: string;
  profilePictureUrl?: string;
}

export interface FriendRequestResult {
  success: boolean;
  friendshipId?: number;
  error?: string;
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

export class FriendshipService {
  constructor(private unit: Unit) {}

  /**
   * Search users by username or exact id
   */
  public searchUsers(query: string, excludeUserId?: number): SearchUserResult[] {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const isNumeric = /^\d+$/.test(trimmed);

    if (isNumeric) {
      // Search by exact ID or username contains
      const stmt = this.unit.prepare<
        { id: number; username: string; profilePicture: Buffer | null },
        { query: string; idQuery: number; excludeId: number | null }
      >(
        `SELECT id, username, profilePicture FROM User
         WHERE (id = $idQuery OR username LIKE '%' || $query || '%')
         AND ($excludeId IS NULL OR id != $excludeId)
         LIMIT 20`,
        { query: trimmed, idQuery: parseInt(trimmed, 10), excludeId: excludeUserId ?? null }
      );
      const rows = stmt.all();
      return rows.map(row => ({
        id: row.id,
        username: row.username,
        profilePictureUrl: row.profilePicture
          ? `/api/auth/profile-picture/${row.id}?t=${Date.now()}`
          : undefined
      }));
    } else {
      // Search by username only
      const stmt = this.unit.prepare<
        { id: number; username: string; profilePicture: Buffer | null },
        { query: string; excludeId: number | null }
      >(
        `SELECT id, username, profilePicture FROM User
         WHERE username LIKE '%' || $query || '%'
         AND ($excludeId IS NULL OR id != $excludeId)
         LIMIT 20`,
        { query: trimmed, excludeId: excludeUserId ?? null }
      );
      const rows = stmt.all();
      return rows.map(row => ({
        id: row.id,
        username: row.username,
        profilePictureUrl: row.profilePicture
          ? `/api/auth/profile-picture/${row.id}?t=${Date.now()}`
          : undefined
      }));
    }
  }

  /**
   * Send a friend request
   */
  public sendFriendRequest(requesterId: number, addresseeId: number): FriendRequestResult {
    if (requesterId === addresseeId) {
      return { success: false, error: 'Cannot send friend request to yourself' };
    }

    // Check if both users exist
    const requesterStmt = this.unit.prepare<{ id: number }, { userId: number }>(
      'SELECT id FROM User WHERE id = $userId',
      { userId: requesterId }
    );
    if (!requesterStmt.get()) {
      return { success: false, error: 'Requester not found' };
    }

    const addresseeStmt = this.unit.prepare<{ id: number }, { userId: number }>(
      'SELECT id FROM User WHERE id = $userId',
      { userId: addresseeId }
    );
    if (!addresseeStmt.get()) {
      return { success: false, error: 'User not found' };
    }

    // Check if friendship already exists
    const existingStmt = this.unit.prepare<
      { id: number; status: string },
      { requesterId: number; addresseeId: number }
    >(
      `SELECT id, status FROM Friendship
       WHERE (requester_id = $requesterId AND addressee_id = $addresseeId)
          OR (requester_id = $addresseeId AND addressee_id = $requesterId)`,
      { requesterId, addresseeId }
    );
    const existing = existingStmt.get();
    if (existing) {
      if (existing.status === 'accepted') {
        return { success: false, error: 'Already friends with this user' };
      }
      if (existing.status === 'pending') {
        return { success: false, error: 'Friend request already pending' };
      }
      // If declined, update to pending
      // Need the id - we'll just delete and reinsert for simplicity
      const delStmt = this.unit.prepare<unknown, { id: number }>(
        'DELETE FROM Friendship WHERE id = $id',
        { id: existing.id }
      );
      delStmt.run();
    }

    const insertStmt = this.unit.prepare<
      { id: number },
      { requesterId: number; addresseeId: number; createdAt: string }
    >(
      `INSERT INTO Friendship (requester_id, addressee_id, status, created_at)
       VALUES ($requesterId, $addresseeId, 'pending', $createdAt)
       RETURNING id`,
      { requesterId, addresseeId, createdAt: getLocalTimestamp() }
    );
    const result = insertStmt.get();
    if (!result) {
      return { success: false, error: 'Failed to send friend request' };
    }

    return { success: true, friendshipId: result.id };
  }

  /**
   * Accept a friend request
   */
  public acceptFriendRequest(friendshipId: number, userId: number): FriendActionResult {
    const stmt = this.unit.prepare<
      { requester_id: number; addressee_id: number; status: string },
      { id: number }
    >(
      'SELECT requester_id, addressee_id, status FROM Friendship WHERE id = $id',
      { id: friendshipId }
    );
    const friendship = stmt.get();
    if (!friendship) {
      return { success: false, error: 'Friend request not found' };
    }
    if (friendship.status !== 'pending') {
      return { success: false, error: 'Friend request is not pending' };
    }
    if (friendship.addressee_id !== userId) {
      return { success: false, error: 'Only the recipient can accept this request' };
    }

    const updateStmt = this.unit.prepare<unknown, { id: number }>(
      "UPDATE Friendship SET status = 'accepted' WHERE id = $id",
      { id: friendshipId }
    );
    updateStmt.run();
    return { success: true };
  }

  /**
   * Decline a friend request
   */
  public declineFriendRequest(friendshipId: number, userId: number): FriendActionResult {
    const stmt = this.unit.prepare<
      { requester_id: number; addressee_id: number; status: string },
      { id: number }
    >(
      'SELECT requester_id, addressee_id, status FROM Friendship WHERE id = $id',
      { id: friendshipId }
    );
    const friendship = stmt.get();
    if (!friendship) {
      return { success: false, error: 'Friend request not found' };
    }
    if (friendship.status !== 'pending') {
      return { success: false, error: 'Friend request is not pending' };
    }
    if (friendship.addressee_id !== userId) {
      return { success: false, error: 'Only the recipient can decline this request' };
    }

    const updateStmt = this.unit.prepare<unknown, { id: number }>(
      "UPDATE Friendship SET status = 'declined' WHERE id = $id",
      { id: friendshipId }
    );
    updateStmt.run();
    return { success: true };
  }

  /**
   * Get accepted friends for a user
   */
  public getFriends(userId: number): FriendshipResult[] {
    const stmt = this.unit.prepare<
      { id: number; requester_id: number; addressee_id: number; status: string; created_at: string },
      { userId: number }
    >(
      `SELECT id, requester_id, addressee_id, status, created_at FROM Friendship
       WHERE status = 'accepted'
         AND (requester_id = $userId OR addressee_id = $userId)
       ORDER BY created_at DESC`,
      { userId }
    );
    const rows = stmt.all();
    return rows.map(row => this.toFriendshipResult(row, userId));
  }

  /**
   * Get pending friend requests received by a user
   */
  public getPendingRequests(userId: number): FriendshipResult[] {
    const stmt = this.unit.prepare<
      { id: number; requester_id: number; addressee_id: number; status: string; created_at: string },
      { userId: number }
    >(
      `SELECT id, requester_id, addressee_id, status, created_at FROM Friendship
       WHERE status = 'pending' AND addressee_id = $userId
       ORDER BY created_at DESC`,
      { userId }
    );
    const rows = stmt.all();
    return rows.map(row => {
      const result = this.toFriendshipResult(row, userId);
      // Fetch initial message for this request
      const msgStmt = this.unit.prepare<
        { content: string },
        { requesterId: number; addresseeId: number }
      >(
        `SELECT content FROM Message
         WHERE sender_id = $requesterId AND receiver_id = $addresseeId
         ORDER BY created_at ASC
         LIMIT 1`,
        { requesterId: row.requester_id, addresseeId: row.addressee_id }
      );
      const msg = msgStmt.get();
      if (msg) {
        result.initialMessage = msg.content;
      }
      return result;
    });
  }

  /**
   * Get pending friend requests sent by a user
   */
  public getSentRequests(userId: number): FriendshipResult[] {
    const stmt = this.unit.prepare<
      { id: number; requester_id: number; addressee_id: number; status: string; created_at: string },
      { userId: number }
    >(
      `SELECT id, requester_id, addressee_id, status, created_at FROM Friendship
       WHERE status = 'pending' AND requester_id = $userId
       ORDER BY created_at DESC`,
      { userId }
    );
    const rows = stmt.all();
    return rows.map(row => {
      const result = this.toFriendshipResult(row, userId);
      // Fetch initial message for this request
      const msgStmt = this.unit.prepare<
        { content: string },
        { requesterId: number; addresseeId: number }
      >(
        `SELECT content FROM Message
         WHERE sender_id = $requesterId AND receiver_id = $addresseeId
         ORDER BY created_at ASC
         LIMIT 1`,
        { requesterId: row.requester_id, addresseeId: row.addressee_id }
      );
      const msg = msgStmt.get();
      if (msg) {
        result.initialMessage = msg.content;
      }
      return result;
    });
  }

  /**
   * Remove a friend or cancel a request
   */
  public removeFriend(userId: number, friendId: number): FriendActionResult {
    const stmt = this.unit.prepare<unknown, { userId: number; friendId: number }>(
      `DELETE FROM Friendship
       WHERE ((requester_id = $userId AND addressee_id = $friendId)
          OR (requester_id = $friendId AND addressee_id = $userId))`,
      { userId, friendId }
    );
    stmt.run();
    return { success: true };
  }

  /**
   * Check if two users are friends
   */
  public areFriends(userId1: number, userId2: number): boolean {
    const stmt = this.unit.prepare<
      { id: number },
      { userId1: number; userId2: number }
    >(
      `SELECT id FROM Friendship
       WHERE status = 'accepted'
         AND ((requester_id = $userId1 AND addressee_id = $userId2)
           OR (requester_id = $userId2 AND addressee_id = $userId1))`,
      { userId1, userId2 }
    );
    return !!stmt.get();
  }

  private toFriendshipResult(
    row: { id: number; requester_id: number; addressee_id: number; status: string; created_at: string },
    currentUserId: number
  ): FriendshipResult {
    const otherUserId = row.requester_id === currentUserId ? row.addressee_id : row.requester_id;
    const userStmt = this.unit.prepare<
      { id: number; username: string; profilePicture: Buffer | null },
      { userId: number }
    >(
      'SELECT id, username, profilePicture FROM User WHERE id = $userId',
      { userId: otherUserId }
    );
    const user = userStmt.get();

    return {
      id: row.id,
      requesterId: row.requester_id,
      addresseeId: row.addressee_id,
      status: row.status as 'pending' | 'accepted' | 'declined',
      createdAt: row.created_at,
      otherUser: {
        id: user?.id ?? otherUserId,
        username: user?.username ?? 'Unknown',
        profilePictureUrl: user?.profilePicture
          ? `/api/auth/profile-picture/${user.id}?t=${Date.now()}`
          : undefined
      }
    };
  }
}
