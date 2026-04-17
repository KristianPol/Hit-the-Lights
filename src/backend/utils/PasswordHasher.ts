import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export class PasswordHasher {
  /**
   * Hashes a plain text password using bcrypt
   */
  public static hash(password: string): string {
    return bcrypt.hashSync(password, SALT_ROUNDS);
  }

  /**
   * Compares a plain text password with a bcrypt hash
   */
  public static compare(password: string, hash: string): boolean {
    return bcrypt.compareSync(password, hash);
  }

  /**
   * Checks if a password string looks like a bcrypt hash
   */
  public static isHashed(password: string): boolean {
    return password.startsWith('$2');
  }
}
