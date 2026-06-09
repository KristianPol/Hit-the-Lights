import { Router, Request, Response } from 'express';
import { Unit } from '../database/unit';
import { MessageService } from '../services';
import { FriendshipService } from '../services';

export const messageRouter = Router();

messageRouter.post('/send', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { senderId, receiverId, content } = req.body;
    const parsedSenderId = parseInt(senderId, 10);
    const parsedReceiverId = parseInt(receiverId, 10);

    if (!parsedSenderId || !parsedReceiverId || !content) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'senderId, receiverId, and content are required' });
      return;
    }

    const friendshipService = new FriendshipService(unit);
    const areFriends = await friendshipService.areFriends(parsedSenderId, parsedReceiverId);
    if (!areFriends) {
      await unit.complete(false);
      res.status(403).json({ success: false, error: 'You can only message your friends' });
      return;
    }

    const messageService = new MessageService(unit);
    const result = await messageService.sendMessage({ senderId: parsedSenderId, receiverId: parsedReceiverId, content });
    if (result.success) {
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

messageRouter.get('/conversation/:userId/:otherUserId', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    const otherUserId = parseInt(req.params['otherUserId'] as string, 10);
    if (!userId || !otherUserId) {
      await unit.complete();
      res.status(400).json({ success: false, error: 'Invalid userId or otherUserId' });
      return;
    }

    const friendshipService = new FriendshipService(unit);
    const areFriends = await friendshipService.areFriends(userId, otherUserId);
    if (!areFriends) {
      await unit.complete();
      res.status(403).json({ success: false, error: 'You can only view conversations with your friends' });
      return;
    }
    const messageService = new MessageService(unit);
    const messages = await messageService.getConversation(userId, otherUserId);
    await unit.complete();
    res.status(200).json({ success: true, messages });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

messageRouter.get('/conversations/:userId', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    if (!userId) {
      await unit.complete();
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    const messageService = new MessageService(unit);
    const conversations = await messageService.getConversations(userId);
    await unit.complete();
    res.status(200).json({ success: true, conversations });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

messageRouter.post('/read', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { messageIds, userId } = req.body;
    const parsedUserId = parseInt(userId, 10);
    if (!Array.isArray(messageIds) || !parsedUserId) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'messageIds array and userId are required' });
      return;
    }

    const messageService = new MessageService(unit);
    const result = await messageService.markAsRead(messageIds, parsedUserId);
    if (result.success) { await unit.complete(true); res.status(200).json(result); } else { await unit.complete(false); res.status(400).json(result); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

messageRouter.post('/read-conversation', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { senderId, receiverId } = req.body;
    const parsedSenderId = parseInt(senderId, 10);
    const parsedReceiverId = parseInt(receiverId, 10);
    if (!parsedSenderId || !parsedReceiverId) { await unit.complete(false); res.status(400).json({ success: false, error: 'senderId and receiverId are required' }); return; }

    const messageService = new MessageService(unit);
    const result = await messageService.markConversationAsRead(parsedSenderId, parsedReceiverId);
    if (result.success) { await unit.complete(true); res.status(200).json(result); } else { await unit.complete(false); res.status(400).json(result); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

messageRouter.get('/unread/:userId', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    if (!userId) { await unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }

    const messageService = new MessageService(unit);
    const count = await messageService.getUnreadCount(userId);
    await unit.complete();
    res.status(200).json({ success: true, count });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});
