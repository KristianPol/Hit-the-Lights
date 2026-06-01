import { Router, Request, Response } from 'express';
import { Unit } from '../database/unit';
import { FriendshipService } from '../services/FriendshipService';
import { MessageService } from '../services/MessageService';

export const friendshipRouter = Router();

friendshipRouter.get('/search', (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const query = req.query['q'] as string;
    const excludeUserId = req.query['excludeUserId'] ? parseInt(req.query['excludeUserId'] as string, 10) : undefined;
    if (!query || query.trim().length === 0) { unit.complete(); res.status(200).json({ success: true, users: [] }); return; }
    const service = new FriendshipService(unit);
    const users = service.searchUsers(query, excludeUserId);
    unit.complete();
    res.status(200).json({ success: true, users });
  } catch (error: any) {
    unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.post('/request', (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { requesterId, addresseeId, initialMessage } = req.body;
    const parsedRequesterId = parseInt(requesterId, 10);
    const parsedAddresseeId = parseInt(addresseeId, 10);
    if (!parsedRequesterId || !parsedAddresseeId) { unit.complete(false); res.status(400).json({ success: false, error: 'Both requesterId and addresseeId are required' }); return; }
    const service = new FriendshipService(unit);
    const result = service.sendFriendRequest(parsedRequesterId, parsedAddresseeId);
    if (result.success) {
      if (initialMessage && typeof initialMessage === 'string' && initialMessage.trim().length > 0) {
        const messageService = new MessageService(unit);
        messageService.storeMessageDirectly(parsedRequesterId, parsedAddresseeId, initialMessage.trim());
      }
      unit.complete(true);
      res.status(201).json(result);
    } else {
      unit.complete(false);
      res.status(400).json(result);
    }
  } catch (error: any) {
    unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.post('/accept', (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { friendshipId, userId } = req.body;
    const parsedFriendshipId = parseInt(friendshipId, 10);
    const parsedUserId = parseInt(userId, 10);
    if (!parsedFriendshipId || !parsedUserId) { unit.complete(false); res.status(400).json({ success: false, error: 'friendshipId and userId are required' }); return; }
    const service = new FriendshipService(unit);
    const result = service.acceptFriendRequest(parsedFriendshipId, parsedUserId);
    if (result.success) { unit.complete(true); res.status(200).json(result); } else { unit.complete(false); res.status(400).json(result); }
  } catch (error: any) {
    unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.post('/decline', (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { friendshipId, userId } = req.body;
    const parsedFriendshipId = parseInt(friendshipId, 10);
    const parsedUserId = parseInt(userId, 10);
    if (!parsedFriendshipId || !parsedUserId) { unit.complete(false); res.status(400).json({ success: false, error: 'friendshipId and userId are required' }); return; }
    const service = new FriendshipService(unit);
    const result = service.declineFriendRequest(parsedFriendshipId, parsedUserId);
    if (result.success) { unit.complete(true); res.status(200).json(result); } else { unit.complete(false); res.status(400).json(result); }
  } catch (error: any) {
    unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.get('/friends/:userId', (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    if (!userId) { unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }
    const service = new FriendshipService(unit);
    const friends = service.getFriends(userId);
    unit.complete();
    res.status(200).json({ success: true, friends });
  } catch (error: any) {
    unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.get('/pending/:userId', (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    if (!userId) { unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }
    const service = new FriendshipService(unit);
    const requests = service.getPendingRequests(userId);
    unit.complete();
    res.status(200).json({ success: true, requests });
  } catch (error: any) {
    unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.get('/sent/:userId', (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    if (!userId) { unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }
    const service = new FriendshipService(unit);
    const requests = service.getSentRequests(userId);
    unit.complete();
    res.status(200).json({ success: true, requests });
  } catch (error: any) {
    unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.delete('/:userId/:friendId', (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    const friendId = parseInt(req.params['friendId'] as string, 10);
    if (!userId || !friendId) { unit.complete(false); res.status(400).json({ success: false, error: 'Invalid userId or friendId' }); return; }
    const service = new FriendshipService(unit);
    const result = service.removeFriend(userId, friendId);
    unit.complete(true);
    res.status(200).json(result);
  } catch (error: any) {
    unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});
