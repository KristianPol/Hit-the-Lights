import { Unit } from '../unit';
import { User } from '../model';

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
  public login(request: LoginRequest): LoginResponse {
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
      const user = this.findUserByUsername(request.username);
      if (!user) {
        return {
          success: false,
          error: 'Invalid username or password'
        };
      }

      // Check password (plain text comparison for now)
      if (user.password !== request.password) {
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
          password: user.password
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
  private findUserByUsername(username: string): User | undefined {
    const stmt = this.unit.prepare<User, { username: string }>(
      'SELECT id, username, password FROM User WHERE username = $username',
      { username }
    );
    return stmt.get();
  }
}
