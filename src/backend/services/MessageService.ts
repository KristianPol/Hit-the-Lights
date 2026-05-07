import { Unit } from '../database/unit';

export interface SendMessageRequest {
  senderId: number;
  receiverId: number;
  content: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

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

export class MessageService {
  constructor(private unit: Unit) {}

  /**
   * Send a message from sender to receiver
   */
  public sendMessage(request: SendMessageRequest): SendMessageResult {
    if (!request.content || request.content.trim().length === 0) {
      return { success: false, error: 'Message content cannot be empty' };
    }
    if (request.content.length > 2000) {
      return { success: false, error: 'Message too long (max 2000 characters)' };
    }
    if (request.senderId === request.receiverId) {
      return { success: false, error: 'Cannot message yourself' };
    }

    // Verify both users exist
    const senderStmt = this.unit.prepare<{ id: number }, { userId: number }>(
      'SELECT id FROM User WHERE id = $userId',
      { userId: request.senderId }
    );
    if (!senderStmt.get()) {
      return { success: false, error: 'Sender not found' };
    }

    const receiverStmt = this.unit.prepare<{ id: number }, { userId: number }>(
      'SELECT id FROM User WHERE id = $userId',
      { userId: request.receiverId }
    );
    if (!receiverStmt.get()) {
      return { success: false, error: 'Receiver not found' };
    }

    const insertStmt = this.unit.prepare<
      { id: number },
      { senderId: number; receiverId: number; content: string }
    >(
      `INSERT INTO Message (sender_id, receiver_id, content, created_at, is_read)
       VALUES ($senderId, $receiverId, $content, CURRENT_TIMESTAMP, 0)
       RETURNING id`,
      { senderId: request.senderId, receiverId: request.receiverId, content: request.content.trim() }
    );
    const result = insertStmt.get();
    if (!result) {
      return { success: false, error: 'Failed to send message' };
    }

    return { success: true, messageId: result.id };
  }

  /**
   * Get conversation between two users (all messages, ordered by time)
   */
  public getConversation(userId1: number, userId2: number): MessageResult[] {
    const stmt = this.unit.prepare<
      { id: number; sender_id: number; receiver_id: number; content: string; created_at: string; is_read: number },
      { userId1: number; userId2: number }
    >(
      `SELECT id, sender_id, receiver_id, content, created_at, is_read FROM Message
       WHERE (sender_id = $userId1 AND receiver_id = $userId2)
          OR (sender_id = $userId2 AND receiver_id = $userId1)
       ORDER BY created_at ASC`,
      { userId1, userId2 }
    );
    const rows = stmt.all();
    return rows.map(row => ({
      id: row.id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      content: row.content,
      createdAt: row.created_at,
      isRead: row.is_read === 1
    }));
  }

  /**
   * Get conversation previews for a user (one per other user, with latest message)
   */
  public getConversations(userId: number): ConversationPreview[] {
    // Get all messages where user is sender or receiver
    const stmt = this.unit.prepare<
      { other_user_id: number; other_username: string; other_profile_picture: Buffer | null; last_message_id: number; last_content: string; last_sender_id: number; last_receiver_id: number; last_created_at: string; last_is_read: number; unread_count: number },
      { userId: number }
    >(
      `WITH user_messages AS (
         SELECT
           id,
           sender_id,
           receiver_id,
           content,
           created_at,
           is_read,
           CASE WHEN sender_id = $userId THEN receiver_id ELSE sender_id END AS other_user_id
         FROM Message
         WHERE sender_id = $userId OR receiver_id = $userId
       ),
       latest_per_conversation AS (
         SELECT other_user_id, MAX(created_at) AS max_created_at
         FROM user_messages
         GROUP BY other_user_id
       )
       SELECT
         um.other_user_id,
         u.username AS other_username,
         u.profilePicture AS other_profile_picture,
         um.id AS last_message_id,
         um.content AS last_content,
         um.sender_id AS last_sender_id,
         um.receiver_id AS last_receiver_id,
         um.created_at AS last_created_at,
         um.is_read AS last_is_read,
         (SELECT COUNT(*) FROM user_messages um2 WHERE um2.other_user_id = um.other_user_id AND um2.receiver_id = $userId AND um2.is_read = 0) AS unread_count
       FROM user_messages um
       JOIN latest_per_conversation lpc ON um.other_user_id = lpc.other_user_id AND um.created_at = lpc.max_created_at
       JOIN User u ON u.id = um.other_user_id
       ORDER BY um.created_at DESC`,
      { userId }
    );
    const rows = stmt.all();
    return rows.map(row => ({
      otherUserId: row.other_user_id,
      otherUsername: row.other_username,
      otherUserProfilePictureUrl: row.other_profile_picture
        ? `http://localhost:3000/api/auth/profile-picture/${row.other_user_id}?t=${Date.now()}`
        : undefined,
      lastMessage: {
        id: row.last_message_id,
        senderId: row.last_sender_id,
        receiverId: row.last_receiver_id,
        content: row.last_content,
        createdAt: row.last_created_at,
        isRead: row.last_is_read === 1
      },
      unreadCount: row.unread_count
    }));
  }

