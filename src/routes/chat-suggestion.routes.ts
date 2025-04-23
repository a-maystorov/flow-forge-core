import express from 'express';
import { z } from 'zod';
import auth from '../middleware/auth.middleware';
import validateObjectId from '../middleware/validateObjectId.middleware';
import validateRequest from '../middleware/validateRequest.middleware';
import { chatAssistantService } from '../services/chat/chat-assistant.service';

const router = express.Router();

/**
 * Validation schema for board suggestion request
 */
const boardSuggestionSchema = z.object({
  body: z.object({
    projectDescription: z
      .string()
      .min(5, 'Project description must be at least 5 characters'),
  }),
  params: z.object({
    sessionId: z.string(),
  }),
});

/**
 * Validation schema for task breakdown request
 */
const taskBreakdownSchema = z.object({
  body: z.object({
    taskDescription: z
      .string()
      .min(5, 'Task description must be at least 5 characters'),
  }),
  params: z.object({
    sessionId: z.string(),
  }),
});

/**
 * Validation schema for task improvement request
 */
const taskImprovementSchema = z.object({
  body: z.object({
    taskTitle: z.string().min(3, 'Task title must be at least 3 characters'),
    taskDescription: z.string().optional(),
  }),
  params: z.object({
    sessionId: z.string(),
  }),
});

/**
 * Validation schema for general question request
 */
const generalQuestionSchema = z.object({
  body: z.object({
    question: z.string().min(3, 'Question must be at least 3 characters'),
  }),
  params: z.object({
    sessionId: z.string(),
  }),
});

/**
 * Request a board suggestion in chat
 * POST /api/chat-suggestions/:sessionId/board
 */
router.post(
  '/:sessionId/board',
  auth,
  validateObjectId('sessionId'),
  validateRequest(boardSuggestionSchema),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { projectDescription } = req.body;

      // Process the board suggestion request through the chat assistant
      const result = await chatAssistantService.processMessage(
        sessionId,
        projectDescription
      );

      res.status(200).json(result);
    } catch (error) {
      console.error('Error generating board suggestion:', error);
      res.status(500).json({ error: 'Failed to generate board suggestion' });
    }
  }
);

/**
 * Request a task breakdown in chat
 * POST /api/chat-suggestions/:sessionId/task-breakdown
 */
router.post(
  '/:sessionId/task-breakdown',
  auth,
  validateObjectId('sessionId'),
  validateRequest(taskBreakdownSchema),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { taskDescription } = req.body;

      // Process the task breakdown request through the chat assistant
      const result = await chatAssistantService.processMessage(
        sessionId,
        taskDescription
      );

      res.status(200).json(result);
    } catch (error) {
      console.error('Error generating task breakdown:', error);
      res.status(500).json({ error: 'Failed to generate task breakdown' });
    }
  }
);

/**
 * Request a task improvement in chat
 * POST /api/chat-suggestions/:sessionId/task-improvement
 */
router.post(
  '/:sessionId/task-improvement',
  auth,
  validateObjectId('sessionId'),
  validateRequest(taskImprovementSchema),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { taskTitle, taskDescription = '' } = req.body;

      // Format the request as a message
      const message = `${taskTitle}${
        taskDescription ? `\n\n${taskDescription}` : ''
      }`;

      // Process the task improvement request through the chat assistant
      const result = await chatAssistantService.processMessage(
        sessionId,
        message
      );

      res.status(200).json(result);
    } catch (error) {
      console.error('Error generating task improvement:', error);
      res.status(500).json({ error: 'Failed to generate task improvement' });
    }
  }
);

/**
 * Request a general question response in chat
 * POST /api/chat-suggestions/:sessionId/general-question
 */
router.post(
  '/:sessionId/general-question',
  auth,
  validateObjectId('sessionId'),
  validateRequest(generalQuestionSchema),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { question } = req.body;

      // Process the general question through the chat assistant
      const result = await chatAssistantService.processMessage(
        sessionId,
        question
      );

      res.status(200).json(result);
    } catch (error) {
      console.error('Error processing general question:', error);
      res.status(500).json({ error: 'Failed to process question' });
    }
  }
);

export default router;
