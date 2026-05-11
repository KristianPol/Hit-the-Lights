/**
 * Async Authentication Service for Postgres
 * Uses PostgresDB for async database operations.
 */

import { PostgresDB } from '../database/postgres-db';
import { User } from '../model';
import { PasswordHasher } from '../utils/PasswordHasher';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: User;
  error?: string;
}

export class AuthenticationServiceAsync {
  /**
   * Authenticates a user (async)
   */
  public async login(request: LoginRequest): Promise<LoginResponse> {
    try {
      // Validate input
      if (!request.username || request.username.length < 3) {
        return {
          success: false,
          error: 'Username must be at least 3 characters'
        };
      }

      if (!request.password || request.password.length < 6) {
        return {
          success: false,
          error: 'Password must be at least 6 characters'
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

      // Check password against hash
      let passwordValid = PasswordHasher.compare(request.password, user.password);

      // Migration fallback: if password is not a hash and matches plain text, re-hash it
      if (!passwordValid && !PasswordHasher.isHashed(user.password) && user.password === request.password) {
        passwordValid = true;
        const hashedPassword = PasswordHasher.hash(user.password);
        await PostgresDB.execute(
          'UPDATE "User" SET password = $1 WHERE id = $2',
          [hashedPassword, user.id]
        );
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
          password: user.password,
          profilePicture: user.profilePicture,
          joinDate: user.joinDate,
          playtimeSeconds: user.playtime_seconds || 0
        }
      };
    } catch (error: any) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.message || 'Login failed'
      };
    }
  }

  /**
   * Finds a user by username (async)
   */
  private async findUserByUsername(username: string): Promise<any | undefined> {
    return await PostgresDB.queryOne(
      'SELECT id, username, password, "profilePicture", "joinDate", playtime_seconds FROM "User" WHERE username = $1',
      [username]
    );
  }
}