  /**
   * Mark messages as read
   */
  public markAsRead(messageIds: number[], userId: number): { success: boolean; error?: string } {
    if (!messageIds.length) {
      return { success: true };
    }

    // Only mark messages where user is the receiver
    for (const id of messageIds) {
      const stmt = this.unit.prepare<unknown, { id: number; userId: number }>(
        'UPDATE Message SET is_read = 1 WHERE id = $id AND receiver_id = $userId',
        { id, userId }
      );
      stmt.run();
    }

    return { success: true };
  }

  /**
   * Mark all messages from a sender as read for a receiver
   */
  public markConversationAsRead(senderId: number, receiverId: number): { success: boolean; error?: string } {
    const stmt = this.unit.prepare<unknown, { senderId: number; receiverId: number }>(
      'UPDATE Message SET is_read = 1 WHERE sender_id = $senderId AND receiver_id = $receiverId AND is_read = 0',
      { senderId, receiverId }
    );
    stmt.run();
    return { success: true };
  }

  /**
   * Store a message directly without friendship check (used for request messages)
   */
  public storeMessageDirectly(senderId: number, receiverId: number, content: string): SendMessageResult {
    if (!content || content.trim().length === 0) {
      return { success: false, error: 'Message content cannot be empty' };
    }
    if (content.length > 2000) {
      return { success: false, error: 'Message too long (max 2000 characters)' };
    }

    const insertStmt = this.unit.prepare<
      { id: number },
      { senderId: number; receiverId: number; content: string }
    >(
      `INSERT INTO Message (sender_id, receiver_id, content, created_at, is_read)
       VALUES ($senderId, $receiverId, $content, CURRENT_TIMESTAMP, 0)
       RETURNING id`,
      { senderId, receiverId, content: content.trim() }
    );
    const result = insertStmt.get();
    if (!result) {
      return { success: false, error: 'Failed to send message' };
    }

    return { success: true, messageId: result.id };
  }

  /**
   * Get the initial message for a pending friend request (if any)
   */
  public getRequestMessage(requesterId: number, addresseeId: number): MessageResult | undefined {
    const stmt = this.unit.prepare<
      { id: number; sender_id: number; receiver_id: number; content: string; created_at: string; is_read: number },
      { requesterId: number; addresseeId: number }
    >(
      `SELECT id, sender_id, receiver_id, content, created_at, is_read FROM Message
       WHERE sender_id = $requesterId AND receiver_id = $addresseeId
       ORDER BY created_at ASC
       LIMIT 1`,
      { requesterId, addresseeId }
    );
    const row = stmt.get();
    if (!row) return undefined;
    return {
      id: row.id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      content: row.content,
      createdAt: row.created_at,
      isRead: row.is_read === 1
    };
  }

  /**
   * Get unread message count for a user
   */
  public getUnreadCount(userId: number): number {
    const stmt = this.unit.prepare<{ count: number }, { userId: number }>(
      'SELECT COUNT(*) AS count FROM Message WHERE receiver_id = $userId AND is_read = 0',
      { userId }
    );
    const result = stmt.get();
    return result?.count ?? 0;
  }
}
