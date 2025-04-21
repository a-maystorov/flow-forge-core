import { Types } from 'mongoose';
import request from 'supertest';
import app from '../../../app';
import { connectDB, disconnectDB } from '../../../config/database';
import ChatSession from '../../../models/chat-session.model';
import User from '../../../models/user.model';

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
jest.mock('../../../services/chat/chat-assistant.service', () => ({
  chatAssistantService: {
    processMessage: jest.fn().mockImplementation((sessionId, message) => {
      return {
        responseMessage: {
          _id: new Types.ObjectId(),
          content: 'Mock response',
          role: 'assistant',
          sessionId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        detectedIntent: message.includes('board')
          ? 'CREATE_BOARD'
          : message.includes('task breakdown')
            ? 'BREAKDOWN_TASK'
            : message.includes('improve')
              ? 'IMPROVE_TASK'
              : 'GENERAL_CONVERSATION',
        confidence: 0.8,
        suggestions: message.includes('board')
          ? {
              boardSuggestion: {
                boardName: 'Test Board',
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
                    reasoning: 'This is a better title and description',
                  },
                }
              : {},
        suggestionId: message.includes('suggestion')
          ? new Types.ObjectId().toString()
          : undefined,
      };
    }),
  },
}));

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
      expect(response.body.detectedIntent).toBe('CREATE_BOARD');
      expect(response.body.suggestions.boardSuggestion).toBeTruthy();
      expect(response.body.suggestions.boardSuggestion.boardName).toBe(
        'Test Board'
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
      expect(response.body.detectedIntent).toBe('BREAKDOWN_TASK');
      expect(response.body.suggestions.taskBreakdown).toBeTruthy();
      expect(response.body.suggestions.taskBreakdown.subtasks.length).toBe(2);
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
      expect(response.body.detectedIntent).toBe('IMPROVE_TASK');
      expect(response.body.suggestions.taskImprovement).toBeTruthy();
      expect(response.body.suggestions.taskImprovement.improvedTask.title).toBe(
        'Improved Title'
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
});
