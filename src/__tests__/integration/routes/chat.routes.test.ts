import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../../app';
import { connectDB, disconnectDB } from '../../../config/database';
import Chat from '../../../models/chat.model';
import Message, { MessageRole } from '../../../models/message.model';
import User from '../../../models/user.model';

describe('/api/chats', () => {
  let testUser: InstanceType<typeof User>;
  let authToken: string;
  let testChats: Array<InstanceType<typeof Chat>>;

  beforeAll(async () => {
    await connectDB();

    await Chat.deleteMany({});
    await User.deleteMany({});
    await Message.deleteMany({});

    testUser = new User({
      email: 'test@example.com',
      username: 'testuser',
      password: 'hashedpassword',
    });
    await testUser.save();

    authToken = testUser.generateAuthToken();

    testChats = [];

    for (let i = 1; i <= 3; i++) {
      const chat = new Chat({
        userId: testUser._id,
        title: `Test Chat ${i}`,
        boardContext: { boards: [] },
      });

      await chat.save();
      testChats.push(chat);
    }

    const otherUser = new User({
      email: 'other@example.com',
      username: 'otheruser',
      password: 'hashedpassword',
    });
    await otherUser.save();

    const otherUserChat = new Chat({
      userId: otherUser._id,
      title: 'Other User Chat',
      boardContext: { boards: [] },
    });
    await otherUserChat.save();

    // Create test messages for the first chat
    for (let i = 1; i <= 3; i++) {
      const userMessage = new Message({
        chatId: testChats[0]._id,
        role: MessageRole.USER,
        content: `Test user message ${i}`,
      });
      await userMessage.save();

      const assistantMessage = new Message({
        chatId: testChats[0]._id,
        role: MessageRole.ASSISTANT,
        content: `Test assistant response ${i}`,
      });
      await assistantMessage.save();
    }

    // Create a message for another chat
    const otherChatMessage = new Message({
      chatId: testChats[1]._id,
      role: MessageRole.USER,
      content: 'Message in another chat',
    });
    await otherChatMessage.save();
  });

  afterAll(async () => {
    await Message.deleteMany({});
    await Chat.deleteMany({});
    await User.deleteMany({});
    await disconnectDB();
  });

  describe('GET /api/chats', () => {
    it('should get all chats for the authenticated user', async () => {
      const response = await request(app)
        .get('/api/chats')
        .set('x-auth-token', authToken);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBeTruthy();
      expect(response.body.length).toBe(testChats.length);

      for (const chat of response.body) {
        expect(chat.userId.toString()).toBe(testUser._id.toString());
        expect(chat).toHaveProperty('_id');
        expect(chat).toHaveProperty('title');
      }
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app).get('/api/chats');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/chats/:id', () => {
    it('should get a specific chat by ID', async () => {
      const testChat = testChats[0];

      const response = await request(app)
        .get(`/api/chats/${testChat._id}`)
        .set('x-auth-token', authToken);

      expect(response.status).toBe(200);
      expect(response.body._id.toString()).toBe(testChat._id.toString());
      expect(response.body.title).toBe(testChat.title);
      expect(response.body.userId.toString()).toBe(testUser._id.toString());
    });

    it('should return 404 for non-existent chat', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .get(`/api/chats/${nonExistentId}`)
        .set('x-auth-token', authToken);

      expect(response.status).toBe(404);
    });

    it('should return 404 for invalid chat ID', async () => {
      const response = await request(app)
        .get('/api/chats/invalid-id')
        .set('x-auth-token', authToken);

      expect(response.status).toBe(404);
    });

    it('should return 401 if not authenticated', async () => {
      const testChat = testChats[0];

      const response = await request(app).get(`/api/chats/${testChat._id}`);
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/chats/:id/messages', () => {
    it('should get all messages for a specific chat', async () => {
      const testChat = testChats[0];

      const response = await request(app)
        .get(`/api/chats/${testChat._id}/messages`)
        .set('x-auth-token', authToken);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBeTruthy();
      expect(response.body.length).toBe(6); // 3 user messages + 3 assistant messages

      // Check that all messages belong to the correct chat
      for (const message of response.body) {
        expect(message.chatId.toString()).toBe(testChat._id.toString());
        expect(message).toHaveProperty('role');
        expect(message).toHaveProperty('content');
        expect(['user', 'assistant', 'system']).toContain(message.role);
      }

      // Verify messages are sorted by createdAt in ascending order
      for (let i = 1; i < response.body.length; i++) {
        const prevDate = new Date(response.body[i - 1].createdAt).getTime();
        const currDate = new Date(response.body[i].createdAt).getTime();
        expect(prevDate).toBeLessThanOrEqual(currDate);
      }
    });

    it('should return an empty array for a chat with no messages', async () => {
      const testChat = testChats[2]; // The third test chat has no messages

      const response = await request(app)
        .get(`/api/chats/${testChat._id}/messages`)
        .set('x-auth-token', authToken);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBeTruthy();
      expect(response.body.length).toBe(0);
    });

    it('should return 404 for non-existent chat', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .get(`/api/chats/${nonExistentId}/messages`)
        .set('x-auth-token', authToken);

      expect(response.status).toBe(404);
    });

    it('should return 404 for invalid chat ID', async () => {
      const response = await request(app)
        .get('/api/chats/invalid-id/messages')
        .set('x-auth-token', authToken);

      expect(response.status).toBe(404);
    });

    it('should return 401 if not authenticated', async () => {
      const testChat = testChats[0];

      const response = await request(app).get(
        `/api/chats/${testChat._id}/messages`
      );
      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/chats/:id', () => {
    it('should delete a chat and all associated messages', async () => {
      const tempChat = new Chat({
        userId: testUser._id,
        title: 'Temp Chat for Deletion',
        boardContext: { boards: [] },
      });
      await tempChat.save();

      const tempMessage1 = new Message({
        chatId: tempChat._id,
        role: MessageRole.USER,
        content: 'Test message 1 for deletion',
      });
      await tempMessage1.save();

      const tempMessage2 = new Message({
        chatId: tempChat._id,
        role: MessageRole.ASSISTANT,
        content: 'Test message 2 for deletion',
      });
      await tempMessage2.save();

      const messagesBefore = await Message.find({ chatId: tempChat._id });
      expect(messagesBefore.length).toBe(2);

      const response = await request(app)
        .delete(`/api/chats/${tempChat._id}`)
        .set('x-auth-token', authToken);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe(
        'Chat and all associated messages deleted successfully'
      );

      const chatAfter = await Chat.findById(tempChat._id);
      expect(chatAfter).toBeNull();

      const messagesAfter = await Message.find({ chatId: tempChat._id });
      expect(messagesAfter.length).toBe(0);
    });

    it('should return 404 for non-existent chat', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .delete(`/api/chats/${nonExistentId}`)
        .set('x-auth-token', authToken);

      expect(response.status).toBe(404);
    });

    it("should return 403 when trying to delete another user's chat", async () => {
      // Create a new user
      const anotherUser = new User({
        email: 'another@example.com',
        username: 'anotheruser',
        password: 'hashedpassword',
      });
      await anotherUser.save();

      const anotherUserChat = new Chat({
        userId: anotherUser._id,
        title: 'Another User Chat',
        boardContext: { boards: [] },
      });
      await anotherUserChat.save();

      const response = await request(app)
        .delete(`/api/chats/${anotherUserChat._id}`)
        .set('x-auth-token', authToken);

      expect(response.status).toBe(403);

      const chatAfter = await Chat.findById(anotherUserChat._id);
      expect(chatAfter).not.toBeNull();

      await Chat.findByIdAndDelete(anotherUserChat._id);
      await User.findByIdAndDelete(anotherUser._id);
    });

    it('should return 404 for invalid chat ID', async () => {
      const response = await request(app)
        .delete('/api/chats/invalid-id')
        .set('x-auth-token', authToken);

      expect(response.status).toBe(404);
    });

    it('should return 401 if not authenticated', async () => {
      const testChat = testChats[0];

      const response = await request(app).delete(`/api/chats/${testChat._id}`);
      expect(response.status).toBe(401);
    });
  });
});
