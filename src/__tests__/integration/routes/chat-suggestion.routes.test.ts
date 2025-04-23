import { Types } from 'mongoose';
import request from 'supertest';
import app from '../../../app';
import { connectDB, disconnectDB } from '../../../config/database';
import ChatSession from '../../../models/chat-session.model';
import User from '../../../models/user.model';

// Define intent constants for use throughout the tests
const MOCK_INTENTS = {
  GENERAL_CONVERSATION: 'general_question',
  CREATE_BOARD: 'board_suggestion',
  BREAKDOWN_TASK: 'task_breakdown',
  IMPROVE_TASK: 'task_improvement',
  CAPABILITY_QUESTION: 'capability_question',
};

// Mock the socket service
jest.mock('../../../config/socket', () => ({
  socketService: {
    emitSuggestionStatusUpdate: jest.fn(),
    emitSuggestionPreview: jest.fn(),
    emitToChatSession: jest.fn(),
    initialize: jest.fn(),
  },
  SuggestionStatus: {
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    PENDING: 'pending',
  },
}));

// Mock the assistant service to avoid actual OpenAI calls
jest.mock('../../../services/chat/chat-assistant.service', () => {
  return {
    chatAssistantService: {
      processMessage: jest.fn().mockImplementation((sessionId, message) => {
        // This special handling is for requests from the general-question endpoint
        if (message === 'What can you do?' || message === 'How can you help?') {
          return {
            responseMessage: {
              _id: new Types.ObjectId(),
              content: 'I can help with project management tasks...',
              role: 'assistant',
              sessionId,
              createdAt: new Date(),
              updatedAt: new Date(),
              metadata: {
                intent: MOCK_INTENTS.CAPABILITY_QUESTION,
                confidence: 0.9,
                thoughtProcess:
                  'I understand you want to know what capabilities I have as an AI assistant.',
              },
            },
            detectedIntent: MOCK_INTENTS.CAPABILITY_QUESTION,
            confidence: 0.9,
            suggestions: {}, // Add the missing suggestions property
          };
        }

        // Normal handling for other message types
        return {
          responseMessage: {
            _id: new Types.ObjectId(),
            content: 'Mock response',
            role: 'assistant',
            sessionId,
            createdAt: new Date(),
            updatedAt: new Date(),
            metadata: {
              intent: message.includes('board')
                ? MOCK_INTENTS.CREATE_BOARD
                : message.includes('task breakdown')
                  ? MOCK_INTENTS.BREAKDOWN_TASK
                  : message.includes('improve')
                    ? MOCK_INTENTS.IMPROVE_TASK
                    : MOCK_INTENTS.GENERAL_CONVERSATION,
              confidence: 0.9,
              thoughtProcess: message.includes('board')
                ? 'I analyzed your project needs and created a board with appropriate columns based on standard project management practices.'
                : message.includes('task breakdown')
                  ? 'I carefully analyzed this task and broke it down into manageable components that can be tracked individually.'
                  : message.includes('improve')
                    ? 'I reviewed the original task and identified areas that could be clearer and more actionable.'
                    : "I've considered your message and crafted a response to help you.",
            },
          },
          detectedIntent: message.includes('board')
            ? MOCK_INTENTS.CREATE_BOARD
            : message.includes('task breakdown')
              ? MOCK_INTENTS.BREAKDOWN_TASK
              : message.includes('improve')
                ? MOCK_INTENTS.IMPROVE_TASK
                : MOCK_INTENTS.GENERAL_CONVERSATION,
          confidence: 0.9,
          suggestions: message.includes('board')
            ? {
                boardSuggestion: {
                  boardName: 'Test Board',
                  thoughtProcess:
                    'I analyzed your project needs and created a board with appropriate columns based on standard project management practices.',
                  columns: [
                    { name: 'To Do', tasks: [] },
                    { name: 'In Progress', tasks: [] },
                    { name: 'Done', tasks: [] },
                  ],
                },
              }
            : message.includes('task breakdown')
              ? {
                  taskBreakdown: {
                    taskTitle: 'Main Task',
                    thoughtProcess:
                      'I carefully analyzed this task and broke it down into manageable components that can be tracked individually.',
                    subtasks: [
                      { title: 'Subtask 1', description: 'Description 1' },
                      { title: 'Subtask 2', description: 'Description 2' },
                    ],
                  },
                }
              : message.includes('improve')
                ? {
                    taskImprovement: {
                      originalTask: {
                        title: 'Original Title',
                        description: 'Original Description',
                      },
                      improvedTask: {
                        title: 'Improved Title',
                        description: 'Improved Description',
                      },
                      thoughtProcess:
                        'I reviewed the original task and identified areas that could be clearer and more actionable.',
                      reasoning: 'This is a better title and description',
                    },
                  }
                : {
                    // Empty suggestions object for general conversations
                  },
          suggestionId: message.includes('suggestion')
            ? new Types.ObjectId().toString()
            : undefined,
        };
      }),
    },
  };
});

