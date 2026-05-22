import { Router, Request, Response } from 'express';
import { Unit } from '../database/unit';
import { MessageService } from '../services';
import { FriendshipService } from '../services';
import MessageServiceAsync from '../services/MessageServiceAsync';
import FriendshipServiceAsync from '../services/FriendshipServiceAsync';

export const messageRouter = Router();

messageRouter.post('/send', async (req: Request, res: Response) => {
  // Choose Postgres async path when DATABASE_URL is present, otherwise use legacy Unit/Service
  const usePostgres = !!process.env['DATABASE_URL'];
  const unit = usePostgres ? undefined : new Unit(false);
  try {
    const { senderId, receiverId, content } = req.body;
    const parsedSenderId = parseInt(senderId, 10);
    const parsedReceiverId = parseInt(receiverId, 10);

    if (!parsedSenderId || !parsedReceiverId || !content) {
      if (unit) unit.complete(false);
      res.status(400).json({ success: false, error: 'senderId, receiverId, and content are required' });
      return;
    }

    if (usePostgres) {
      const friendshipService = new FriendshipServiceAsync();
      const areFriends = await friendshipService.areFriends(parsedSenderId, parsedReceiverId);
      if (!areFriends) {
        res.status(403).json({ success: false, error: 'You can only message your friends' });
        return;
      }

      const messageService = new MessageServiceAsync();
      const result = await messageService.sendMessage({ senderId: parsedSenderId, receiverId: parsedReceiverId, content });
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } else {
      // SQLite path
      const friendshipService = new FriendshipService(unit!);
      const areFriends = friendshipService.areFriends(parsedSenderId, parsedReceiverId);
      if (!areFriends) {
        unit!.complete(false);
        res.status(403).json({ success: false, error: 'You can only message your friends' });
        return;
      }

      const messageService = new MessageService(unit!);
      const result = messageService.sendMessage({ senderId: parsedSenderId, receiverId: parsedReceiverId, content });
      if (result.success) {
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

messageRouter.get('/conversation/:userId/:otherUserId', async (req: Request, res: Response) => {
  const usePostgres = !!process.env['DATABASE_URL'];
  const unit = usePostgres ? undefined : new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    const otherUserId = parseInt(req.params['otherUserId'] as string, 10);
    if (!userId || !otherUserId) {
      if (unit) unit.complete();
      res.status(400).json({ success: false, error: 'Invalid userId or otherUserId' });
      return;
    }

    if (usePostgres) {
      const friendshipService = new FriendshipServiceAsync();
      const areFriends = await friendshipService.areFriends(userId, otherUserId);
      if (!areFriends) {
        res.status(403).json({ success: false, error: 'You can only view conversations with your friends' });
        return;
      }
      const messageService = new MessageServiceAsync();
      const messages = await messageService.getConversation(userId, otherUserId);
      res.status(200).json({ success: true, messages });
    } else {
      const friendshipService = new FriendshipService(unit!);
      const areFriends = friendshipService.areFriends(userId, otherUserId);
      if (!areFriends) {
        unit!.complete();
        res.status(403).json({ success: false, error: 'You can only view conversations with your friends' });
        return;
      }
      const messageService = new MessageService(unit!);
      const messages = messageService.getConversation(userId, otherUserId);
      unit!.complete();
      res.status(200).json({ success: true, messages });
    }
  } catch (error: any) {
    if (unit) unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

messageRouter.get('/conversations/:userId', async (req: Request, res: Response) => {
  const usePostgres = !!process.env['DATABASE_URL'];
  const unit = usePostgres ? undefined : new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    if (!userId) {
      if (unit) unit.complete();
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    if (usePostgres) {
      const messageService = new MessageServiceAsync();
      const conversations = await messageService.getConversations(userId);
      res.status(200).json({ success: true, conversations });
    } else {
      const messageService = new MessageService(unit!);
      const conversations = messageService.getConversations(userId);
      unit!.complete();
      res.status(200).json({ success: true, conversations });
    }
  } catch (error: any) {
    if (unit) unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

messageRouter.post('/read', async (req: Request, res: Response) => {
  const usePostgres = !!process.env['DATABASE_URL'];
  const unit = usePostgres ? undefined : new Unit(false);
  try {
    const { messageIds, userId } = req.body;
    const parsedUserId = parseInt(userId, 10);
    if (!Array.isArray(messageIds) || !parsedUserId) {
      if (unit) unit.complete(false);
      res.status(400).json({ success: false, error: 'messageIds array and userId are required' });
      return;
    }

    if (usePostgres) {
      const messageService = new MessageServiceAsync();
      const result = await messageService.markAsRead(messageIds, parsedUserId);
      if (result.success) res.status(200).json(result); else res.status(400).json(result);
    } else {
      const messageService = new MessageService(unit!);
      const result = messageService.markAsRead(messageIds, parsedUserId);
      if (result.success) { unit!.complete(true); res.status(200).json(result); } else { unit!.complete(false); res.status(400).json(result); }
    }
  } catch (error: any) {
    if (unit) unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

messageRouter.post('/read-conversation', async (req: Request, res: Response) => {
  const usePostgres = !!process.env['DATABASE_URL'];
  const unit = usePostgres ? undefined : new Unit(false);
  try {
    const { senderId, receiverId } = req.body;
    const parsedSenderId = parseInt(senderId, 10);
    const parsedReceiverId = parseInt(receiverId, 10);
    if (!parsedSenderId || !parsedReceiverId) { if (unit) unit.complete(false); res.status(400).json({ success: false, error: 'senderId and receiverId are required' }); return; }

    if (usePostgres) {
      const messageService = new MessageServiceAsync();
      const result = await messageService.markConversationAsRead(parsedSenderId, parsedReceiverId);
      if (result.success) res.status(200).json(result); else res.status(400).json(result);
    } else {
      const messageService = new MessageService(unit!);
      const result = messageService.markConversationAsRead(parsedSenderId, parsedReceiverId);
      if (result.success) { unit!.complete(true); res.status(200).json(result); } else { unit!.complete(false); res.status(400).json(result); }
    }
  } catch (error: any) {
    if (unit) unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

messageRouter.get('/unread/:userId', async (req: Request, res: Response) => {
  const usePostgres = !!process.env['DATABASE_URL'];
  const unit = usePostgres ? undefined : new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    if (!userId) { if (unit) unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }

    if (usePostgres) {
      const messageService = new MessageServiceAsync();
      const count = await messageService.getUnreadCount(userId);
      res.status(200).json({ success: true, count });
    } else {
      const messageService = new MessageService(unit!);
      const count = messageService.getUnreadCount(userId);
      unit!.complete();
      res.status(200).json({ success: true, count });
    }
  } catch (error: any) {
    if (unit) unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});
