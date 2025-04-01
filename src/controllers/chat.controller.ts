import { Request, Response } from 'express';
import { FilterQuery, Types } from 'mongoose';
import Chat, { IChat } from '../models/chat.model';
import { ChatGPTService } from '../services/ai/chatgpt.service';
import { PlanningService } from '../services/ai/planning.service';
import { SuggestionService } from '../services/ai/suggestion.service';
import { TaskUpdateService } from '../services/ai/task-update.service';

export class ChatController {
  private chatGPTService: ChatGPTService;
  private planningService: PlanningService;
  private taskUpdateService: TaskUpdateService;
  private suggestionService: SuggestionService;

  constructor() {
    this.chatGPTService = new ChatGPTService();
    this.planningService = new PlanningService();
    this.taskUpdateService = new TaskUpdateService();
    this.suggestionService = new SuggestionService();
  }

  /**
   * Process a new message from the user
   */
  async processMessage(req: Request, res: Response) {
    try {
      const { content, chatId, boardId, activeContext } = req.body;
      const userId = req.userId;

      if (!content) {
        return res.status(400).json({ error: 'Message content is required' });
      }

      // If chatId is provided, add to existing chat
      let chat;
      if (chatId) {
        chat = await Chat.findById(chatId);

        if (!chat || chat.userId.toString() !== userId) {
          return res.status(404).json({ error: 'Chat not found' });
        }
      } else {
        // Create a new chat
        chat = new Chat({
          userId,
          messages: [],
          boardId: boardId || null,
          activeContext: activeContext || null,
        });
      }

      // Add user message to chat
      chat.messages.push({
        role: 'user',
        content,
        timestamp: new Date(),
      });

      await chat.save();

      // Analyze user intent to decide which service to use
      const intent = await this.chatGPTService.analyzeIntent(content);

      let response;
      let preview = null;

      // Route to appropriate service based on intent
      switch (intent.type) {
        case 'create_board':
          preview = await this.planningService.generateProjectPlan(
            content,
            new Types.ObjectId(userId)
          );
          response = {
            role: 'assistant',
            content: `I've created a project plan based on your description. You can review and approve it before I create the board.\n\nPreview ID: ${preview._id}`,
          };
          break;

        case 'update_task':
          if (intent.taskId) {
            preview = await this.taskUpdateService.suggestTaskUpdate(
              intent.taskId,
              content,
              new Types.ObjectId(userId)
            );
            response = {
              role: 'assistant',
              content: `I've suggested updates to the task based on your request. You can review and approve them.\n\nPreview ID: ${preview._id}`,
            };
          } else {
            response = {
              role: 'assistant',
              content:
                'Please specify which task you want to update or select a task as your active context.',
            };
          }
          break;

        case 'suggestion':
          const suggestions = await this.suggestionService.getSuggestions(
            content,
            boardId
          );
          response = {
            role: 'assistant',
            content: `Here are some suggestions for your project:\n\n${suggestions.join('\n')}`,
          };
          break;

        default:
          // General conversation
          const assistantResponse =
            await this.chatGPTService.getGeneralResponse(content);
          response = {
            role: 'assistant',
            content: assistantResponse,
          };
      }

      // Add AI response to the chat
      chat.messages.push({
        role: 'assistant', // Explicitly set to 'assistant' instead of response.role
        content: response.content,
        timestamp: new Date(),
      });

      await chat.save();

      res.json({
        message: 'Message processed successfully',
        chat,
        preview,
      });
    } catch (error) {
      console.error('Error processing message:', error);
      res.status(500).json({ error: 'Failed to process message' });
    }
  }

  /**
   * Get chat history for a user
   */
  async getChatHistory(req: Request, res: Response) {
    try {
      const userId = req.userId;
      const { boardId } = req.query;

      const query: FilterQuery<IChat> = { userId };

      if (boardId) {
        query.boardId = boardId;
      }

      const chats = await Chat.find(query).sort({ updatedAt: -1 });

      res.json({ chats });
    } catch (error) {
      console.error('Error getting chat history:', error);
      res.status(500).json({ error: 'Failed to get chat history' });
    }
  }

  /**
   * Get a specific chat by ID
   */
  async getChatById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId;

      const chat = await Chat.findById(id);

      if (!chat || chat.userId.toString() !== userId) {
        return res.status(404).json({ error: 'Chat not found' });
      }

      res.json({ chat });
    } catch (error) {
      console.error('Error getting chat:', error);
      res.status(500).json({ error: 'Failed to get chat' });
    }
  }

  /**
   * Set active context for a chat
   */
  async setActiveContext(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { type, entityId } = req.body;
      const userId = req.userId;

      if (!type || !entityId) {
        return res
          .status(400)
          .json({ error: 'Type and entity ID are required' });
      }

      const chat = await Chat.findById(id);

      if (!chat || chat.userId.toString() !== userId) {
        return res.status(404).json({ error: 'Chat not found' });
      }

      chat.activeContext = {
        type,
        id: new Types.ObjectId(entityId),
      };

      await chat.save();

      res.json({
        message: 'Active context updated successfully',
        chat,
      });
    } catch (error) {
      console.error('Error setting active context:', error);
      res.status(500).json({ error: 'Failed to set active context' });
    }
  }

  /**
   * Delete a chat
   */
  async deleteChat(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId;

      const chat = await Chat.findById(id);

      if (!chat || chat.userId.toString() !== userId) {
        return res.status(404).json({ error: 'Chat not found' });
      }

      await chat.deleteOne();

      res.json({ message: 'Chat deleted successfully' });
    } catch (error) {
      console.error('Error deleting chat:', error);
      res.status(500).json({ error: 'Failed to delete chat' });
    }
  }
}
