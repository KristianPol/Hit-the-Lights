import { Router, Request, Response } from 'express';
import { Unit } from '../database/unit';
import { MultiplayerService, FriendshipService, MessageService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';

export const multiplayerRouter = Router();

multiplayerRouter.post('/rooms', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const userId = req.authenticatedUserId!;
    const { difficultyId, inviteeId } = req.body;
    const parsedDifficultyId = parseInt(difficultyId, 10);
    const parsedInviteeId = parseInt(inviteeId, 10);

    if (!parsedDifficultyId || !parsedInviteeId) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'difficultyId and inviteeId are required' });
      return;
    }

    const friendshipService = new FriendshipService(unit);
    const areFriends = await friendshipService.areFriends(userId, parsedInviteeId);
    if (!areFriends) {
      await unit.complete(false);
      res.status(403).json({ success: false, error: 'You can only challenge friends' });
      return;
    }

    const multiplayerService = new MultiplayerService(unit);
    const result = await multiplayerService.createRoom({
      difficultyId: parsedDifficultyId,
      challengerId: userId,
      inviteeId: parsedInviteeId
    });

    if (!result.success) {
      await unit.complete(false);
      res.status(400).json(result);
      return;
    }

    const messageService = new MessageService(unit);
    await messageService.sendMessage({
      senderId: userId,
      receiverId: parsedInviteeId,
      content: `Multiplayer Challenge\nRoom ID: ${result.roomId}\nDifficulty ID: ${parsedDifficultyId}`
    });

    await unit.complete(true);
    res.status(201).json({ success: true, roomId: result.roomId });
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

multiplayerRouter.post('/rooms/:id/accept', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const userId = req.authenticatedUserId!;
    const roomId = req.params['id'] as string;
    const multiplayerService = new MultiplayerService(unit);
    const result = await multiplayerService.acceptInvite(roomId, userId);
    if (!result.success) {
      await unit.complete(false);
      res.status(400).json(result);
      return;
    }
    await unit.complete(true);
    res.status(200).json({ success: true, roomId });
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

multiplayerRouter.get('/rooms/:id', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = req.authenticatedUserId!;
    const roomId = req.params['id'] as string;
    const multiplayerService = new MultiplayerService(unit);
    const room = await multiplayerService.getRoom(roomId);
    if (!room) {
      await unit.complete();
      res.status(404).json({ success: false, error: 'Room not found' });
      return;
    }
    if (room.challengerId !== userId && room.inviteeId !== userId) {
      await unit.complete();
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }
    await unit.complete();
    res.status(200).json({ success: true, room });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});
