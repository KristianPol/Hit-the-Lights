import { Router, Request, Response } from 'express';
import { Unit } from '../database/unit';
import { HTLService } from '../services/HTLService';
import { RegistrationService, AuthenticationService, UserService } from '../services';

export const authRouter = Router();

authRouter.post('/register', (req: Request, res: Response) => {
  const unit = new Unit(false);

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
      return;
    }

    const registrationService = new RegistrationService(unit);
    const result = registrationService.register({ username, password });

    if (result.success) {
      unit.complete(true); // Commit transaction
      res.status(201).json({
        success: true,
        userId: result.userId,
        message: 'User registered successfully'
      });
    } else {
      unit.complete(false); // Rollback transaction
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    unit.complete(false); // Rollback transaction
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});


authRouter.post('/login', (req: Request, res: Response) => {
  const unit = new Unit(true); // Read-only for login

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      unit.complete();
      res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
      return;
    }

    const authService = new AuthenticationService(unit);
    const result = authService.login({ username, password });

    if (result.success) {
      // Return user without password
      const htlService = new HTLService(unit);
      const userJson = htlService.userToJSON(result.user!);

      unit.complete(); // Close read-only connection

      res.status(200).json({
        success: true,
        user: userJson,
        message: 'Login successful'
      });
    } else {
      unit.complete(); // Close read-only connection
      res.status(401).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    unit.complete(); // Close read-only connection
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

authRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    service: 'auth',
    timestamp: new Date().toISOString()
  });
});

// Update profile picture
authRouter.post('/profile-picture', (req: Request, res: Response) => {
  console.log('POST /api/auth/profile-picture - Received request');
  const unit = new Unit(false);

  try {
    const { userId, profilePictureBase64 } = req.body;
    console.log('Request body:', { userId: userId, hasProfilePicture: !!profilePictureBase64 });

    if (!userId || !profilePictureBase64) {
      console.log('Validation failed: Missing userId or profilePictureBase64');
      unit.complete(false);
      res.status(400).json({
        success: false,
        error: 'User ID and profile picture are required'
      });
      return;
    }

    const userService = new UserService(unit);
    console.log('Calling updateProfilePicture with userId:', parseInt(userId.toString(), 10));
    const result = userService.updateProfilePicture({
      userId: parseInt(userId.toString(), 10),
      profilePictureBase64
    });

    console.log('updateProfilePicture result:', { success: result.success, error: result.error });

    if (result.success) {
      console.log('Committing transaction...');
      unit.complete(true);
      console.log('Transaction committed, sending success response');
      // Add cache-busting timestamp to the URL
      const profilePictureUrl = `http://localhost:3000/api/auth/profile-picture/${parseInt(userId.toString(), 10)}?t=${Date.now()}`;
      res.status(200).json({
        success: true,
        profilePictureUrl: profilePictureUrl,
        message: 'Profile picture updated successfully'
      });
    } else {
      console.log('Rolling back transaction...');
      unit.complete(false);
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    console.error('Error in /profile-picture:', error);
    unit.complete(false);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// Get profile picture
authRouter.get('/profile-picture/:userId', (req: Request, res: Response) => {
  console.log('GET /api/auth/profile-picture/' + req.params['userId']);
  const unit = new Unit(true);

  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    console.log('Fetching profile picture for userId:', userId);

    if (!userId || userId <= 0) {
      console.log('Invalid user ID:', userId);
      unit.complete();
      res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
      return;
    }

    const userService = new UserService(unit);
    const profilePicture = userService.getProfilePicture(userId);
    console.log('Profile picture found:', !!profilePicture, 'Length:', profilePicture?.length);

    if (!profilePicture) {
      unit.complete();
      res.status(404).json({
        success: false,
        error: 'Profile picture not found'
      });
      return;
    }

    unit.complete();

    // Set content type based on image format
    // Check magic numbers to determine image type
    let contentType = 'image/png'; // default
    if (profilePicture.length > 0) {
      // JPEG starts with FF D8 FF
      if (profilePicture[0] === 0xff && profilePicture[1] === 0xd8) {
        contentType = 'image/jpeg';
      }
      // PNG starts with 89 50 4E 47
      else if (
        profilePicture[0] === 0x89 &&
        profilePicture[1] === 0x50 &&
        profilePicture[2] === 0x4e &&
        profilePicture[3] === 0x47
      ) {
        contentType = 'image/png';
      }
      // GIF starts with GIF87a or GIF89a
      else if (
        profilePicture[0] === 0x47 &&
        profilePicture[1] === 0x49 &&
        profilePicture[2] === 0x46
      ) {
        contentType = 'image/gif';
      }
      // WebP starts with RIFF....WEBP
      else if (
        profilePicture[0] === 0x52 &&
        profilePicture[1] === 0x49 &&
        profilePicture[2] === 0x46 &&
        profilePicture[3] === 0x46 &&
        profilePicture.length > 11 &&
        profilePicture[8] === 0x57 &&
        profilePicture[9] === 0x45 &&
        profilePicture[10] === 0x42 &&
        profilePicture[11] === 0x50
      ) {
        contentType = 'image/webp';
      }
    }

    console.log('Sending image with content-type:', contentType, 'size:', profilePicture.length);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(profilePicture);
  } catch (error: any) {
    unit.complete();
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// Get user by ID (including profile picture URL)
authRouter.get('/user/:userId', (req: Request, res: Response) => {
  const unit = new Unit(true);

  try {
    const userId = parseInt(req.params['userId'] as string, 10);

    if (!userId || userId <= 0) {
      unit.complete();
      res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
      return;
    }

    const userService = new UserService(unit);
    const user = userService.getUserById(userId);

    if (!user) {
      unit.complete();
      res.status(404).json({
        success: false,
        error: 'User not found'
      });
      return;
    }

    unit.complete();
    res.status(200).json({
      success: true,
      user
    });
  } catch (error: any) {
    unit.complete();
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});
