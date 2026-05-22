import { PostgresDB } from '../database/postgres-db';

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

export class FriendshipServiceAsync {
  constructor() {}

  public async searchUsers(query: string, excludeUserId?: number): Promise<SearchUserResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const isNumeric = /^\d+$/.test(trimmed);
    if (isNumeric) {
      const rows = await PostgresDB.query<{ id: number; username: string; profilepicture: Buffer | null }>(
        `SELECT id, username, "profilePicture" FROM "User" WHERE (id = $1 OR username ILIKE '%' || $2 || '%') AND ($3 IS NULL OR id != $3) LIMIT 20`,
        [parseInt(trimmed, 10), trimmed, excludeUserId ?? null]
      );
      return rows.map(r => ({ id: r.id, username: r.username, profilePictureUrl: r.profilepicture ? `/api/auth/profile-picture/${r.id}?t=${Date.now()}` : undefined }));
    } else {
      const rows = await PostgresDB.query<{ id: number; username: string; profilepicture: Buffer | null }>(
        `SELECT id, username, "profilePicture" FROM "User" WHERE username ILIKE '%' || $1 || '%' AND ($2 IS NULL OR id != $2) LIMIT 20`,
        [trimmed, excludeUserId ?? null]
      );
      return rows.map(r => ({ id: r.id, username: r.username, profilePictureUrl: r.profilepicture ? `/api/auth/profile-picture/${r.id}?t=${Date.now()}` : undefined }));
    }
  }

  public async sendFriendRequest(requesterId: number, addresseeId: number): Promise<FriendRequestResult> {
    if (requesterId === addresseeId) return { success: false, error: 'Cannot send friend request to yourself' };
    const requester = await PostgresDB.queryOne<{ id: number }>('SELECT id FROM "User" WHERE id = $1', [requesterId]);
    if (!requester) return { success: false, error: 'Requester not found' };
    const addressee = await PostgresDB.queryOne<{ id: number }>('SELECT id FROM "User" WHERE id = $1', [addresseeId]);
    if (!addressee) return { success: false, error: 'User not found' };

    const existing = await PostgresDB.queryOne<{ id: number; status: string }>(
      `SELECT id, status FROM "Friendship" WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
      [requesterId, addresseeId]
    );
    if (existing) {
      if (existing.status === 'accepted') return { success: false, error: 'Already friends with this user' };
      if (existing.status === 'pending') return { success: false, error: 'Friend request already pending' };
      await PostgresDB.execute('DELETE FROM "Friendship" WHERE id = $1', [existing.id]);
    }

    const inserted = await PostgresDB.insertReturning<{ id: number }>('INSERT INTO "Friendship" (requester_id, addressee_id, status, created_at) VALUES ($1,$2,\'pending\',$3) RETURNING id', [requesterId, addresseeId, getLocalTimestamp()]);
    if (!inserted) return { success: false, error: 'Failed to send friend request' };
    return { success: true, friendshipId: inserted.id };
  }

  public async acceptFriendRequest(friendshipId: number, userId: number): Promise<FriendActionResult> {
    const friendship = await PostgresDB.queryOne<{ requester_id: number; addressee_id: number; status: string }>('SELECT requester_id, addressee_id, status FROM "Friendship" WHERE id = $1', [friendshipId]);
    if (!friendship) return { success: false, error: 'Friend request not found' };
    if (friendship.status !== 'pending') return { success: false, error: 'Friend request is not pending' };
    if (friendship.addressee_id !== userId) return { success: false, error: 'Only the recipient can accept this request' };
    await PostgresDB.execute('UPDATE "Friendship" SET status = \'' + 'accepted' + '\' WHERE id = $1', [friendshipId]);
    return { success: true };
  }

  public async declineFriendRequest(friendshipId: number, userId: number): Promise<FriendActionResult> {
    const friendship = await PostgresDB.queryOne<{ requester_id: number; addressee_id: number; status: string }>('SELECT requester_id, addressee_id, status FROM "Friendship" WHERE id = $1', [friendshipId]);
    if (!friendship) return { success: false, error: 'Friend request not found' };
    if (friendship.status !== 'pending') return { success: false, error: 'Friend request is not pending' };
    if (friendship.addressee_id !== userId) return { success: false, error: 'Only the recipient can decline this request' };
    await PostgresDB.execute('UPDATE "Friendship" SET status = \'' + 'declined' + '\' WHERE id = $1', [friendshipId]);
    return { success: true };
  }

  public async getFriends(userId: number): Promise<FriendshipResult[]> {
    const rows = await PostgresDB.query<any>(`SELECT id, requester_id, addressee_id, status, created_at FROM "Friendship" WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1) ORDER BY created_at DESC`, [userId]);
    const results: FriendshipResult[] = [];
    for (const row of rows) {
      const otherUserId = row.requester_id === userId ? row.addressee_id : row.requester_id;
      const user = await PostgresDB.queryOne<{ id: number; username: string; "profilePicture": Buffer | null }>('SELECT id, username, "profilePicture" FROM "User" WHERE id = $1', [otherUserId]);
      results.push({
        id: row.id,
        requesterId: row.requester_id,
        addresseeId: row.addressee_id,
        status: row.status,
        createdAt: row.created_at,
        otherUser: { id: user?.id ?? otherUserId, username: user?.username ?? 'Unknown', profilePictureUrl: user?.profilePicture ? `/api/auth/profile-picture/${user!.id}?t=${Date.now()}` : undefined }
      });
    }
    return results;
  }

  public async getPendingRequests(userId: number): Promise<FriendshipResult[]> {
    const rows = await PostgresDB.query<any>(`SELECT id, requester_id, addressee_id, status, created_at FROM "Friendship" WHERE status = 'pending' AND addressee_id = $1 ORDER BY created_at DESC`, [userId]);
    const results: FriendshipResult[] = [];
    for (const row of rows) {
      const otherUserId = row.requester_id;
      const user = await PostgresDB.queryOne<{ id: number; username: string; "profilePicture": Buffer | null }>('SELECT id, username, "profilePicture" FROM "User" WHERE id = $1', [otherUserId]);
      const msg = await PostgresDB.queryOne<{ content: string }>('SELECT content FROM "Message" WHERE sender_id = $1 AND receiver_id = $2 ORDER BY created_at ASC LIMIT 1', [row.requester_id, row.addressee_id]);
      results.push({
        id: row.id,
        requesterId: row.requester_id,
        addresseeId: row.addressee_id,
        status: row.status,
        createdAt: row.created_at,
        otherUser: { id: user?.id ?? otherUserId, username: user?.username ?? 'Unknown', profilePictureUrl: user?.profilePicture ? `/api/auth/profile-picture/${user!.id}?t=${Date.now()}` : undefined },
        initialMessage: msg?.content
      });
    }
    return results;
  }

  public async getSentRequests(userId: number): Promise<FriendshipResult[]> {
    const rows = await PostgresDB.query<any>(`SELECT id, requester_id, addressee_id, status, created_at FROM "Friendship" WHERE status = 'pending' AND requester_id = $1 ORDER BY created_at DESC`, [userId]);
    const results: FriendshipResult[] = [];
    for (const row of rows) {
      const otherUserId = row.addressee_id;
      const user = await PostgresDB.queryOne<{ id: number; username: string; "profilePicture": Buffer | null }>('SELECT id, username, "profilePicture" FROM "User" WHERE id = $1', [otherUserId]);
      const msg = await PostgresDB.queryOne<{ content: string }>('SELECT content FROM "Message" WHERE sender_id = $1 AND receiver_id = $2 ORDER BY created_at ASC LIMIT 1', [row.requester_id, row.addressee_id]);
      results.push({
        id: row.id,
        requesterId: row.requester_id,
        addresseeId: row.addressee_id,
        status: row.status,
        createdAt: row.created_at,
        otherUser: { id: user?.id ?? otherUserId, username: user?.username ?? 'Unknown', profilePictureUrl: user?.profilePicture ? `/api/auth/profile-picture/${user!.id}?t=${Date.now()}` : undefined },
        initialMessage: msg?.content
      });
    }
    return results;
  }

  public async removeFriend(userId: number, friendId: number): Promise<FriendActionResult> {
    await PostgresDB.execute(`DELETE FROM "Friendship" WHERE ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`, [userId, friendId]);
    return { success: true };
  }

  public async areFriends(userId1: number, userId2: number): Promise<boolean> {
    const row = await PostgresDB.queryOne<{ id: number }>(`SELECT id FROM "Friendship" WHERE status = 'accepted' AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`, [userId1, userId2]);
    return !!row;
  }
}

export default FriendshipServiceAsync;

