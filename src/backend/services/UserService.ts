import { Unit } from '../database/unit';
import { UserControls } from '../model';

type StoredControls = {
  laneBindings: [string, string, string, string];
  noteSpeed: number;
};

const DEFAULT_CONTROLS: StoredControls = {
  laneBindings: ['d', 'f', 'j', 'k'],
  noteSpeed: 1
};

const MIN_NOTE_SPEED = 0.5;
const MAX_NOTE_SPEED = 2.5;

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

export interface UserAchievementState {
  id: string;
  unlocked: boolean;
  pinned: boolean;
  progress: number;
}

export class UserService {
  constructor(private unit: Unit) {}

  /**
   * Updates a user's profile picture
   * @param request Contains userId and base64 encoded image
   * @returns Response with success status and URL or error
   */
  public updateProfilePicture(
    request: UpdateProfilePictureRequest
  ): UpdateProfilePictureResponse {
    console.log('UserService.updateProfilePicture called with userId:', request.userId);
    try {
      // Validate input
      if (!request.userId || request.userId <= 0) {
        console.log('Validation failed: Invalid user ID');
        return {
          success: false,
          error: 'Invalid user ID'
        };
      }

      if (!request.profilePictureBase64) {
        console.log('Validation failed: Profile picture is required');
        return {
          success: false,
          error: 'Profile picture is required'
        };
      }

      // Decode base64 to buffer
      console.log('Decoding base64...');
      const buffer = Buffer.from(request.profilePictureBase64, 'base64');
      console.log('Base64 decoded, buffer length:', buffer.length);

      // Check file size (5MB max)
      const maxSize = 5 * 1024 * 1024; // 5MB in bytes
      if (buffer.length > maxSize) {
        console.log('Validation failed: File too large');
        return {
          success: false,
          error: 'Profile picture must be less than 5MB'
        };
      }

      // Check if user exists
      console.log('Checking if user exists...');
      const userStmt = this.unit.prepare<{ id: number }, { userId: number }>(
        'SELECT id FROM User WHERE id = $userId',
        { userId: request.userId }
      );
      const user = userStmt.get();
      console.log('User lookup result:', user);

      if (!user) {
        console.log('User not found');
        return {
          success: false,
          error: 'User not found'
        };
      }

      // Update profile picture - use run() instead of get() for UPDATE
      console.log('Updating profile picture...');
      try {
        const updateStmt = this.unit.prepare<
          unknown,
          { userId: number; profilePicture: Buffer }
        >(
          'UPDATE User SET profilePicture = $profilePicture WHERE id = $userId',
          {
            userId: request.userId,
            profilePicture: buffer
          }
        );
        updateStmt.run();
        console.log('Profile picture updated successfully');
      } catch (updateError: any) {
        console.error('Error during UPDATE:', updateError);
        return {
          success: false,
          error: 'Database error: ' + updateError.message
        };
      }

      return {
        success: true,
        profilePictureUrl: `/api/auth/profile-picture/${request.userId}`
      };
    } catch (error: any) {
      console.error('Error in updateProfilePicture:', error);
      return {
        success: false,
        error: error.message || 'Failed to update profile picture'
      };
    }
  }

  /**
   * Gets a user's profile picture as buffer
   * @param userId The user ID
   * @returns The profile picture buffer or undefined
   */
  public getProfilePicture(userId: number): Buffer | undefined {
    const stmt = this.unit.prepare<
      { profilePicture: Buffer },
      { userId: number }
    >(
      'SELECT profilePicture FROM User WHERE id = $userId',
      { userId }
    );
    const result = stmt.get();
    return result?.profilePicture;
  }

  /**
   * Gets user by ID (without password)
   * @param userId The user ID
   * @returns User data or undefined
   */
  public getUserById(userId: number): GetUserResponse | undefined {
    const stmt = this.unit.prepare<
      { id: number; username: string; joinDate: string; profilePicture: Buffer | null; playtime_seconds?: number },
      { userId: number }
    >(
      'SELECT id, username, joinDate, profilePicture, playtime_seconds FROM User WHERE id = $userId',
      { userId }
    );
    const result = stmt.get();

    if (!result) {
      return undefined;
    }

    return {
      id: result.id,
      username: result.username,
      joinDate: result.joinDate,
      playtimeSeconds: typeof result.playtime_seconds === 'number' ? result.playtime_seconds : 0,
      profilePictureUrl: result.profilePicture
        ? `/api/auth/profile-picture/${result.id}?t=${Date.now()}`
        : undefined
    };
  }

