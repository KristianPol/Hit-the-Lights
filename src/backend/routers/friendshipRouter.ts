import { Router, Request, Response } from 'express';
import { Unit } from '../database/unit';
import { FriendshipService } from '../services/FriendshipService';
import { MessageService } from '../services/MessageService';
import FriendshipServiceAsync from '../services/FriendshipServiceAsync';
import MessageServiceAsync from '../services/MessageServiceAsync';

export const friendshipRouter = Router();

friendshipRouter.get('/search', async (req: Request, res: Response) => {
  const usePostgres = !!process.env['DATABASE_URL'];
  const unit = usePostgres ? undefined : new Unit(true);
  try {
    const query = req.query['q'] as string;
    const excludeUserId = req.query['excludeUserId'] ? parseInt(req.query['excludeUserId'] as string, 10) : undefined;
    if (!query || query.trim().length === 0) { if (unit) unit.complete(); res.status(200).json({ success: true, users: [] }); return; }
    if (usePostgres) {
      const svc = new FriendshipServiceAsync();
      const users = await svc.searchUsers(query, excludeUserId);
      res.status(200).json({ success: true, users });
    } else {
      const service = new FriendshipService(unit!);
      const users = service.searchUsers(query, excludeUserId);
      unit!.complete();
      res.status(200).json({ success: true, users });
    }
  } catch (error: any) {
    if (unit) unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.post('/request', async (req: Request, res: Response) => {
  const usePostgres = !!process.env['DATABASE_URL'];
  const unit = usePostgres ? undefined : new Unit(false);
  try {
    const { requesterId, addresseeId, initialMessage } = req.body;
    const parsedRequesterId = parseInt(requesterId, 10);
    const parsedAddresseeId = parseInt(addresseeId, 10);
    if (!parsedRequesterId || !parsedAddresseeId) { if (unit) unit.complete(false); res.status(400).json({ success: false, error: 'Both requesterId and addresseeId are required' }); return; }
    if (usePostgres) {
      const svc = new FriendshipServiceAsync();
      const result = await svc.sendFriendRequest(parsedRequesterId, parsedAddresseeId);
      if (result.success) {
        if (initialMessage && typeof initialMessage === 'string' && initialMessage.trim().length > 0) {
          const messageService = new MessageServiceAsync();
          await messageService.storeMessageDirectly(parsedRequesterId, parsedAddresseeId, initialMessage.trim());
        }
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } else {
      const service = new FriendshipService(unit!);
      const result = service.sendFriendRequest(parsedRequesterId, parsedAddresseeId);
      if (result.success) {
        if (initialMessage && typeof initialMessage === 'string' && initialMessage.trim().length > 0) {
          const messageService = new MessageService(unit!);
          messageService.storeMessageDirectly(parsedRequesterId, parsedAddresseeId, initialMessage.trim());
        }
        unit!.complete(true);
        res.status(201).json(result);
      } else {
        unit!.complete(false);
        res.status(400).json(result);
      }
    }
  } catch (error: any) {
    if (unit) unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.post('/accept', async (req: Request, res: Response) => {
  const usePostgres = !!process.env['DATABASE_URL'];
  const unit = usePostgres ? undefined : new Unit(false);
  try {
    const { friendshipId, userId } = req.body;
    const parsedFriendshipId = parseInt(friendshipId, 10);
    const parsedUserId = parseInt(userId, 10);
    if (!parsedFriendshipId || !parsedUserId) { if (unit) unit.complete(false); res.status(400).json({ success: false, error: 'friendshipId and userId are required' }); return; }
    if (usePostgres) {
      const svc = new FriendshipServiceAsync();
      const result = await svc.acceptFriendRequest(parsedFriendshipId, parsedUserId);
      if (result.success) res.status(200).json(result); else res.status(400).json(result);
    } else {
      const service = new FriendshipService(unit!);
      const result = service.acceptFriendRequest(parsedFriendshipId, parsedUserId);
      if (result.success) { unit!.complete(true); res.status(200).json(result); } else { unit!.complete(false); res.status(400).json(result); }
    }
  } catch (error: any) {
    if (unit) unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.post('/decline', async (req: Request, res: Response) => {
  const usePostgres = !!process.env['DATABASE_URL'];
  const unit = usePostgres ? undefined : new Unit(false);
  try {
    const { friendshipId, userId } = req.body;
    const parsedFriendshipId = parseInt(friendshipId, 10);
    const parsedUserId = parseInt(userId, 10);
    if (!parsedFriendshipId || !parsedUserId) { if (unit) unit.complete(false); res.status(400).json({ success: false, error: 'friendshipId and userId are required' }); return; }
    if (usePostgres) {
      const svc = new FriendshipServiceAsync();
      const result = await svc.declineFriendRequest(parsedFriendshipId, parsedUserId);
      if (result.success) res.status(200).json(result); else res.status(400).json(result);
    } else {
      const service = new FriendshipService(unit!);
      const result = service.declineFriendRequest(parsedFriendshipId, parsedUserId);
      if (result.success) { unit!.complete(true); res.status(200).json(result); } else { unit!.complete(false); res.status(400).json(result); }
    }
  } catch (error: any) {
    if (unit) unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.get('/friends/:userId', async (req: Request, res: Response) => {
  const usePostgres = !!process.env['DATABASE_URL'];
  const unit = usePostgres ? undefined : new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    if (!userId) { if (unit) unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }
    if (usePostgres) {
      const svc = new FriendshipServiceAsync();
      const friends = await svc.getFriends(userId);
      res.status(200).json({ success: true, friends });
    } else {
      const service = new FriendshipService(unit!);
      const friends = service.getFriends(userId);
      unit!.complete();
      res.status(200).json({ success: true, friends });
    }
  } catch (error: any) {
    if (unit) unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.get('/pending/:userId', async (req: Request, res: Response) => {
  const usePostgres = !!process.env['DATABASE_URL'];
  const unit = usePostgres ? undefined : new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    if (!userId) { if (unit) unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }
    if (usePostgres) {
      const svc = new FriendshipServiceAsync();
      const requests = await svc.getPendingRequests(userId);
      res.status(200).json({ success: true, requests });
    } else {
      const service = new FriendshipService(unit!);
      const requests = service.getPendingRequests(userId);
      unit!.complete();
      res.status(200).json({ success: true, requests });
    }
  } catch (error: any) {
    if (unit) unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.get('/sent/:userId', async (req: Request, res: Response) => {
  const usePostgres = !!process.env['DATABASE_URL'];
  const unit = usePostgres ? undefined : new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    if (!userId) { if (unit) unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }
    if (usePostgres) {
      const svc = new FriendshipServiceAsync();
      const requests = await svc.getSentRequests(userId);
      res.status(200).json({ success: true, requests });
    } else {
      const service = new FriendshipService(unit!);
      const requests = service.getSentRequests(userId);
      unit!.complete();
      res.status(200).json({ success: true, requests });
    }
  } catch (error: any) {
    if (unit) unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

friendshipRouter.delete('/:userId/:friendId', async (req: Request, res: Response) => {
  const usePostgres = !!process.env['DATABASE_URL'];
  const unit = usePostgres ? undefined : new Unit(false);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    const friendId = parseInt(req.params['friendId'] as string, 10);
    if (!userId || !friendId) { if (unit) unit.complete(false); res.status(400).json({ success: false, error: 'Invalid userId or friendId' }); return; }
    if (usePostgres) {
      const svc = new FriendshipServiceAsync();
      const result = await svc.removeFriend(userId, friendId);
      res.status(200).json(result);
    } else {
      const service = new FriendshipService(unit!);
      const result = service.removeFriend(userId, friendId);
      unit!.complete(true);
      res.status(200).json(result);
    }
  } catch (error: any) {
    if (unit) unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});