describe('Chat Suggestion Routes', () => {
  let token: string;
  let sessionId: string;

  beforeAll(async () => {
    await connectDB();

    // Create a test user
    const user = await User.create({
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
    });

    // Create JWT token directly instead of using login endpoint
    token = user.generateAuthToken();

    // Create a chat session
    const session = await ChatSession.create({
      userId: user._id,
      title: 'Test Chat Session',
    });
    sessionId = session._id.toString();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('POST /api/chat-suggestions/:sessionId/board', () => {
    it('should generate a board suggestion', async () => {
      const response = await request(app)
        .post(`/api/chat-suggestions/${sessionId}/board`)
        .set('x-auth-token', token)
        .send({
          projectDescription:
            'Create a project management board for a software team',
        });

      expect(response.status).toBe(200);
      expect(response.body.detectedIntent).toBe(MOCK_INTENTS.CREATE_BOARD);
      expect(response.body.suggestions.boardSuggestion).toBeTruthy();
      expect(response.body.suggestions.boardSuggestion.boardName).toBe(
        'Test Board'
      );
      expect(response.body.suggestions.boardSuggestion.thoughtProcess).toBe(
        'I analyzed your project needs and created a board with appropriate columns based on standard project management practices.'
      );
      expect(response.body.responseMessage.metadata).toBeTruthy();
      expect(
        response.body.responseMessage.metadata.thoughtProcess
      ).toBeTruthy();
      expect(typeof response.body.responseMessage.metadata.thoughtProcess).toBe(
        'string'
      );
    });

    it('should return 400 for invalid project description', async () => {
      const response = await request(app)
        .post(`/api/chat-suggestions/${sessionId}/board`)
        .set('x-auth-token', token)
        .send({ projectDescription: 'aa' }); // Too short

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/chat-suggestions/:sessionId/task-breakdown', () => {
    it('should generate a task breakdown', async () => {
      const response = await request(app)
        .post(`/api/chat-suggestions/${sessionId}/task-breakdown`)
        .set('x-auth-token', token)
        .send({
          taskDescription:
            'I need a task breakdown for implementing user authentication',
        });

      expect(response.status).toBe(200);
      expect(response.body.detectedIntent).toBe(MOCK_INTENTS.BREAKDOWN_TASK);
      expect(response.body.suggestions.taskBreakdown).toBeTruthy();
      expect(response.body.suggestions.taskBreakdown.subtasks.length).toBe(2);
      expect(response.body.suggestions.taskBreakdown.thoughtProcess).toBe(
        'I carefully analyzed this task and broke it down into manageable components that can be tracked individually.'
      );
      expect(response.body.responseMessage.metadata).toBeTruthy();
      expect(
        response.body.responseMessage.metadata.thoughtProcess
      ).toBeTruthy();
      expect(typeof response.body.responseMessage.metadata.thoughtProcess).toBe(
        'string'
      );
    });

    it('should return 400 for invalid task description', async () => {
      const response = await request(app)
        .post(`/api/chat-suggestions/${sessionId}/task-breakdown`)
        .set('x-auth-token', token)
        .send({ taskDescription: 'aa' }); // Too short

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/chat-suggestions/:sessionId/task-improvement', () => {
    it('should generate a task improvement suggestion', async () => {
      const response = await request(app)
        .post(`/api/chat-suggestions/${sessionId}/task-improvement`)
        .set('x-auth-token', token)
        .send({
          taskTitle: 'improve login page',
          taskDescription: 'Make it better',
        });

      expect(response.status).toBe(200);
      expect(response.body.detectedIntent).toBe(MOCK_INTENTS.IMPROVE_TASK);
      expect(response.body.suggestions.taskImprovement).toBeTruthy();
      expect(response.body.suggestions.taskImprovement.improvedTask.title).toBe(
        'Improved Title'
      );
      expect(response.body.suggestions.taskImprovement.thoughtProcess).toBe(
        'I reviewed the original task and identified areas that could be clearer and more actionable.'
      );
      expect(response.body.responseMessage.metadata).toBeTruthy();
      expect(
        response.body.responseMessage.metadata.thoughtProcess
      ).toBeTruthy();
      expect(typeof response.body.responseMessage.metadata.thoughtProcess).toBe(
        'string'
      );
    });

    it('should return 400 for invalid task title', async () => {
      const response = await request(app)
        .post(`/api/chat-suggestions/${sessionId}/task-improvement`)
        .set('x-auth-token', token)
        .send({ taskTitle: 'aa' }); // Too short

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/chat-suggestions/:sessionId/general-question', () => {
    it('should respond to a general question', async () => {
      const response = await request(app)
        .post(`/api/chat-suggestions/${sessionId}/general-question`)
        .set('x-auth-token', token)
        .send({
          question: 'What can you do?',
        });

      expect(response.status).toBe(200);
      // The endpoint now overrides the intent
      expect(response.body.detectedIntent).toBe(
        MOCK_INTENTS.CAPABILITY_QUESTION
      );
    });

    it('should respond to a general question', async () => {
      const response = await request(app)
        .post(`/api/chat-suggestions/${sessionId}/general-question`)
        .set('x-auth-token', token)
        .send({
          question: 'How can you help?',
        });

      expect(response.status).toBe(200);
      // The endpoint now overrides the intent
      expect(response.body.detectedIntent).toBe(
        MOCK_INTENTS.CAPABILITY_QUESTION
      );
    });
  });
});
