/**
 * Async Registration Service for Postgres
 */

import { PostgresDB } from '../database/postgres-db';
import { HTLService } from './HTLService';
import { User } from '../model';
import { PasswordHasher } from '../utils/PasswordHasher';

export interface RegistrationRequest {
  username: string;
  password: string;
}

export interface RegistrationResponse {
  success: boolean;
  userId?: number;
  user?: User;
  error?: string;
}

export class RegistrationServiceAsync {
  private htlService: HTLService;

  constructor() {
    this.htlService = new HTLService(null as any); // HTLService is used only for validation here
  }

  /**
   * Registers a new user (async)
   */
  public async register(request: RegistrationRequest): Promise<RegistrationResponse> {
    try {
      // Validate input
      const user = this.htlService.userFromJSON({
        username: request.username,
        password: request.password
      });

      // Check if username already exists
      const existingUser = await this.findUserByUsername(user.username);
      if (existingUser) {
        return {
          success: false,
          error: 'Username already exists'
        };
      }

      // Hash password before storing
      const hashedPassword = PasswordHasher.hash(user.password);

      // Insert new user with RETURNING id
      const result = await PostgresDB.insertReturning<{ id: number }>(
        'INSERT INTO "User" (username, password, "joinDate") VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING id',
        [user.username, hashedPassword]
      );

      if (!result) {
        return {
          success: false,
          error: 'Failed to create user'
        };
      }

      const newUser = await this.findUserById(result.id);

      return {
        success: true,
        userId: result.id,
        user: newUser
      };
    } catch (error: any) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: error.message || 'Registration failed'
      };
    }
  }

  /**
   * Finds a user by username (async)
   */
  private async findUserByUsername(username: string): Promise<User | undefined> {
    return await PostgresDB.queryOne<User>(
      'SELECT id, username, password, "profilePicture", "joinDate" FROM "User" WHERE username = $1',
      [username]
    );
  }

  /**
   * Finds a user by ID (async)
   */
  private async findUserById(userId: number): Promise<User | undefined> {
    return await PostgresDB.queryOne<User>(
      'SELECT id, username, password, "profilePicture", "joinDate" FROM "User" WHERE id = $1',
      [userId]
    );
  }
}

