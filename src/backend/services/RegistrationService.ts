import { Unit } from '../unit';
import { HTLService } from '../HTLService';
import { User } from '../model';

export interface RegistrationRequest {
  username: string;
  password: string;
}

export interface RegistrationResponse {
  success: boolean;
  userId?: number;
  error?: string;
}

export class RegistrationService {
  private htlService: HTLService;

  constructor(private unit: Unit) {
    this.htlService = new HTLService(unit);
  }

  /**
   * Registers a new user
   * @param request Registration request with username and password
   * @returns Registration response with success status and userId or error
   */
  public register(request: RegistrationRequest): RegistrationResponse {
    try {
      // Validate input using HTLService
      const user = this.htlService.userFromJSON({
        username: request.username,
        password: request.password
      });

      // Check if username already exists
      const existingUser = this.findUserByUsername(user.username);
      if (existingUser) {
        return {
          success: false,
          error: 'Username already exists'
        };
      }

      // Insert new user
      const stmt = this.unit.prepare<{ id: number }, { username: string; password: string }>(
        'INSERT INTO User (username, password) VALUES ($username, $password) RETURNING id',
        { username: user.username, password: user.password }
      );

      const result = stmt.get();
      if (!result) {
        return {
          success: false,
          error: 'Failed to create user'
        };
      }

      return {
        success: true,
        userId: result.id
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Registration failed'
      };
    }
  }

  /**
   * Finds a user by username
   * @param username The username to search for
   * @returns The user if found, undefined otherwise
   */
  private findUserByUsername(username: string): User | undefined {
    const stmt = this.unit.prepare<User, { username: string }>(
      'SELECT id, username, password FROM User WHERE username = $username',
      { username }
    );
    return stmt.get();
  }
}