  /**
   * Get stored settings JSON string for a user (may be null)
   */
  public getUserSettings(userId: number): string | null | undefined {
    if (!userId || userId <= 0) {
      return undefined;
    }

    const userExists = this.unit.prepare<{ id: number }, { userId: number }>(
      'SELECT id FROM User WHERE id = $userId',
      { userId }
    ).get();

    if (!userExists) {
      return undefined;
    }

    const stmt = this.unit.prepare<
      { lane_bindings_json: string | null; note_speed: number | null },
      { userId: number }
    >(
      'SELECT lane_bindings_json, note_speed FROM UserControls WHERE user_id = $userId',
      { userId }
    );
    const result = stmt.get();

    if (!result) {
      this.upsertUserControls(userId, DEFAULT_CONTROLS);
      return JSON.stringify(DEFAULT_CONTROLS);
    }

    const parsedControls = this.parseSettingsJson(result.lane_bindings_json ?? '');
    const normalized = this.normalizeControls({
      laneBindings: this.parseLaneBindings(parsedControls && typeof parsedControls === 'object'
        ? (parsedControls as { laneBindings?: unknown; lane_bindings?: unknown }).laneBindings
          ?? (parsedControls as { laneBindings?: unknown; lane_bindings?: unknown }).lane_bindings
        : null),
      noteSpeed: result.note_speed
    });

    return JSON.stringify(normalized);
  }

  /**
   * Update stored controls for a user
   */
  public updateUserSettings(userId: number, settingsJson: string): { success: boolean; error?: string } {
    if (!userId || userId <= 0) {
      return { success: false, error: 'Invalid user ID' };
    }

    try {
      const checkStmt = this.unit.prepare<{ id: number }, { userId: number }>('SELECT id FROM User WHERE id = $userId', { userId });
      const user = checkStmt.get();
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const parsedSettings = this.parseSettingsJson(settingsJson);
      const normalized = this.normalizeControls(parsedSettings);
      this.upsertUserControls(userId, normalized);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Database error' };
    }
  }

  /**
   * Adds playtime seconds to a user's total playtime and returns the new total
   */
  public addPlaytime(userId: number, seconds: number): { success: boolean; playtimeSeconds?: number; error?: string } {
    if (!userId || userId <= 0) {
      return { success: false, error: 'Invalid user ID' };
    }

    if (!Number.isFinite(seconds) || seconds <= 0) {
      return { success: false, error: 'Invalid seconds value' };
    }

    try {
      const checkStmt = this.unit.prepare<{ id: number }, { userId: number }>('SELECT id FROM User WHERE id = $userId', { userId });
      const user = checkStmt.get();
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const updateStmt = this.unit.prepare<unknown, { seconds: number; userId: number }>(
        'UPDATE User SET playtime_seconds = COALESCE(playtime_seconds, 0) + $seconds WHERE id = $userId',
        { seconds, userId }
      );
      updateStmt.run();

      const resultStmt = this.unit.prepare<{ playtime_seconds: number }, { userId: number }>('SELECT playtime_seconds FROM User WHERE id = $userId', { userId });
      const result = resultStmt.get();
      return { success: true, playtimeSeconds: typeof result?.playtime_seconds === 'number' ? result.playtime_seconds : 0 };
    } catch (error: any) {
      return { success: false, error: error.message || 'Database error' };
    }
  }

