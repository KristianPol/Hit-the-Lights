import { Unit } from '../backend/database/unit';
import { UserService } from '../backend/services/UserService';

describe('UserService', () => {
  let unit: Unit;
  let userService: UserService;

  beforeEach(() => {
    unit = new Unit(false);
    userService = new UserService(unit);
    // Clear tables to prevent test interference
    unit.prepare("DELETE FROM Highscore").run();
    unit.prepare("DELETE FROM Note").run();
    unit.prepare("DELETE FROM Difficulty").run();
    unit.prepare("DELETE FROM Song").run();
    unit.prepare("DELETE FROM User").run();
  });

  afterEach(() => {
    unit.complete(false);
  });

  describe('updateProfilePicture', () => {
    it('should successfully update profile picture for existing user', () => {
      // Arrange: Create a user first
      const insertStmt = unit.prepare<{ id: number }, { username: string; password: string }>(
        'INSERT INTO User (username, password) VALUES ($username, $password) RETURNING id',
        { username: 'testuser', password: 'password123' }
      );
      const user = insertStmt.get();
      expect(user).toBeDefined();

      const base64Image = Buffer.from('fake-image-data').toString('base64');

      // Act
      const result = userService.updateProfilePicture({
        userId: user!.id,
        profilePictureBase64: base64Image
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.profilePictureUrl).toBeDefined();
      expect(result.profilePictureUrl).toContain(`/api/auth/profile-picture/${user!.id}`);
      expect(result.error).toBeUndefined();
    });

    it('should reject update with invalid user ID (zero)', () => {
      const result = userService.updateProfilePicture({
        userId: 0,
        profilePictureBase64: Buffer.from('fake-image').toString('base64')
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid user ID');
    });

    it('should reject update with invalid user ID (negative)', () => {
      const result = userService.updateProfilePicture({
        userId: -1,
        profilePictureBase64: Buffer.from('fake-image').toString('base64')
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid user ID');
    });

    it('should reject update with missing profile picture', () => {
      const result = userService.updateProfilePicture({
        userId: 1,
        profilePictureBase64: ''
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Profile picture is required');
    });

    it('should reject update for non-existent user', () => {
      const result = userService.updateProfilePicture({
        userId: 9999,
        profilePictureBase64: Buffer.from('fake-image').toString('base64')
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should reject update with file larger than 5MB', () => {
      // Arrange: Create a user
      const insertStmt = unit.prepare<{ id: number }, { username: string; password: string }>(
        'INSERT INTO User (username, password) VALUES ($username, $password) RETURNING id',
        { username: 'testuser', password: 'password123' }
      );
      const user = insertStmt.get();

      // Create a base64 string that represents >5MB when decoded
      // 5MB = 5,242,880 bytes. Base64 increases size by ~33%, so we need ~7MB of base64
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB buffer
      const largeBase64 = largeBuffer.toString('base64');

      // Act
      const result = userService.updateProfilePicture({
        userId: user!.id,
        profilePictureBase64: largeBase64
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Profile picture must be less than 5MB');
    });

    it('should accept update with file exactly at 5MB boundary', () => {
      // Arrange: Create a user
      const insertStmt = unit.prepare<{ id: number }, { username: string; password: string }>(
        'INSERT INTO User (username, password) VALUES ($username, $password) RETURNING id',
        { username: 'testuser', password: 'password123' }
      );
      const user = insertStmt.get();

      // Create a base64 string that represents exactly 5MB when decoded
      const exactBuffer = Buffer.alloc(5 * 1024 * 1024); // 5MB buffer
      const exactBase64 = exactBuffer.toString('base64');

      // Act
      const result = userService.updateProfilePicture({
        userId: user!.id,
        profilePictureBase64: exactBase64
      });

      // Assert - should succeed as it's exactly at the boundary
      expect(result.success).toBe(true);
      expect(result.profilePictureUrl).toBeDefined();
    });

    it('should handle various valid base64 strings', () => {
      // Arrange: Create a user
      const insertStmt = unit.prepare<{ id: number }, { username: string; password: string }>(
        'INSERT INTO User (username, password) VALUES ($username, $password) RETURNING id',
        { username: 'testuser', password: 'password123' }
      );
      const user = insertStmt.get();

      // Test with a proper base64 encoded PNG header
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      // Act
      const result = userService.updateProfilePicture({
        userId: user!.id,
        profilePictureBase64: pngBase64
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.profilePictureUrl).toBeDefined();
    });
  });

  describe('getProfilePicture', () => {
    it('should retrieve profile picture for user with picture', () => {
      // Arrange: Create user with profile picture
      const insertStmt = unit.prepare<{ id: number }, { username: string; password: string }>(
        'INSERT INTO User (username, password) VALUES ($username, $password) RETURNING id',
        { username: 'testuser', password: 'password123' }
      );
      const user = insertStmt.get();

      const imageBuffer = Buffer.from('test-image-data');
      const updateStmt = unit.prepare<unknown, { userId: number; profilePicture: Buffer }>(
        'UPDATE User SET profilePicture = $profilePicture WHERE id = $userId',
        { userId: user!.id, profilePicture: imageBuffer }
      );
      updateStmt.run();

      // Act
      const result = userService.getProfilePicture(user!.id);

      // Assert
      expect(result).toBeDefined();
      expect(result!.toString()).toBe('test-image-data');
    });

    it('should return null for user without profile picture', () => {
      // Arrange: Create user without profile picture
      const insertStmt = unit.prepare<{ id: number }, { username: string; password: string }>(
        'INSERT INTO User (username, password) VALUES ($username, $password) RETURNING id',
        { username: 'testuser', password: 'password123' }
      );
      const user = insertStmt.get();

      // Act
      const result = userService.getProfilePicture(user!.id);

      // Assert - SQLite returns null for NULL values
      expect(result).toBeNull();
    });

    it('should return undefined for non-existent user', () => {
      // Act
      const result = userService.getProfilePicture(9999);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should handle binary image data correctly', () => {
      // Arrange: Create user
      const insertStmt = unit.prepare<{ id: number }, { username: string; password: string }>(
        'INSERT INTO User (username, password) VALUES ($username, $password) RETURNING id',
        { username: 'testuser', password: 'password123' }
      );
      const user = insertStmt.get();

      // Simulate binary image data with null bytes and special characters
      const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00]);
      const updateStmt = unit.prepare<unknown, { userId: number; profilePicture: Buffer }>(
        'UPDATE User SET profilePicture = $profilePicture WHERE id = $userId',
        { userId: user!.id, profilePicture: binaryData }
      );
      updateStmt.run();

      // Act
      const result = userService.getProfilePicture(user!.id);

      // Assert
      expect(result).toBeDefined();
      expect(result!.equals(binaryData)).toBe(true);
    });
  });

  describe('getUserById', () => {
    it('should return user data with profile picture URL when user has picture', () => {
      // Arrange: Create user with profile picture
      const insertStmt = unit.prepare<{ id: number }, { username: string; password: string }>(
        'INSERT INTO User (username, password) VALUES ($username, $password) RETURNING id',
        { username: 'testuser', password: 'password123' }
      );
      const user = insertStmt.get();

      const imageBuffer = Buffer.from('test-image-data');
      const updateStmt = unit.prepare<unknown, { userId: number; profilePicture: Buffer }>(
        'UPDATE User SET profilePicture = $profilePicture WHERE id = $userId',
        { userId: user!.id, profilePicture: imageBuffer }
      );
      updateStmt.run();

      // Act
      const result = userService.getUserById(user!.id);

      // Assert
      expect(result).toBeDefined();
      expect(result!.id).toBe(user!.id);
      expect(result!.username).toBe('testuser');
      expect(result!.profilePictureUrl).toBeDefined();
      expect(result!.profilePictureUrl).toContain(`/api/auth/profile-picture/${user!.id}`);
    });

    it('should return user data without profile picture URL when user has no picture', () => {
      // Arrange: Create user without profile picture
      const insertStmt = unit.prepare<{ id: number }, { username: string; password: string }>(
        'INSERT INTO User (username, password) VALUES ($username, $password) RETURNING id',
        { username: 'nopicture', password: 'password123' }
      );
      const user = insertStmt.get();

      // Act
      const result = userService.getUserById(user!.id);

      // Assert
      expect(result).toBeDefined();
      expect(result!.id).toBe(user!.id);
      expect(result!.username).toBe('nopicture');
      expect(result!.profilePictureUrl).toBeUndefined();
    });

    it('should return undefined for non-existent user', () => {
      // Act
      const result = userService.getUserById(9999);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should not include password in user data', () => {
      // Arrange: Create user
      const insertStmt = unit.prepare<{ id: number }, { username: string; password: string }>(
        'INSERT INTO User (username, password) VALUES ($username, $password) RETURNING id',
        { username: 'secureuser', password: 'secretpassword123' }
      );
      const user = insertStmt.get();

      // Act
      const result = userService.getUserById(user!.id);

      // Assert
      expect(result).toBeDefined();
      expect(result!.username).toBe('secureuser');
      expect((result as any).password).toBeUndefined();
    });
  });

  describe('profile picture workflow', () => {
    it('should handle complete profile picture lifecycle', () => {
      // Step 1: Create a user
      const insertStmt = unit.prepare<{ id: number }, { username: string; password: string }>(
        'INSERT INTO User (username, password) VALUES ($username, $password) RETURNING id',
        { username: 'lifecycleuser', password: 'password123' }
      );
      const user = insertStmt.get();

      // Step 2: Verify user has no profile picture initially
      let userData = userService.getUserById(user!.id);
      expect(userData!.profilePictureUrl).toBeUndefined();

      let picture = userService.getProfilePicture(user!.id);
      expect(picture).toBeNull();

      // Step 3: Update profile picture
      const base64Image = Buffer.from('my-profile-picture').toString('base64');
      const updateResult = userService.updateProfilePicture({
        userId: user!.id,
        profilePictureBase64: base64Image
      });
      expect(updateResult.success).toBe(true);

      // Step 4: Verify profile picture is now available
      userData = userService.getUserById(user!.id);
      expect(userData!.profilePictureUrl).toBeDefined();

      picture = userService.getProfilePicture(user!.id);
      expect(picture).toBeDefined();
      expect(picture!.toString()).toBe('my-profile-picture');

      // Step 5: Update profile picture again (replace)
      const newBase64Image = Buffer.from('updated-picture').toString('base64');
      const secondUpdateResult = userService.updateProfilePicture({
        userId: user!.id,
        profilePictureBase64: newBase64Image
      });
      expect(secondUpdateResult.success).toBe(true);

      // Step 6: Verify new picture is stored
      picture = userService.getProfilePicture(user!.id);
      expect(picture!.toString()).toBe('updated-picture');
    });

    it('should handle multiple users with different profile pictures', () => {
      // Create multiple users
      const users = [];
      for (let i = 1; i <= 3; i++) {
        const insertStmt = unit.prepare<{ id: number }, { username: string; password: string }>(
          'INSERT INTO User (username, password) VALUES ($username, $password) RETURNING id',
          { username: `user${i}`, password: 'password123' }
        );
        users.push(insertStmt.get()!);
      }

      // Set profile pictures for users 1 and 3
      const pic1 = Buffer.from('user1-picture').toString('base64');
      const pic3 = Buffer.from('user3-picture').toString('base64');

      userService.updateProfilePicture({ userId: users[0].id, profilePictureBase64: pic1 });
      userService.updateProfilePicture({ userId: users[2].id, profilePictureBase64: pic3 });

      // Verify each user's state
      const user1Data = userService.getUserById(users[0].id);
      expect(user1Data!.profilePictureUrl).toBeDefined();
      expect(userService.getProfilePicture(users[0].id)!.toString()).toBe('user1-picture');

      const user2Data = userService.getUserById(users[1].id);
      expect(user2Data!.profilePictureUrl).toBeUndefined();
      expect(userService.getProfilePicture(users[1].id)).toBeNull();

      const user3Data = userService.getUserById(users[2].id);
      expect(user3Data!.profilePictureUrl).toBeDefined();
      expect(userService.getProfilePicture(users[2].id)!.toString()).toBe('user3-picture');
    });
  });
});
