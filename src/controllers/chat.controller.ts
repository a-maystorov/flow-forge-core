import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { chatAssistantService, chatService } from '../services/chat';

/**
 * Controller for chat-related endpoints
 */
export class ChatController {
  /**
   * Create a new chat session
   */
  async createChatSession(req: Request, res: Response): Promise<void> {
    try {
      const { title, boardId, taskId } = req.body;
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ message: 'User not authenticated' });
        return;
      }

      // TODO: Validate with middleware
      if (typeof userId !== 'string') {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      const chatSession = await chatService.createChatSession({
        userId,
        title,
        boardId,
        taskId,
      });

      res.status(201).json(chatSession);
    } catch (error) {
      console.error('Error creating chat session:', error);
      res.status(500).json({ message: 'Failed to create chat session' });
    }
  }

  /**
   * Get all chat sessions for the current user
   */
  async getChatSessions(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { limit = 10, status = 'active' } = req.query;

      if (!userId) {
        res.status(401).json({ message: 'User not authenticated' });
        return;
      }

      // TODO: Validate with middleware
      if (typeof userId !== 'string') {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      const sessions = await chatService.getChatSessionsByUser(
        userId,
        Number(limit),
        status as 'active' | 'archived' | 'all'
      );

      res.status(200).json(sessions);
    } catch (error) {
      console.error('Error getting chat sessions:', error);
      res.status(500).json({ message: 'Failed to get chat sessions' });
    }
  }

  /**
   * Get a specific chat session by ID
   */
  async getChatSessionById(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ message: 'User not authenticated' });
        return;
      }

      // TODO: Validate with middleware
      if (typeof userId !== 'string') {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      // TODO: Validate with middleware
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(sessionId)) {
        res.status(400).json({ message: 'Invalid session ID' });
        return;
      }

      const session = await chatService.getChatSession(sessionId);

      if (!session) {
        res.status(404).json({ message: 'Chat session not found' });
        return;
      }

      // Check if session belongs to user
      if (session.userId.toString() !== userId.toString()) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }

      res.status(200).json(session);
    } catch (error) {
      console.error('Error getting chat session:', error);
      res.status(500).json({ message: 'Failed to get chat session' });
    }
  }

  /**
   * Archive a chat session
   */
  async archiveChatSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ message: 'User not authenticated' });
        return;
      }

      // TODO: Validate with middleware
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(sessionId)) {
        res.status(400).json({ message: 'Invalid session ID' });
        return;
      }

      const session = await chatService.getChatSession(sessionId);

      if (!session) {
        res.status(404).json({ message: 'Chat session not found' });
        return;
      }

      // Check if session belongs to user
      if (session.userId.toString() !== userId.toString()) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }

      const updatedSession = await chatService.archiveChatSession(sessionId);
      res.status(200).json(updatedSession);
    } catch (error) {
      console.error('Error archiving chat session:', error);
      res.status(500).json({ message: 'Failed to archive chat session' });
    }
  }

  /**
   * Delete a chat session
   */
  async deleteChatSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ message: 'User not authenticated' });
        return;
      }

      // TODO: Validate with middleware
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(sessionId)) {
        res.status(400).json({ message: 'Invalid session ID' });
        return;
      }

      const session = await chatService.getChatSession(sessionId);

      if (!session) {
        res.status(404).json({ message: 'Chat session not found' });
        return;
      }

      // Check if session belongs to user
      if (session.userId.toString() !== userId.toString()) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }

      await chatService.deleteChatSession(sessionId);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting chat session:', error);
      res.status(500).json({ message: 'Failed to delete chat session' });
    }
  }

  /**
   * Get messages for a chat session
   */
  async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { limit = 50, skip = 0 } = req.query;
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ message: 'User not authenticated' });
        return;
      }

      // TODO: Validate with middleware
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(sessionId)) {
        res.status(400).json({ message: 'Invalid session ID' });
        return;
      }

      const session = await chatService.getChatSession(sessionId);

      if (!session) {
        res.status(404).json({ message: 'Chat session not found' });
        return;
      }

      // Check if session belongs to user
      if (session.userId.toString() !== userId.toString()) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }

      const messages = await chatService.getMessages(
        sessionId,
        Number(limit),
        Number(skip)
      );

      res.status(200).json(messages);
    } catch (error) {
      console.error('Error getting messages:', error);
      res.status(500).json({ message: 'Failed to get messages' });
    }
  }

  /**
   * Send a message and get AI assistant response
   */
  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { message } = req.body;
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ message: 'User not authenticated' });
        return;
      }

      // Validate inputs
      if (!message || typeof message !== 'string') {
        res.status(400).json({ message: 'Message is required' });
        return;
      }

      // TODO: Validate with middleware
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(sessionId)) {
        res.status(400).json({ message: 'Invalid session ID' });
        return;
      }

      const session = await chatService.getChatSession(sessionId);

      if (!session) {
        res.status(404).json({ message: 'Chat session not found' });
        return;
      }

      // Check if session belongs to user
      if (session.userId.toString() !== userId.toString()) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }

      // Process the message and get AI response
      const result = await chatAssistantService.processMessage(
        sessionId,
        message
      );

      res.status(200).json(result);
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ message: 'Failed to process message' });
    }
  }
}

export const chatController = new ChatController();
