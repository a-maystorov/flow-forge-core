import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../../app';
import Chat from '../../../models/chat.model';
import User from '../../../models/user.model';
import { connectDB, disconnectDB } from '../../../config/database';

describe('/api/chats', () => {
  let testUser: InstanceType<typeof User>;
  let authToken: string;
  let testChats: Array<InstanceType<typeof Chat>>;

  beforeAll(async () => {
    await connectDB();

    await Chat.deleteMany({});
    await User.deleteMany({});

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
  });

  afterAll(async () => {
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
});
