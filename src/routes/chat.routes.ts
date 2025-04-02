import { Router } from 'express';
import { z } from 'zod';
import { chatController } from '../controllers/chat.controller';
import auth from '../middleware/auth.middleware';
import validateRequest from '../middleware/validateRequest.middleware';

const router = Router();

// Request validation schemas
const createChatSessionSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    boardId: z.string().optional(),
    taskId: z.string().optional(),
  }),
});

const sendMessageSchema = z.object({
  body: z.object({
    message: z.string().min(1, 'Message is required'),
  }),
  params: z.object({
    sessionId: z.string().min(1, 'Session ID is required'),
  }),
});

const sessionIdParamSchema = z.object({
  params: z.object({
    sessionId: z.string().min(1, 'Session ID is required'),
  }),
});

const queriesSchema = z.object({
  query: z.object({
    limit: z
      .string()
      .optional()
      .transform((val) => Number(val || 10)),
    skip: z
      .string()
      .optional()
      .transform((val) => Number(val || 0)),
    status: z.enum(['active', 'archived', 'all']).optional().default('active'),
  }),
});

/**
 * @route POST /api/chat
 * @desc Create a new chat session
 * @access Private
 */
router.post(
  '/',
  auth,
  validateRequest(createChatSessionSchema),
  chatController.createChatSession.bind(chatController)
);

/**
 * @route GET /api/chat
 * @desc Get all chat sessions for current user
 * @access Private
 */
router.get(
  '/',
  auth,
  validateRequest(queriesSchema),
  chatController.getChatSessions.bind(chatController)
);

/**
 * @route GET /api/chat/:sessionId
 * @desc Get a specific chat session by ID
 * @access Private
 */
// TODO: validate sessionId. Not sure if validateRequest is necessary.
router.get(
  '/:sessionId',
  auth,
  validateRequest(sessionIdParamSchema),
  chatController.getChatSessionById.bind(chatController)
);

/**
 * @route PATCH /api/chat/:sessionId/archive
 * @desc Archive a chat session
 * @access Private
 */
router.patch(
  '/:sessionId/archive',
  auth,
  validateRequest(sessionIdParamSchema),
  chatController.archiveChatSession.bind(chatController)
);

/**
 * @route DELETE /api/chat/:sessionId
 * @desc Delete a chat session
 * @access Private
 */
router.delete(
  '/:sessionId',
  auth,
  validateRequest(sessionIdParamSchema),
  chatController.deleteChatSession.bind(chatController)
);

/**
 * @route GET /api/chat/:sessionId/messages
 * @desc Get messages for a chat session
 * @access Private
 */
router.get(
  '/:sessionId/messages',
  auth,
  validateRequest(
    z.object({
      params: z.object({
        sessionId: z.string().min(1, 'Session ID is required'),
      }),
      query: z.object({
        limit: z
          .string()
          .optional()
          .transform((val) => Number(val || 50)),
        skip: z
          .string()
          .optional()
          .transform((val) => Number(val || 0)),
      }),
    })
  ),
  chatController.getMessages.bind(chatController)
);

/**
 * @route POST /api/chat/:sessionId/messages
 * @desc Send a message and get AI assistant response
 * @access Private
 */
router.post(
  '/:sessionId/messages',
  auth,
  validateRequest(sendMessageSchema),
  chatController.sendMessage.bind(chatController)
);

export default router;
