import { Router, Request, Response } from 'express';
import { Unit } from '../database/unit';
import { MessageService } from '../services';
import { FriendshipService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { Sanitizer } from '../utils/Sanitizer';

export const messageRouter = Router();

messageRouter.post('/send', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const senderId = req.authenticatedUserId!;
    const { receiverId, content } = req.body;
    const parsedReceiverId = parseInt(receiverId, 10);

    if (!parsedReceiverId || !content) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'receiverId and content are required' });
      return;
    }

    const friendshipService = new FriendshipService(unit);
    const areFriends = await friendshipService.areFriends(senderId, parsedReceiverId);
    if (!areFriends) {
      await unit.complete(false);
      res.status(403).json({ success: false, error: 'You can only message your friends' });
      return;
    }

    const sanitizedContent = Sanitizer.sanitizeText(content);
    const messageService = new MessageService(unit);
    const result = await messageService.sendMessage({ senderId, receiverId: parsedReceiverId, content: sanitizedContent });
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

messageRouter.get('/conversation/:userId/:otherUserId', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    const otherUserId = parseInt(req.params['otherUserId'] as string, 10);
    const authUserId = req.authenticatedUserId!;

    if (!userId || !otherUserId) {
      await unit.complete();
      res.status(400).json({ success: false, error: 'Invalid userId or otherUserId' });
      return;
    }

    if (authUserId !== userId && authUserId !== otherUserId) {
      await unit.complete();
      res.status(403).json({ success: false, error: 'Forbidden: You can only view your own conversations' });
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

messageRouter.get('/conversations/:userId', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const requestedUserId = parseInt(req.params['userId'] as string, 10);
    const authUserId = req.authenticatedUserId!;
    if (requestedUserId !== authUserId) {
      await unit.complete();
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }
    if (!requestedUserId) {
      await unit.complete();
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    const messageService = new MessageService(unit);
    const conversations = await messageService.getConversations(requestedUserId);
    await unit.complete();
    res.status(200).json({ success: true, conversations });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

messageRouter.post('/read', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { messageIds } = req.body;
    const userId = req.authenticatedUserId!;
    if (!Array.isArray(messageIds)) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'messageIds array is required' });
      return;
    }

    const messageService = new MessageService(unit);
    const result = await messageService.markAsRead(messageIds, userId);
    if (result.success) { await unit.complete(true); res.status(200).json(result); } else { await unit.complete(false); res.status(400).json(result); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

messageRouter.post('/read-conversation', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { senderId, receiverId } = req.body;
    const parsedSenderId = parseInt(senderId, 10);
    const parsedReceiverId = parseInt(receiverId, 10);
    const authUserId = req.authenticatedUserId!;
    if (!parsedSenderId || !parsedReceiverId) { await unit.complete(false); res.status(400).json({ success: false, error: 'senderId and receiverId are required' }); return; }
    if (authUserId !== parsedSenderId && authUserId !== parsedReceiverId) {
      await unit.complete(false);
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const messageService = new MessageService(unit);
    const result = await messageService.markConversationAsRead(parsedSenderId, parsedReceiverId);
    if (result.success) { await unit.complete(true); res.status(200).json(result); } else { await unit.complete(false); res.status(400).json(result); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

messageRouter.get('/unread/:userId', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const requestedUserId = parseInt(req.params['userId'] as string, 10);
    const authUserId = req.authenticatedUserId!;
    if (requestedUserId !== authUserId) {
      await unit.complete();
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }
    if (!requestedUserId) { await unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }

    const messageService = new MessageService(unit);
    const count = await messageService.getUnreadCount(requestedUserId);
    await unit.complete();
    res.status(200).json({ success: true, count });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});
