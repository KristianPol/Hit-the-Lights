import { PostgresDB } from '../database/postgres-db';

function getLocalTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

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

export class MessageServiceAsync {
  constructor() {}

  public async sendMessage(request: SendMessageRequest): Promise<SendMessageResult> {
    if (!request.content || request.content.trim().length === 0) return { success: false, error: 'Message content cannot be empty' };
    if (request.content.length > 2000) return { success: false, error: 'Message too long (max 2000 characters)' };
    if (request.senderId === request.receiverId) return { success: false, error: 'Cannot message yourself' };

    const sender = await PostgresDB.queryOne<{ id: number }>('SELECT id FROM "User" WHERE id = $1', [request.senderId]);
    if (!sender) return { success: false, error: 'Sender not found' };
    const receiver = await PostgresDB.queryOne<{ id: number }>('SELECT id FROM "User" WHERE id = $1', [request.receiverId]);
    if (!receiver) return { success: false, error: 'Receiver not found' };

    const inserted = await PostgresDB.insertReturning<{ id: number }>('INSERT INTO "Message" (sender_id, receiver_id, content, created_at, is_read) VALUES ($1,$2,$3,$4,FALSE) RETURNING id', [request.senderId, request.receiverId, request.content.trim(), getLocalTimestamp()]);
    if (!inserted) return { success: false, error: 'Failed to send message' };
    return { success: true, messageId: inserted.id };
  }

  public async getConversation(userId1: number, userId2: number): Promise<MessageResult[]> {
    const rows = await PostgresDB.query<any>('SELECT id, sender_id, receiver_id, content, created_at, is_read FROM "Message" WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1) ORDER BY created_at ASC', [userId1, userId2]);
    return rows.map((row: any) => ({ id: row.id, senderId: row.sender_id, receiverId: row.receiver_id, content: row.content, createdAt: row.created_at, isRead: !!row.is_read }));
  }

  public async getConversations(userId: number): Promise<ConversationPreview[]> {
    const rows = await PostgresDB.query<any>(`
      WITH user_messages AS (
        SELECT id, sender_id, receiver_id, content, created_at, is_read, CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS other_user_id FROM "Message" WHERE sender_id = $1 OR receiver_id = $1
      ), latest_per_conversation AS (
        SELECT other_user_id, MAX(created_at) AS max_created_at FROM user_messages GROUP BY other_user_id
      )
      SELECT um.other_user_id, u.username AS other_username, u."profilePicture" AS other_profile_picture, um.id AS last_message_id, um.content AS last_content, um.sender_id AS last_sender_id, um.receiver_id AS last_receiver_id, um.created_at AS last_created_at, um.is_read AS last_is_read, (SELECT COUNT(*) FROM user_messages um2 WHERE um2.other_user_id = um.other_user_id AND um2.receiver_id = $1 AND um2.is_read = FALSE) AS unread_count
      FROM user_messages um JOIN latest_per_conversation lpc ON um.other_user_id = lpc.other_user_id AND um.created_at = lpc.max_created_at JOIN "User" u ON u.id = um.other_user_id ORDER BY um.created_at DESC
    `, [userId]);

    return rows.map((row: any) => ({
      otherUserId: row.other_user_id,
      otherUsername: row.other_username,
      otherUserProfilePictureUrl: row.other_profile_picture ? `/api/auth/profile-picture/${row.other_user_id}?t=${Date.now()}` : undefined,
      lastMessage: { id: row.last_message_id, senderId: row.last_sender_id, receiverId: row.last_receiver_id, content: row.last_content, createdAt: row.last_created_at, isRead: !!row.last_is_read },
      unreadCount: Number(row.unread_count)
    }));
  }

  public async markAsRead(messageIds: number[], userId: number): Promise<{ success: boolean; error?: string }> {
    if (!messageIds.length) return { success: true };
    for (const id of messageIds) {
      await PostgresDB.execute('UPDATE "Message" SET is_read = TRUE WHERE id = $1 AND receiver_id = $2', [id, userId]);
    }
    return { success: true };
  }

  public async markConversationAsRead(senderId: number, receiverId: number): Promise<{ success: boolean; error?: string }> {
    await PostgresDB.execute('UPDATE "Message" SET is_read = TRUE WHERE sender_id = $1 AND receiver_id = $2 AND is_read = FALSE', [senderId, receiverId]);
    return { success: true };
  }

  public async storeMessageDirectly(senderId: number, receiverId: number, content: string): Promise<SendMessageResult> {
    if (!content || content.trim().length === 0) return { success: false, error: 'Message content cannot be empty' };
    if (content.length > 2000) return { success: false, error: 'Message too long (max 2000 characters)' };
    const inserted = await PostgresDB.insertReturning<{ id: number }>('INSERT INTO "Message" (sender_id, receiver_id, content, created_at, is_read) VALUES ($1,$2,$3,$4,FALSE) RETURNING id', [senderId, receiverId, content.trim(), getLocalTimestamp()]);
    if (!inserted) return { success: false, error: 'Failed to send message' };
    return { success: true, messageId: inserted.id };
  }

  public async getRequestMessage(requesterId: number, addresseeId: number): Promise<MessageResult | undefined> {
    const row = await PostgresDB.queryOne<any>('SELECT id, sender_id, receiver_id, content, created_at, is_read FROM "Message" WHERE sender_id = $1 AND receiver_id = $2 ORDER BY created_at ASC LIMIT 1', [requesterId, addresseeId]);
    if (!row) return undefined;
    return { id: row.id, senderId: row.sender_id, receiverId: row.receiver_id, content: row.content, createdAt: row.created_at, isRead: !!row.is_read };
  }

  public async getUnreadCount(userId: number): Promise<number> {
    const row = await PostgresDB.queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM "Message" WHERE receiver_id = $1 AND is_read = FALSE', [userId]);
    return row?.count ?? 0;
  }
}

export default MessageServiceAsync;

