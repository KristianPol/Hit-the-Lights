import { PostgresDB } from '../database/postgres-db';

export interface UpdateProfilePictureRequest {
  userId: number;
  profilePictureBase64: string;
}

export interface UpdateProfilePictureResponse {
  success: boolean;
  profilePictureUrl?: string;
  error?: string;
}

export interface GetUserResponse {
  id: number;
  username: string;
  joinDate: string;
  playtimeSeconds?: number;
  profilePictureUrl?: string;
}

export class UserServiceAsync {
  constructor() {}

  public async updateProfilePicture(request: UpdateProfilePictureRequest): Promise<UpdateProfilePictureResponse> {
    try {
      if (!request.userId || request.userId <= 0) return { success: false, error: 'Invalid user ID' };
      if (!request.profilePictureBase64) return { success: false, error: 'Profile picture is required' };
      const buffer = Buffer.from(request.profilePictureBase64, 'base64');
      const maxSize = 5 * 1024 * 1024;
      if (buffer.length > maxSize) return { success: false, error: 'Profile picture must be less than 5MB' };

      const user = await PostgresDB.queryOne<{ id: number }>('SELECT id FROM "User" WHERE id = $1', [request.userId]);
      if (!user) return { success: false, error: 'User not found' };

      await PostgresDB.execute('UPDATE "User" SET "profilePicture" = $1 WHERE id = $2', [buffer, request.userId]);
      return { success: true, profilePictureUrl: `/api/auth/profile-picture/${request.userId}` };
    } catch (err: any) {
      return { success: false, error: 'Database error: ' + (err?.message ?? String(err)) };
    }
  }

  public async getProfilePicture(userId: number): Promise<Buffer | undefined> {
    const row = await PostgresDB.queryOne<{ profilePicture: Buffer }>('SELECT "profilePicture" FROM "User" WHERE id = $1', [userId]);
    return row?.profilePicture;
  }

  public async getUserById(userId: number): Promise<GetUserResponse | undefined> {
    const row = await PostgresDB.queryOne<{ id: number; username: string; joinDate: string; profilePicture: Buffer | null; playtime_seconds?: number }>('SELECT id, username, "joinDate", "profilePicture", playtime_seconds FROM "User" WHERE id = $1', [userId]);
    if (!row) return undefined;
    return {
      id: row.id,
      username: row.username,
      joinDate: row.joinDate,
      playtimeSeconds: typeof row.playtime_seconds === 'number' ? row.playtime_seconds : 0,
      profilePictureUrl: (row as any).profilePicture ? `/api/auth/profile-picture/${row.id}?t=${Date.now()}` : undefined
    } as any;
  }

  public async addPlaytime(userId: number, seconds: number): Promise<{ success: boolean; playtimeSeconds?: number; error?: string }> {
    if (!userId || userId <= 0) return { success: false, error: 'Invalid user ID' };
    if (!Number.isFinite(seconds) || seconds <= 0) return { success: false, error: 'Invalid seconds value' };
    const user = await PostgresDB.queryOne<{ id: number }>('SELECT id FROM "User" WHERE id = $1', [userId]);
    if (!user) return { success: false, error: 'User not found' };
    await PostgresDB.execute('UPDATE "User" SET playtime_seconds = COALESCE(playtime_seconds,0) + $1 WHERE id = $2', [seconds, userId]);
    const updated = await PostgresDB.queryOne<{ playtime_seconds: number }>('SELECT playtime_seconds FROM "User" WHERE id = $1', [userId]);
    return { success: true, playtimeSeconds: typeof updated?.playtime_seconds === 'number' ? updated.playtime_seconds : 0 };
  }
}

export default UserServiceAsync;

