export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

export class PasswordValidator {
  /**
   * Validates a password against security requirements:
   * - Minimum 8 characters
   * - At least 1 uppercase letter
   * - At least 1 lowercase letter
   * - At least 1 digit
   */
  static validate(password: string): PasswordValidationResult {
    if (!password || password.length < 8) {
      return {
        valid: false,
        error: 'Password must be at least 8 characters long'
      };
    }

    if (password.length > 128) {
      return {
        valid: false,
        error: 'Password must be at most 128 characters long'
      };
    }

    if (!/[A-Z]/.test(password)) {
      return {
        valid: false,
        error: 'Password must contain at least one uppercase letter'
      };
    }

    if (!/[a-z]/.test(password)) {
      return {
        valid: false,
        error: 'Password must contain at least one lowercase letter'
      };
    }

    if (!/[0-9]/.test(password)) {
      return {
        valid: false,
        error: 'Password must contain at least one number'
      };
    }

    return { valid: true };
  }
}
