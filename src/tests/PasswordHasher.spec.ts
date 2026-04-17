import { PasswordHasher } from '../backend/utils/PasswordHasher';

describe('PasswordHasher', () => {
  describe('hash', () => {
    it('should return a bcrypt hash starting with $2', () => {
      const hash = PasswordHasher.hash('password123');
      expect(hash).toMatch(/^\$2[aby]?\$/);
    });

    it('should produce different hashes for the same password', () => {
      const hash1 = PasswordHasher.hash('password123');
      const hash2 = PasswordHasher.hash('password123');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('compare', () => {
    it('should return true for a correct password', () => {
      const hash = PasswordHasher.hash('password123');
      const result = PasswordHasher.compare('password123', hash);
      expect(result).toBe(true);
    });

    it('should return false for an incorrect password', () => {
      const hash = PasswordHasher.hash('password123');
      const result = PasswordHasher.compare('wrongpassword', hash);
      expect(result).toBe(false);
    });
  });

  describe('isHashed', () => {
    it('should return true for a bcrypt hash', () => {
      const hash = PasswordHasher.hash('password123');
      expect(PasswordHasher.isHashed(hash)).toBe(true);
    });

    it('should return false for a plain text password', () => {
      expect(PasswordHasher.isHashed('password123')).toBe(false);
    });

    it('should return false for an empty string', () => {
      expect(PasswordHasher.isHashed('')).toBe(false);
    });
  });
});
