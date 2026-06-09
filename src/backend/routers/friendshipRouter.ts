import { Router, Request, Response } from 'express';
import { Unit } from '../database/unit';
import { FriendshipService } from '../services/FriendshipService';
import { MessageService } from '../services/MessageService';

export const friendshipRouter = Router();

friendshipRouter.get('/search', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const query = req.query['q'] as string;
    const excludeUserId = req.query['excludeUserId'] ? parseInt(req.query['excludeUserId'] as string, 10) : undefined;
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

friendshipRouter.post('/request', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { requesterId, addresseeId, initialMessage } = req.body;
    const parsedRequesterId = parseInt(requesterId, 10);
    const parsedAddresseeId = parseInt(addresseeId, 10);
    if (!parsedRequesterId || !parsedAddresseeId) { await unit.complete(false); res.status(400).json({ success: false, error: 'Both requesterId and addresseeId are required' }); return; }
    const service = new FriendshipService(unit);
    const result = await service.sendFriendRequest(parsedRequesterId, parsedAddresseeId);
    if (result.success) {
      if (initialMessage && typeof initialMessage === 'string' && initialMessage.trim().length > 0) {
        const messageService = new MessageService(unit);
        await messageService.storeMessageDirectly(parsedRequesterId, parsedAddresseeId, initialMessage.trim());
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

friendshipRouter.post('/accept', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { friendshipId, userId } = req.body;
    const parsedFriendshipId = parseInt(friendshipId, 10);
    const parsedUserId = parseInt(userId, 10);
    if (!parsedFriendshipId || !parsedUserId) { await unit.complete(false); res.status(400).json({ success: false, error: 'friendshipId and userId are required' }); return; }
    const service = new FriendshipService(unit);
    const result = await service.acceptFriendRequest(parsedFriendshipId, parsedUserId);
    if (result.success) { await unit.complete(true); res.status(200).json(result); } else { await unit.complete(false); res.status(400).json(result); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.post('/decline', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { friendshipId, userId } = req.body;
    const parsedFriendshipId = parseInt(friendshipId, 10);
    const parsedUserId = parseInt(userId, 10);
    if (!parsedFriendshipId || !parsedUserId) { await unit.complete(false); res.status(400).json({ success: false, error: 'friendshipId and userId are required' }); return; }
    const service = new FriendshipService(unit);
    const result = await service.declineFriendRequest(parsedFriendshipId, parsedUserId);
    if (result.success) { await unit.complete(true); res.status(200).json(result); } else { await unit.complete(false); res.status(400).json(result); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.get('/friends/:userId', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    if (!userId) { await unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }
    const service = new FriendshipService(unit);
    const friends = await service.getFriends(userId);
    await unit.complete();
    res.status(200).json({ success: true, friends });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.get('/pending/:userId', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    if (!userId) { await unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }
    const service = new FriendshipService(unit);
    const requests = await service.getPendingRequests(userId);
    await unit.complete();
    res.status(200).json({ success: true, requests });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.get('/sent/:userId', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    if (!userId) { await unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }
    const service = new FriendshipService(unit);
    const requests = await service.getSentRequests(userId);
    await unit.complete();
    res.status(200).json({ success: true, requests });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.delete('/:userId/:friendId', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    const friendId = parseInt(req.params['friendId'] as string, 10);
    if (!userId || !friendId) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid userId or friendId' }); return; }
    const service = new FriendshipService(unit);
    const result = await service.removeFriend(userId, friendId);
    await unit.complete(true);
    res.status(200).json(result);
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});
