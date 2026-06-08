import { Router, Request, Response } from 'express';
import { Unit } from '../database/unit';
import { MessageService } from '../services';
import { FriendshipService } from '../services';

export const messageRouter = Router();

messageRouter.post('/send', (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { senderId, receiverId, content } = req.body;
    const parsedSenderId = parseInt(senderId, 10);
    const parsedReceiverId = parseInt(receiverId, 10);

    if (!parsedSenderId || !parsedReceiverId || !content) {
      unit.complete(false);
      res.status(400).json({ success: false, error: 'senderId, receiverId, and content are required' });
      return;
    }

    const friendshipService = new FriendshipService(unit);
    const areFriends = friendshipService.areFriends(parsedSenderId, parsedReceiverId);
    if (!areFriends) {
      unit.complete(false);
      res.status(403).json({ success: false, error: 'You can only message your friends' });
      return;
    }

    const messageService = new MessageService(unit);
    const result = messageService.sendMessage({ senderId: parsedSenderId, receiverId: parsedReceiverId, content });
    if (result.success) {
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

messageRouter.get('/conversation/:userId/:otherUserId', (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    const otherUserId = parseInt(req.params['otherUserId'] as string, 10);
    if (!userId || !otherUserId) {
      unit.complete();
      res.status(400).json({ success: false, error: 'Invalid userId or otherUserId' });
      return;
    }

    const friendshipService = new FriendshipService(unit);
    const areFriends = friendshipService.areFriends(userId, otherUserId);
    if (!areFriends) {
      unit.complete();
      res.status(403).json({ success: false, error: 'You can only view conversations with your friends' });
      return;
    }
    const messageService = new MessageService(unit);
    const messages = messageService.getConversation(userId, otherUserId);
    unit.complete();
    res.status(200).json({ success: true, messages });
  } catch (error: any) {
    unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

messageRouter.get('/conversations/:userId', (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    if (!userId) {
      unit.complete();
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    const messageService = new MessageService(unit);
    const conversations = messageService.getConversations(userId);
    unit.complete();
    res.status(200).json({ success: true, conversations });
  } catch (error: any) {
    unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

messageRouter.post('/read', (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { messageIds, userId } = req.body;
    const parsedUserId = parseInt(userId, 10);
    if (!Array.isArray(messageIds) || !parsedUserId) {
      unit.complete(false);
      res.status(400).json({ success: false, error: 'messageIds array and userId are required' });
      return;
    }

    const messageService = new MessageService(unit);
    const result = messageService.markAsRead(messageIds, parsedUserId);
    if (result.success) { unit.complete(true); res.status(200).json(result); } else { unit.complete(false); res.status(400).json(result); }
  } catch (error: any) {
    unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

messageRouter.post('/read-conversation', (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { senderId, receiverId } = req.body;
    const parsedSenderId = parseInt(senderId, 10);
    const parsedReceiverId = parseInt(receiverId, 10);
    if (!parsedSenderId || !parsedReceiverId) { unit.complete(false); res.status(400).json({ success: false, error: 'senderId and receiverId are required' }); return; }

    const messageService = new MessageService(unit);
    const result = messageService.markConversationAsRead(parsedSenderId, parsedReceiverId);
    if (result.success) { unit.complete(true); res.status(200).json(result); } else { unit.complete(false); res.status(400).json(result); }
  } catch (error: any) {
    unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

messageRouter.get('/unread/:userId', (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = parseInt(req.params['userId'] as string, 10);
    if (!userId) { unit.complete(); res.status(400).json({ success: false, error: 'Invalid userId' }); return; }

    const messageService = new MessageService(unit);
    const count = messageService.getUnreadCount(userId);
    unit.complete();
    res.status(200).json({ success: true, count });
  } catch (error: any) {
    unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});
