import { Server, createServer } from 'http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import ChatMessage, { MessageStatus } from '../../../models/chat-message.model';
import ChatSession from '../../../models/chat-session.model';
import User from '../../../models/user.model';
import { ChatMessageDocument } from '../../../types/mongoose';

// Mock the socket service BEFORE importing app
jest.mock('../../../config/socket', () => ({
  socketService: {
    initialize: jest.fn(),
    emitToChatSession: jest.fn(),
    shutdown: jest.fn(),
  },
}));

import app from '../../../app';

// Restore the original socketService functions for our test
const originalSocketService = jest.requireActual(
  '../../../config/socket'
).socketService;

// Define interfaces for event data only if not already defined in models
interface TypingEventData {
  sessionId: string;
  isTyping: boolean;
}

interface MessageReadEventData {
  messageId: string;
}

describe('Real-time Chat', () => {
  let mongoServer: MongoMemoryServer;
  let httpServer: Server;
  let clientSocket: ClientSocket;
  let authToken: string;
  let userId: mongoose.Types.ObjectId;
  let sessionId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    // Setup MongoDB memory server
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Create test user
    const user = new User({
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
    });
    await user.save();
    userId = user._id;
    authToken = user.generateAuthToken();

    // Create test chat session
    const session = new ChatSession({
      userId,
      title: 'Test Chat Session',
    });
    await session.save();
    sessionId = session._id;

    httpServer = createServer(app);
    originalSocketService.initialize(httpServer);
    httpServer.listen(4000);
  });

  afterAll(async () => {
    // Clean up
    if (clientSocket) {
      clientSocket.disconnect();
    }

    // Shutdown socket service to clear intervals
    originalSocketService.shutdown();

    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => {
          resolve();
        });
      });
    }
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Setup client socket for each test
    clientSocket = Client('http://localhost:4000', {
      auth: {
        token: authToken,
      },
      transports: ['websocket'],
    });

    // Wait for connection to be established
    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => {
        resolve();
      });
    });

    // Join the test chat session
    clientSocket.emit('join_chat', sessionId.toString());

    // Clear messages before each test
    await ChatMessage.deleteMany({});
  });

  afterEach(() => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
  });

  // Helper to create a promise that resolves when a specific event is received
  const waitForEvent = <T>(socket: ClientSocket, event: string): Promise<T> => {
    return new Promise((resolve) => {
      socket.once(event, (data: T) => {
        resolve(data);
      });
    });
  };

  describe('Typing Indicators', () => {
    it('should emit and receive user typing status', async () => {
      // Setup listener for typing status
      const typingPromise = waitForEvent<TypingEventData>(
        clientSocket,
        'user_typing'
      );

      // Emit typing status
      clientSocket.emit('typing', {
        sessionId: sessionId.toString(),
        isTyping: true,
      });

      // Wait for typing status to be received
      const typingData = await typingPromise;

      // Verify typing data
      expect(typingData).toBeDefined();
      expect(typingData.sessionId).toBe(sessionId.toString());
      expect(typingData.isTyping).toBe(true);
    });

    it('should handle AI typing indicators', async () => {
      // Setup listener for AI typing
      const aiTypingPromise = waitForEvent<TypingEventData>(
        clientSocket,
        'ai_typing'
      );

      // Emit AI typing status via socket service
      originalSocketService.setAITypingStatus(sessionId.toString(), true);

      // Wait for AI typing status to be received
      const typingData = await aiTypingPromise;

      // Verify typing data
      expect(typingData).toBeDefined();
      expect(typingData.sessionId).toBe(sessionId.toString());
      expect(typingData.isTyping).toBe(true);
    });
  });

  describe('Message Status', () => {
    it('should track message read status', async () => {
      // Create a test message
      const message = new ChatMessage({
        sessionId,
        role: 'assistant',
        content: 'Test message',
        status: MessageStatus.DELIVERED,
      });
      await message.save();

      // Setup listener for read status
      const readStatusPromise = waitForEvent<MessageReadEventData>(
        clientSocket,
        'message_read_status'
      );

      // Emit message read
      clientSocket.emit('message_read', {
        sessionId: sessionId.toString(),
        messageId: message._id.toString(),
      });

      // Wait for read status to be received
      const readData = await readStatusPromise;

      // Verify read status data
      expect(readData).toBeDefined();
      expect(readData.messageId).toBe(message._id.toString());

      // Check that the message status was updated in the database
      // Added a small delay to allow the database update to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const updatedMessage = await ChatMessage.findById(message._id);
      expect(updatedMessage?.status).toBe(MessageStatus.READ);
    });
  });

  describe('Real-time Message Updates', () => {
    it('should receive new messages in real-time', async () => {
      // Setup listener for new messages
      const messagePromise = waitForEvent<ChatMessageDocument>(
        clientSocket,
        'messageAdded'
      );

      // Add a message through the chat service (this would normally be done via API)
      const message = new ChatMessage({
        sessionId,
        role: 'assistant',
        content: 'New real-time message',
      });
      await message.save();

      // Emit messageAdded event
      originalSocketService.emitToChatSession(
        sessionId.toString(),
        'messageAdded',
        message
      );

      // Wait for message to be received
      const messageData = await messagePromise;

      // Verify message data
      expect(messageData).toBeDefined();
      expect(messageData.content).toBe('New real-time message');
      expect(messageData.role).toBe('assistant');
    });
  });
});
