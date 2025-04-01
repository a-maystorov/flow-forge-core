import express from 'express';
import { z } from 'zod';
import { auth, validateObjectId } from '../middleware';
import Chat from '../models/chat.model';
import { ChatGPTService } from '../services/ai/chatgpt.service';
import { PlanningService } from '../services/ai/planning.service';
import { SuggestionService } from '../services/ai/suggestion.service';
import { TaskUpdateService } from '../services/ai/task-update.service';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError } from '../utils/errors';
import { Types } from 'mongoose';

const router = express.Router();

// Initialize services
const chatGPTService = new ChatGPTService();
const planningService = new PlanningService();
const taskUpdateService = new TaskUpdateService();
const suggestionService = new SuggestionService();

// Message validation schema
const messageSchema = z.object({
  content: z.string().min(1, 'Message content is required'),
  chatId: z.string().nullable().optional(),
  boardId: z.string().optional(),
  activeContext: z
    .object({
      type: z.enum(['board', 'column', 'task', 'subtask']),
      id: z.string(),
    })
    .optional(),
});

// Get chat history
router.get(
  '/history',
  auth,
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { boardId } = req.query;

    const query = boardId ? { userId, boardId } : { userId };

    const chats = await Chat.find(query).sort({ updatedAt: -1 });

    res.json({ chats });
  })
);

// Get specific chat by ID
router.get(
  '/:id',
  auth,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;

    const chat = await Chat.findById(id);

    if (!chat || chat.userId.toString() !== userId) {
      throw new NotFoundError('Chat not found');
    }

    res.json({ chat });
  })
);

// Process a new message
router.post(
  '/message',
  auth,
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { content, chatId, boardId, activeContext } = messageSchema.parse(
      req.body
    );

    let chat;
    let preview = null;

    // Find existing chat or create a new one
    if (chatId) {
      chat = await Chat.findById(chatId);
      if (!chat || chat.userId.toString() !== userId) {
        throw new NotFoundError('Chat not found');
      }
    } else {
      chat = new Chat({
        userId,
        messages: [],
        boardId,
        activeContext,
      });
    }

    // Add user message to chat
    chat.messages.push({
      role: 'user',
      content,
      timestamp: new Date(),
    });

    // Analyze user intent
    try {
      const intent = await chatGPTService.analyzeIntent(content);
      console.log('Detected intent:', intent);
      let response = { role: 'assistant', content: '' };

      // Process based on intent
      switch (intent.type) {
        case 'create_task':
          // For task creation, we'll need to use the entity mapper service directly
          // or implement the appropriate method
          response = {
            role: 'assistant',
            content: `I'm sorry, task creation functionality is not yet implemented.`,
          };
          break;

        case 'create_board':
          try {
            console.log('Generating project plan with userId:', userId);
            // Generate project plan preview
            preview = await planningService.generateProjectPlan(
              content,
              typeof userId === 'string'
                ? new Types.ObjectId(userId)
                : (userId as Types.ObjectId)
            );
            console.log('Project plan generated successfully:', preview?._id);
            response = {
              role: 'assistant',
              content: `I've created a project plan based on your description. You can review and approve it before I create the board.\n\nPreview ID: ${preview._id}`,
            };
          } catch (planError) {
            console.error('Error generating project plan:', planError);
            response = {
              role: 'assistant',
              content: `I encountered an error while creating your project plan: ${planError}. Please try again with more details.`,
            };
          }
          break;

        case 'update_task':
          // Generate task update preview
          if (intent.taskId) {
            preview = await taskUpdateService.suggestTaskUpdate(
              intent.taskId,
              content,
              typeof userId === 'string'
                ? new Types.ObjectId(userId)
                : (userId as Types.ObjectId)
            );
            response = {
              role: 'assistant',
              content: `I've prepared an update to the task based on your request. Please review and confirm the changes.`,
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
          // Generate a suggestion
          const suggestions = await suggestionService.getSuggestions(
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
            await chatGPTService.getGeneralResponse(content);
          response = {
            role: 'assistant',
            content: assistantResponse,
          };
      }

      // Add AI response to the chat
      chat.messages.push({
        role: 'assistant',
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
      res.status(500).json({
        message: 'Error processing message',
        error: error,
      });
    }
  })
);

// Set active context for a chat
router.patch(
  '/:id/context',
  auth,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { type, entityId } = req.body;
    const userId = req.userId;

    if (!type || !entityId) {
      return res
        .status(400)
        .json({ error: 'Context type and entity ID are required' });
    }

    const chat = await Chat.findById(id);

    if (!chat || chat.userId.toString() !== userId) {
      throw new NotFoundError('Chat not found');
    }

    chat.activeContext = {
      type,
      id: entityId,
    };

    await chat.save();

    res.json({
      message: 'Active context updated successfully',
      chat,
    });
  })
);

// Delete a chat
router.delete(
  '/:id',
  auth,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;

    const chat = await Chat.findById(id);

    if (!chat || chat.userId.toString() !== userId) {
      throw new NotFoundError('Chat not found');
    }

    await chat.deleteOne();

    res.json({ message: 'Chat deleted successfully' });
  })
);

export default router;
