import { Router, Request, Response } from 'express';
import { Unit } from '../database/unit';
import { FriendshipService } from '../services/FriendshipService';
import { MessageService } from '../services/MessageService';
import { authMiddleware } from '../middleware/authMiddleware';

export const friendshipRouter = Router();

friendshipRouter.get('/search', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const query = req.query['q'] as string;
    const excludeUserId = req.authenticatedUserId ?? (req.query['excludeUserId'] ? parseInt(req.query['excludeUserId'] as string, 10) : undefined);
    if (!query || query.trim().length === 0) { await unit.complete(); res.status(200).json({ success: true, users: [] }); return; }
    const service = new FriendshipService(unit);
    const users = await service.searchUsers(query, excludeUserId);
    await unit.complete();
    res.status(200).json({ success: true, users });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.post('/request', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const requesterId = req.authenticatedUserId!;
    const { addresseeId, initialMessage } = req.body;
    const parsedAddresseeId = parseInt(addresseeId, 10);
    if (!parsedAddresseeId) { await unit.complete(false); res.status(400).json({ success: false, error: 'addresseeId is required' }); return; }
    const service = new FriendshipService(unit);
    const result = await service.sendFriendRequest(requesterId, parsedAddresseeId);
    if (result.success) {
      if (initialMessage && typeof initialMessage === 'string' && initialMessage.trim().length > 0) {
        const messageService = new MessageService(unit);
        await messageService.storeMessageDirectly(requesterId, parsedAddresseeId, initialMessage.trim());
      }
      await unit.complete(true);
      res.status(201).json(result);
    } else {
      await unit.complete(false);
      res.status(400).json(result);
    }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.post('/accept', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { friendshipId } = req.body;
    const userId = req.authenticatedUserId!;
    const parsedFriendshipId = parseInt(friendshipId, 10);
    if (!parsedFriendshipId) { await unit.complete(false); res.status(400).json({ success: false, error: 'friendshipId is required' }); return; }
    const service = new FriendshipService(unit);
    const result = await service.acceptFriendRequest(parsedFriendshipId, userId);
    if (result.success) { await unit.complete(true); res.status(200).json(result); } else { await unit.complete(false); res.status(400).json(result); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.post('/decline', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { friendshipId } = req.body;
    const userId = req.authenticatedUserId!;
    const parsedFriendshipId = parseInt(friendshipId, 10);
    if (!parsedFriendshipId) { await unit.complete(false); res.status(400).json({ success: false, error: 'friendshipId is required' }); return; }
    const service = new FriendshipService(unit);
    const result = await service.declineFriendRequest(parsedFriendshipId, userId);
    if (result.success) { await unit.complete(true); res.status(200).json(result); } else { await unit.complete(false); res.status(400).json(result); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.get('/friends/:userId', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const requestedUserId = parseInt(req.params['userId'] as string, 10);
    const authUserId = req.authenticatedUserId!;
    if (requestedUserId !== authUserId) { await unit.complete(); res.status(403).json({ success: false, error: 'Forbidden' }); return; }
    if (!requestedUserId) { await unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }
    const service = new FriendshipService(unit);
    const friends = await service.getFriends(requestedUserId);
    await unit.complete();
    res.status(200).json({ success: true, friends });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.get('/pending/:userId', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const requestedUserId = parseInt(req.params['userId'] as string, 10);
    const authUserId = req.authenticatedUserId!;
    if (requestedUserId !== authUserId) { await unit.complete(); res.status(403).json({ success: false, error: 'Forbidden' }); return; }
    if (!requestedUserId) { await unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }
    const service = new FriendshipService(unit);
    const requests = await service.getPendingRequests(requestedUserId);
    await unit.complete();
    res.status(200).json({ success: true, requests });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.get('/sent/:userId', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const requestedUserId = parseInt(req.params['userId'] as string, 10);
    const authUserId = req.authenticatedUserId!;
    if (requestedUserId !== authUserId) { await unit.complete(); res.status(403).json({ success: false, error: 'Forbidden' }); return; }
    if (!requestedUserId) { await unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }
    const service = new FriendshipService(unit);
    const requests = await service.getSentRequests(requestedUserId);
    await unit.complete();
    res.status(200).json({ success: true, requests });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.get('/suggestions/:userId', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const requestedUserId = parseInt(req.params['userId'] as string, 10);
    const authUserId = req.authenticatedUserId!;
    if (requestedUserId !== authUserId) { await unit.complete(); res.status(403).json({ success: false, error: 'Forbidden' }); return; }
    if (!requestedUserId) { await unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }
    const service = new FriendshipService(unit);
    const result = await service.getSuggestions(requestedUserId);
    await unit.complete();
    res.status(200).json(result);
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.delete('/:userId/:friendId', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const requestedUserId = parseInt(req.params['userId'] as string, 10);
    const friendId = parseInt(req.params['friendId'] as string, 10);
    const authUserId = req.authenticatedUserId!;
    if (requestedUserId !== authUserId) { await unit.complete(false); res.status(403).json({ success: false, error: 'Forbidden' }); return; }
    if (!requestedUserId || !friendId) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid userId or friendId' }); return; }
    const service = new FriendshipService(unit);
    const result = await service.removeFriend(requestedUserId, friendId);
    await unit.complete(true);
    res.status(200).json(result);
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});
