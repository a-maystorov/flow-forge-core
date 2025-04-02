import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import ChatMessage from '../../../models/chat-message.model';
import ChatSession from '../../../models/chat-session.model';
import User from '../../../models/user.model';

// Mock the socket service BEFORE importing app
jest.mock('../../../config/socket', () => ({
  socketService: {
    initialize: jest.fn(),
    emitToChatSession: jest.fn(),
    getUserSocketsInRoom: jest.fn().mockReturnValue([]),
    joinRoom: jest.fn(),
    leaveRoom: jest.fn(),
  },
}));

// Import app after mocking dependencies
import app from '../../../app';
import { chatAssistantService } from '../../../services/chat';

// Mock the chat assistant service
jest.mock('../../../services/chat/chat-assistant.service', () => {
  const originalModule = jest.requireActual(
    '../../../services/chat/chat-assistant.service'
  );
  return {
    ...originalModule,
    chatAssistantService: {
      processMessage: jest.fn().mockImplementation(async () => {
        return {
          responseMessage: {
            content: 'This is a mock AI assistant response',
          },
          detectedIntent: 'general_question',
          suggestions: {},
          confidence: 0.9,
        };
      }),
    },
  };
});

describe('Chat Routes', () => {
  let mongoServer: MongoMemoryServer;
  let authToken: string;
  let userId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    // Set up MongoDB memory server
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Create a test user and get auth token
    const user = new User({
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
    });
    await user.save();
    userId = user._id;
    authToken = user.generateAuthToken();
  });

  afterAll(async () => {
    // Clean up
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear chat data between tests
    await ChatSession.deleteMany({});
    await ChatMessage.deleteMany({});
  });

  describe('POST /api/chat', () => {
    it('should create a new chat session', async () => {
      const response = await request(app)
        .post('/api/chat')
        .set('x-auth-token', authToken)
        .send({
          title: 'Test Chat Session',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('_id');
      expect(response.body).toHaveProperty('title', 'Test Chat Session');
      expect(response.body).toHaveProperty('userId', userId.toString());
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app).post('/api/chat').send({
        title: 'Test Chat Session',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/chat', () => {
    it('should get all chat sessions for the current user', async () => {
      // Create test sessions
      await ChatSession.create({
        userId,
        title: 'Session 1',
      });

      await ChatSession.create({
        userId,
        title: 'Session 2',
      });

      const response = await request(app)
        .get('/api/chat')
        .set('x-auth-token', authToken);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('title');
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app).get('/api/chat');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/chat/:sessionId', () => {
    it('should get a specific chat session by ID', async () => {
      // Create a test session
      const session = await ChatSession.create({
        userId,
        title: 'Test Session',
      });

      const response = await request(app)
        .get(`/api/chat/${session._id}`)
        .set('x-auth-token', authToken);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('_id', session._id.toString());
      expect(response.body).toHaveProperty('title', 'Test Session');
    });

    it('should return 404 if session not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/chat/${nonExistentId}`)
        .set('x-auth-token', authToken);

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/chat/:sessionId/archive', () => {
    it('should archive a chat session', async () => {
      // Create a test session
      const session = await ChatSession.create({
        userId,
        title: 'Test Session',
      });

      const response = await request(app)
        .patch(`/api/chat/${session._id}/archive`)
        .set('x-auth-token', authToken);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'archived');
    });
  });

  describe('DELETE /api/chat/:sessionId', () => {
    it('should delete a chat session and its messages', async () => {
      // Create a test session and some messages
      const session = await ChatSession.create({
        userId,
        title: 'Test Session',
      });

      await ChatMessage.create({
        sessionId: session._id,
        role: 'user',
        content: 'Test message 1',
      });

      await ChatMessage.create({
        sessionId: session._id,
        role: 'assistant',
        content: 'Test message 2',
      });

      const response = await request(app)
        .delete(`/api/chat/${session._id}`)
        .set('x-auth-token', authToken);

      expect(response.status).toBe(204);

      // Check if session was deleted
      const sessionExists = await ChatSession.findById(session._id);
      expect(sessionExists).toBeNull();

      // Check if messages were deleted
      const messageCount = await ChatMessage.countDocuments({
        sessionId: session._id,
      });
      expect(messageCount).toBe(0);
    });
  });

  describe('GET /api/chat/:sessionId/messages', () => {
    it('should get messages for a chat session', async () => {
      // Create a test session and some messages
      const session = await ChatSession.create({
        userId,
        title: 'Test Session',
      });

      await ChatMessage.create({
        sessionId: session._id,
        role: 'user',
        content: 'Test message 1',
      });

      await ChatMessage.create({
        sessionId: session._id,
        role: 'assistant',
        content: 'Test message 2',
      });

      const response = await request(app)
        .get(`/api/chat/${session._id}/messages`)
        .set('x-auth-token', authToken);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('content');
    });
  });

  describe('POST /api/chat/:sessionId/messages', () => {
    it('should send a message and get AI response', async () => {
      // Create a test session
      const session = await ChatSession.create({
        userId,
        title: 'Test Session',
      });

      const response = await request(app)
        .post(`/api/chat/${session._id}/messages`)
        .set('x-auth-token', authToken)
        .send({
          message: 'Hello AI assistant',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('responseMessage');
      expect(response.body.responseMessage).toHaveProperty(
        'content',
        'This is a mock AI assistant response'
      );

      // Verify that chatAssistantService.processMessage was called
      expect(chatAssistantService.processMessage).toHaveBeenCalledWith(
        session._id.toString(),
        'Hello AI assistant'
      );
    });

    it('should return 400 if message is missing', async () => {
      // Create a test session
      const session = await ChatSession.create({
        userId,
        title: 'Test Session',
      });

      const response = await request(app)
        .post(`/api/chat/${session._id}/messages`)
        .set('x-auth-token', authToken)
        .send({});

      expect(response.status).toBe(400);
    });
  });
});
