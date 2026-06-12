import { Unit } from '../database/unit';
import { User } from '../model';
import { PasswordHasher } from '../utils/PasswordHasher';
import { PasswordValidator } from '../utils/PasswordValidator';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: User;
  error?: string;
}

export class AuthenticationService {
  constructor(private unit: Unit) {}

  /**
   * Authenticates a user
   * @param request Login request with username and password
   * @returns Login response with success status and user or error
   */
  public async login(request: LoginRequest): Promise<LoginResponse> {
    try {
      // Validate input
      if (typeof request.username !== 'string' || request.username.length < 3) {
        return {
          success: false,
          error: 'Username must be at least 3 characters'
        };
      }

      if (typeof request.password !== 'string' || request.password.length === 0) {
        return {
          success: false,
          error: 'Password is required'
        };
      }

      // Find user by username
      const user = await this.findUserByUsername(request.username);
      if (!user) {
        return {
          success: false,
          error: 'Invalid username or password'
        };
      }

      // Check if user is banned
      if ((user as any).is_banned === 1) {
        return {
          success: false,
          error: 'This account has been banned'
        };
      }

      // Check password against hash
      let passwordValid = PasswordHasher.compare(request.password, user.password!);

      // Migration fallback: if password is not a hash and matches plain text, re-hash it
      if (!passwordValid && !PasswordHasher.isHashed(user.password!) && user.password === request.password) {
        passwordValid = true;
        const hashedPassword = PasswordHasher.hash(user.password!);
        const updateStmt = this.unit.prepare<
          unknown,
          { userId: number; password: string }
        >(
          'UPDATE "User" SET password = $password WHERE id = $userId',
          { userId: user.id, password: hashedPassword }
        );
        await updateStmt.run();
      }

      if (!passwordValid) {
        return {
          success: false,
          error: 'Invalid username or password'
        };
      }

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          profilePicture: user.profilePicture,
          joinDate: user.joinDate,
          // Map DB column playtime_seconds to model property playtimeSeconds
          playtimeSeconds: typeof (user as any).playtime_seconds === 'number' ? (user as any).playtime_seconds : 0,
          role: (user as any).role || 'user',
          totalSp: typeof (user as any).total_sp === 'number' ? (user as any).total_sp : 0
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Login failed'
      };
    }
  }

  /**
   * Finds a user by username
   * @param username The username to search for
   * @returns The user if found, undefined otherwise
   */
  private async findUserByUsername(username: string): Promise<User | undefined> {
    // Include playtime_seconds, role, and is_banned
    const stmt = this.unit.prepare<any, { username: string }>(
      'SELECT id, username, password, profilePicture, profilePictureUrl, joinDate, playtime_seconds, role, is_banned, total_sp FROM "User" WHERE username = $username',
      { username }
    );
    return await stmt.get();
  }
}
