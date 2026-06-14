import { Unit } from '../database/unit';
import { UserControls } from '../model';
import { R2Service } from './R2Service';

type StoredControls = {
  laneBindings: [string, string, string, string];
  noteSpeed: number;
  theme?: string;
};

const DEFAULT_CONTROLS: StoredControls = {
  laneBindings: ['d', 'f', 'j', 'k'],
  noteSpeed: 1,
  theme: 'black-yellow'
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
  gamesPlayed?: number;
  profilePictureUrl?: string;
  role?: string;
  bio?: string | null;
  location?: string | null;
  favoriteGenre?: string | null;
  githubUrl?: string | null;
  osuUrl?: string | null;
  robloxUrl?: string | null;
  discordUrl?: string | null;
  youtubeUrl?: string | null;
  twitchUrl?: string | null;
  totalSp?: number;
  lastLoginDate?: string;
  loginStreak?: number;
  longestStreak?: number;
}

export interface UpdateProfileRequest {
  userId: number;
  bio?: string | null;
  location?: string | null;
  favoriteGenre?: string | null;
  githubUrl?: string | null;
  osuUrl?: string | null;
  robloxUrl?: string | null;
  discordUrl?: string | null;
  youtubeUrl?: string | null;
  twitchUrl?: string | null;
}

export interface UpdateProfileResponse {
  success: boolean;
  user?: GetUserResponse;
  error?: string;
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
  public async updateProfilePicture(
    request: UpdateProfilePictureRequest
  ): Promise<UpdateProfilePictureResponse> {
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
      const user = await userStmt.get();
      console.log('User lookup result:', user);

      if (!user) {
        console.log('User not found');
        return {
          success: false,
          error: 'User not found'
        };
      }

      // Detect image MIME type from header bytes
      let contentType = 'image/png';
      try {
        if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
          contentType = 'image/jpeg';
        } else if (buffer.length >= 3 && buffer.slice(0, 3).toString('ascii') === 'GIF') {
          contentType = 'image/gif';
        } else if (buffer.length >= 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
          contentType = 'image/webp';
        }
      } catch (e) {
        // ignore detection errors
      }

      const ext = contentType.split('/')[1];
      const key = `images/profile-pictures/${request.userId}-${Date.now()}.${ext}`;

      // Upload to R2
      console.log('Uploading profile picture to R2...');
      const publicUrl = await R2Service.uploadFile(buffer, key, contentType);
      console.log('Profile picture uploaded to R2:', publicUrl);

      // Update profile picture URL in DB and clear old BYTEA
      console.log('Updating profile picture URL in database...');
      try {
        const updateStmt = this.unit.prepare<
          unknown,
          { userId: number; profilePictureUrl: string }
        >(
          'UPDATE User SET profilePictureUrl = $profilePictureUrl, profilePicture = NULL WHERE id = $userId',
          {
            userId: request.userId,
            profilePictureUrl: publicUrl
          }
        );
        await updateStmt.run();
        console.log('Profile picture URL updated successfully');
      } catch (updateError: any) {
        console.error('Error during UPDATE:', updateError);
        return {
          success: false,
          error: 'Database error: ' + updateError.message
        };
      }

