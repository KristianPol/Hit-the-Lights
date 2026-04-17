import { Unit } from '../database/unit';

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
  profilePictureUrl?: string;
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
        profilePictureUrl: `http://localhost:3000/api/auth/profile-picture/${request.userId}`
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
      { id: number; username: string; joinDate: string; profilePicture: Buffer | null },
      { userId: number }
    >(
      'SELECT id, username, joinDate, profilePicture FROM User WHERE id = $userId',
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
      profilePictureUrl: result.profilePicture
        ? `http://localhost:3000/api/auth/profile-picture/${result.id}?t=${Date.now()}`
        : undefined
    };
  }
}