  public getUserAchievements(userId: number): { success: boolean; achievements?: UserAchievementState[]; error?: string } {
    if (!userId || userId <= 0) {
      return { success: false, error: 'Invalid user ID' };
    }

    try {
      const user = this.unit.prepare<{ id: number }, { userId: number }>(
        'SELECT id FROM User WHERE id = $userId',
        { userId }
      ).get();

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const rows = this.unit.prepare<
        { achievement_id: string; unlocked: number; pinned: number; progress: number },
        { userId: number }
      >(
        `SELECT achievement_id, unlocked, pinned, progress
         FROM UserAchievement
         WHERE user_id = $userId`,
        { userId }
      ).all();

      return {
        success: true,
        achievements: rows.map(row => ({
          id: row.achievement_id,
          unlocked: row.unlocked === 1,
          pinned: row.pinned === 1,
          progress: Number(row.progress ?? 0)
        }))
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Database error' };
    }
  }

  public saveUserAchievements(
    userId: number,
    achievements: UserAchievementState[]
  ): { success: boolean; error?: string } {
    if (!userId || userId <= 0) {
      return { success: false, error: 'Invalid user ID' };
    }

    if (!Array.isArray(achievements)) {
      return { success: false, error: 'Achievements payload must be an array' };
    }

    try {
      const user = this.unit.prepare<{ id: number }, { userId: number }>(
        'SELECT id FROM User WHERE id = $userId',
        { userId }
      ).get();

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      this.unit.prepare<unknown, { userId: number }>(
        'DELETE FROM UserAchievement WHERE user_id = $userId',
        { userId }
      ).run();

      for (const achievement of achievements) {
        if (!achievement?.id) {
          continue;
        }

        const unlocked = achievement.unlocked ? 1 : 0;
        const pinned = achievement.pinned && unlocked ? 1 : 0;
        const progress = Math.max(0, Math.floor(Number(achievement.progress ?? 0)));

        this.unit.prepare<
          unknown,
          { userId: number; achievementId: string; unlocked: number; pinned: number; progress: number }
        >(
          `INSERT INTO UserAchievement (user_id, achievement_id, unlocked, pinned, progress, updated_at)
           VALUES ($userId, $achievementId, $unlocked, $pinned, $progress, CURRENT_TIMESTAMP)`,
          {
            userId,
            achievementId: achievement.id,
            unlocked,
            pinned,
            progress
          }
        ).run();
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Database error' };
    }
  }

  private upsertUserControls(userId: number, controls: StoredControls): void {
    const payload: UserControls = {
      userId,
      laneBindingsJson: JSON.stringify({
        laneBindings: controls.laneBindings,
        noteSpeed: controls.noteSpeed
      }),
      noteSpeed: controls.noteSpeed
    };

    const stmt = this.unit.prepare<unknown, { userId: number; laneBindingsJson: string; noteSpeed: number }>(
      `INSERT INTO UserControls (user_id, lane_bindings_json, note_speed, created_at, updated_at)
       VALUES ($userId, $laneBindingsJson, $noteSpeed, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         lane_bindings_json = excluded.lane_bindings_json,
         note_speed = excluded.note_speed,
         updated_at = CURRENT_TIMESTAMP`,
      {
        userId: payload.userId,
        laneBindingsJson: payload.laneBindingsJson,
        noteSpeed: payload.noteSpeed
      }
    );

    stmt.run();
  }

  private parseSettingsJson(settingsJson: string): unknown {
    if (!settingsJson || !settingsJson.trim()) {
      return null;
    }

    try {
      return JSON.parse(settingsJson);
    } catch {
      return null;
    }
  }

  private parseLaneBindings(value: unknown): [string, string, string, string] {
    const fallback: [string, string, string, string] = DEFAULT_CONTROLS.laneBindings;

    if (!Array.isArray(value)) {
      return [...fallback] as [string, string, string, string];
    }

    return fallback.map((defaultBinding, index) => {
      const raw = value[index];
      if (typeof raw !== 'string') {
        return defaultBinding;
      }

      const normalized = raw.trim().toLowerCase();
      return normalized || defaultBinding;
    }) as [string, string, string, string];
  }

  private normalizeControls(value: unknown): StoredControls {
    const candidate = value && typeof value === 'object'
      ? value as { laneBindings?: unknown; noteSpeed?: unknown; lane_bindings?: unknown; note_speed?: unknown }
      : null;

    const laneBindings = this.parseLaneBindings(candidate?.laneBindings ?? candidate?.lane_bindings);
    const numericSpeed = Number(candidate?.noteSpeed ?? candidate?.note_speed ?? DEFAULT_CONTROLS.noteSpeed);
    const noteSpeed = Number.isFinite(numericSpeed)
      ? Math.min(MAX_NOTE_SPEED, Math.max(MIN_NOTE_SPEED, Number(numericSpeed.toFixed(2))))
      : DEFAULT_CONTROLS.noteSpeed;

    return {
      laneBindings,
      noteSpeed
    };
  }
}