      return {
        success: true,
        profilePictureUrl: publicUrl
      };
    } catch (error: any) {
      console.error('Error in updateProfilePicture:', error);
      return {
        success: false,
        error: error.message || 'Failed to update profile picture'
      };
    }
  }

  public async updateProfile(request: UpdateProfileRequest): Promise<UpdateProfileResponse> {
    try {
      if (!request.userId || request.userId <= 0) {
        return { success: false, error: 'Invalid user ID' };
      }

      const user = await this.unit.prepare<{ id: number }, { userId: number }>(
        'SELECT id FROM User WHERE id = $userId',
        { userId: request.userId }
      ).get();
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const updates: string[] = [];
      const params: Record<string, unknown> = { userId: request.userId };

      const setField = (key: string, value: unknown) => {
        if (value === undefined) return;
        updates.push(`${key} = $${key}`);
        params[key] = value === null || (typeof value === 'string' && value.trim() === '') ? null : value;
      };

      setField('bio', request.bio);
      setField('location', request.location);
      setField('favoriteGenre', request.favoriteGenre);
      setField('githubUrl', request.githubUrl);
      setField('osuUrl', request.osuUrl);
      setField('robloxUrl', request.robloxUrl);
      setField('discordUrl', request.discordUrl);
      setField('youtubeUrl', request.youtubeUrl);
      setField('twitchUrl', request.twitchUrl);

      // Validate lengths
      if (typeof params.bio === 'string' && params.bio.length > 250) {
        return { success: false, error: 'Bio must be at most 250 characters' };
      }
      if (typeof params.location === 'string' && params.location.length > 60) {
        return { success: false, error: 'Location must be at most 60 characters' };
      }
      if (typeof params.favoriteGenre === 'string' && params.favoriteGenre.length > 40) {
        return { success: false, error: 'Favorite genre must be at most 40 characters' };
      }

      if (updates.length === 0) {
        const current = await this.getUserById(request.userId);
        return { success: true, user: current };
      }

      const stmt = this.unit.prepare<{ changes: number }, Record<string, unknown>>(
        `UPDATE User SET ${updates.join(', ')} WHERE id = $userId`,
        params
      );
      await stmt.run();

      const updated = await this.getUserById(request.userId);
      return { success: true, user: updated };
    } catch (error: any) {
      console.error('Error in updateProfile:', error);
      return { success: false, error: error.message || 'Failed to update profile' };
    }
  }

  /**
   * Gets a user's profile picture as buffer
   * @param userId The user ID
   * @returns The profile picture buffer or undefined
   */
  public async getProfilePicture(userId: number): Promise<Buffer | undefined> {
    const stmt = this.unit.prepare<
      { profilePicture: Buffer },
      { userId: number }
    >(
      'SELECT profilePicture FROM User WHERE id = $userId',
      { userId }
    );
    const result = await stmt.get();
    return result?.profilePicture;
  }

  /**
   * Gets user by ID (without password)
   * @param userId The user ID
   * @returns User data or undefined
   */
  public async getUserById(userId: number): Promise<GetUserResponse | undefined> {
    const stmt = this.unit.prepare<
      {
        id: number;
        username: string;
        joinDate: string;
        profilePicture: Buffer | null;
        profilePictureUrl: string | null;
        role?: string;
        playtime_seconds?: number;
        runs_count?: number;
        bio?: string | null;
        location?: string | null;
        favoriteGenre?: string | null;
        githubUrl?: string | null;
        osuUrl?: string | null;
        robloxUrl?: string | null;
        discordUrl?: string | null;
        youtubeUrl?: string | null;
        twitchUrl?: string | null;
        total_sp?: number;
        lastLoginDate?: string | null;
        loginStreak?: number;
        longestStreak?: number;
      },
      { userId: number }
    >(
      `SELECT id, username, joinDate, role, profilePicture, profilePictureUrl, playtime_seconds, runs_count, total_sp,
        bio, location, favoriteGenre, githubUrl, osuUrl, robloxUrl, discordUrl, youtubeUrl, twitchUrl,
        lastLoginDate, loginStreak, longestStreak
       FROM User WHERE id = $userId`,
      { userId }
    );
    const result = await stmt.get();

    if (!result) {
      return undefined;
    }

    return {
      id: result.id,
      username: result.username,
      joinDate: result.joinDate,
      playtimeSeconds: typeof result.playtime_seconds === 'number' ? result.playtime_seconds : 0,
      gamesPlayed: typeof result.runs_count === 'number' ? result.runs_count : 0,
      role: result.role,
      profilePictureUrl: result.profilePictureUrl
        ? result.profilePictureUrl
        : result.profilePicture
          ? `/api/auth/profile-picture/${result.id}?t=${Date.now()}`
          : undefined,
      bio: result.bio,
      location: result.location,
      favoriteGenre: result.favoriteGenre,
      githubUrl: result.githubUrl,
      osuUrl: result.osuUrl,
      robloxUrl: result.robloxUrl,
      discordUrl: result.discordUrl,
      youtubeUrl: result.youtubeUrl,
      twitchUrl: result.twitchUrl,
      totalSp: typeof result.total_sp === 'number' ? result.total_sp : 0,
      lastLoginDate: result.lastLoginDate ?? undefined,
      loginStreak: typeof result.loginStreak === 'number' ? result.loginStreak : 0,
      longestStreak: typeof result.longestStreak === 'number' ? result.longestStreak : 0
    };
  }

  /**
   * Gets a user's profile picture URL (R2) or undefined
   * @param userId The user ID
   * @returns The profile picture public URL or undefined
   */
  public async getProfilePictureUrl(userId: number): Promise<string | undefined> {
    const stmt = this.unit.prepare<
      { profilePictureUrl: string | null; profilePicture: Buffer | null },
      { userId: number }
    >(
      'SELECT profilePictureUrl, profilePicture FROM User WHERE id = $userId',
      { userId }
    );
    const result = await stmt.get();
    if (result?.profilePictureUrl) {
      return result.profilePictureUrl;
    }
    return undefined;
  }

  /**
   * Get stored settings JSON string for a user (may be null)
   */
  public async getUserSettings(userId: number): Promise<string | null | undefined> {
    if (!userId || userId <= 0) {
      return undefined;
    }

    const userExists = await this.unit.prepare<{ id: number }, { userId: number }>(
      'SELECT id FROM User WHERE id = $userId',
      { userId }
    ).get();

    if (!userExists) {
      return undefined;
    }

    const stmt = this.unit.prepare<
      { lane_bindings_json: string | null; note_speed: number | null; settings_json: string | null },
      { userId: number }
    >(
      'SELECT lane_bindings_json, note_speed, settings_json FROM UserControls WHERE user_id = $userId',
      { userId }
    );
    const result = await stmt.get();

    if (!result) {
      const defaults = JSON.stringify(DEFAULT_CONTROLS);
      await this.upsertUserControls(userId, DEFAULT_CONTROLS, defaults);
      return defaults;
    }

    if (result.settings_json) {
      return result.settings_json;
    }

    const parsedControls = this.parseSettingsJson(result.lane_bindings_json ?? '');
    const normalized = this.normalizeControls({
      laneBindings: this.parseLaneBindings(parsedControls && typeof parsedControls === 'object'
        ? (parsedControls as { laneBindings?: unknown; lane_bindings?: unknown }).laneBindings
          ?? (parsedControls as { laneBindings?: unknown; lane_bindings?: unknown }).lane_bindings
        : null),
      noteSpeed: result.note_speed,
      theme: parsedControls && typeof parsedControls === 'object'
        ? (parsedControls as { theme?: unknown }).theme
        : undefined
    });

    return JSON.stringify(normalized);
  }

  /**
   * Update stored controls for a user
   */
  public async updateUserSettings(userId: number, settingsJson: string): Promise<{ success: boolean; error?: string }> {
    if (!userId || userId <= 0) {
      return { success: false, error: 'Invalid user ID' };
    }

    try {
      const checkStmt = this.unit.prepare<{ id: number }, { userId: number }>('SELECT id FROM User WHERE id = $userId', { userId });
      const user = await checkStmt.get();
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const parsedSettings = this.parseSettingsJson(settingsJson);
      const normalized = this.normalizeControls(parsedSettings);
      await this.upsertUserControls(userId, normalized, settingsJson);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Database error' };
    }
  }

  /**
   * Adds playtime seconds to a user's total playtime and returns the new total
   */
  public async addPlaytime(userId: number, seconds: number): Promise<{ success: boolean; playtimeSeconds?: number; error?: string }> {
    if (!userId || userId <= 0) {
      return { success: false, error: 'Invalid user ID' };
    }

    if (!Number.isFinite(seconds) || seconds <= 0) {
      return { success: false, error: 'Invalid seconds value' };
    }

    try {
      const checkStmt = this.unit.prepare<{ id: number }, { userId: number }>('SELECT id FROM User WHERE id = $userId', { userId });
      const user = await checkStmt.get();
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const updateStmt = this.unit.prepare<unknown, { seconds: number; userId: number }>(
        'UPDATE User SET playtime_seconds = COALESCE(playtime_seconds, 0) + $seconds WHERE id = $userId',
        { seconds, userId }
      );
      await updateStmt.run();

      const resultStmt = this.unit.prepare<{ playtime_seconds: number }, { userId: number }>('SELECT playtime_seconds FROM User WHERE id = $userId', { userId });
      const result = await resultStmt.get();
      return { success: true, playtimeSeconds: typeof result?.playtime_seconds === 'number' ? result.playtime_seconds : 0 };
    } catch (error: any) {
      return { success: false, error: error.message || 'Database error' };
    }
  }

  public async getUserAchievements(userId: number): Promise<{ success: boolean; achievements?: UserAchievementState[]; error?: string }> {
    if (!userId || userId <= 0) {
      return { success: false, error: 'Invalid user ID' };
    }

    try {
      const user = await this.unit.prepare<{ id: number }, { userId: number }>(
        'SELECT id FROM User WHERE id = $userId',
        { userId }
      ).get();

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const rows = await this.unit.prepare<
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

  public async saveUserAchievements(
    userId: number,
    achievements: UserAchievementState[]
  ): Promise<{ success: boolean; error?: string }> {
    if (!userId || userId <= 0) {
      return { success: false, error: 'Invalid user ID' };
    }

    if (!Array.isArray(achievements)) {
      return { success: false, error: 'Achievements payload must be an array' };
    }

    try {
      const user = await this.unit.prepare<{ id: number }, { userId: number }>(
        'SELECT id FROM User WHERE id = $userId',
        { userId }
      ).get();

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      await this.unit.prepare<unknown, { userId: number }>(
        'DELETE FROM UserAchievement WHERE user_id = $userId',
        { userId }
      ).run();

      for (const achievement of achievements) {
        if (!achievement?.id) {
          continue;
        }

        const unlocked = achievement.unlocked ? 1 : 0;
        const pinned = achievement.pinned && unlocked ? 1 : 0;
        const rawProgress = Number(achievement.progress ?? 0);
        const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.floor(rawProgress)) : 0;

        await this.unit.prepare<
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

  private async upsertUserControls(userId: number, controls: StoredControls, settingsJson: string): Promise<void> {
    const payload: UserControls = {
      userId,
      laneBindingsJson: JSON.stringify({
        laneBindings: controls.laneBindings,
        noteSpeed: controls.noteSpeed,
        theme: controls.theme
      }),
      noteSpeed: controls.noteSpeed
    };

    const stmt = this.unit.prepare<unknown, { userId: number; laneBindingsJson: string; noteSpeed: number; settingsJson: string }>(
      `INSERT INTO UserControls (user_id, lane_bindings_json, note_speed, settings_json, created_at, updated_at)
       VALUES ($userId, $laneBindingsJson, $noteSpeed, $settingsJson, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         lane_bindings_json = excluded.lane_bindings_json,
         note_speed = excluded.note_speed,
         settings_json = excluded.settings_json,
         updated_at = CURRENT_TIMESTAMP`,
      {
        userId: payload.userId,
        laneBindingsJson: payload.laneBindingsJson,
        noteSpeed: payload.noteSpeed,
        settingsJson
      }
    );

    await stmt.run();
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
      ? value as { laneBindings?: unknown; noteSpeed?: unknown; lane_bindings?: unknown; note_speed?: unknown; theme?: unknown }
      : null;

    const laneBindings = this.parseLaneBindings(candidate?.laneBindings ?? candidate?.lane_bindings);
    const numericSpeed = Number(candidate?.noteSpeed ?? candidate?.note_speed ?? DEFAULT_CONTROLS.noteSpeed);
    const noteSpeed = Number.isFinite(numericSpeed)
      ? Math.min(MAX_NOTE_SPEED, Math.max(MIN_NOTE_SPEED, Number(numericSpeed.toFixed(2))))
      : DEFAULT_CONTROLS.noteSpeed;
    const theme = typeof candidate?.theme === 'string' && candidate.theme.trim()
      ? candidate.theme.trim()
      : DEFAULT_CONTROLS.theme;

    return {
      laneBindings,
      noteSpeed,
      theme
    };
  }
}
