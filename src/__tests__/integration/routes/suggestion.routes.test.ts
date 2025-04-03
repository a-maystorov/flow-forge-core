import { jest } from '@jest/globals';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import app from '../../../app';

jest.mock('../../../config/socket', () => ({
  socketService: {
    emitToChatSession: jest.fn(),
  },
}));

import { connectDB, disconnectDB } from '../../../config/database';
import { Suggestion, SuggestionStatus } from '../../../models/suggestion.model';
import User from '../../../models/user.model';
import { SuggestionDocument } from '../../../types';

describe('/api/suggestions', () => {
  let user: InstanceType<typeof User>;
  let token: string;
  let suggestion: SuggestionDocument;

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    // Create test user
    user = new User({
      email: 'test@example.com',
      password: 'password123',
      username: 'testuser',
    });
    await user.save();
    token = user.generateAuthToken();

    // Create a test suggestion
    const suggestionDoc = new Suggestion({
      userId: user._id,
      sessionId: new mongoose.Types.ObjectId(),
      type: 'board',
      status: SuggestionStatus.PENDING,
      content: {
        boardName: 'Test Project Board',
        columns: [
          {
            name: 'To Do',
            position: 0,
            tasks: [
              {
                id: new Types.ObjectId().toString(),
                title: 'Task 1',
                description: 'Task 1 description',
              },
            ],
          },
          {
            name: 'In Progress',
            position: 1,
            tasks: [],
          },
          {
            name: 'Done',
            position: 2,
            tasks: [],
          },
        ],
      },
      originalMessage: 'Create a board for test project',
    }) as SuggestionDocument;
    await suggestionDoc.save();
    suggestion = suggestionDoc;
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Suggestion.deleteMany({});
  });

  describe('GET /:id', () => {
    it('should return 401 if user is not authenticated', async () => {
      const res = await request(app).get(`/api/suggestions/${suggestion._id}`);
      expect(res.status).toBe(401);
    });

    it('should return 400 if ID is invalid', async () => {
      const res = await request(app)
        .get('/api/suggestions/invalid-id')
        .set('x-auth-token', token);
      expect(res.status).toBe(400);
    });

    it('should return 404 if suggestion with given ID is not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/suggestions/${nonExistentId}`)
        .set('x-auth-token', token);
      expect(res.status).toBe(404);
    });

    it('should return 200 with suggestion if valid ID is provided', async () => {
      const res = await request(app)
        .get(`/api/suggestions/${suggestion._id}`)
        .set('x-auth-token', token);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('_id', suggestion._id.toString());
      expect(res.body).toHaveProperty('type', 'board');
      expect(res.body).toHaveProperty('status', 'pending');
    });
  });

  describe('GET /user/all', () => {
    it('should return 401 if user is not authenticated', async () => {
      const res = await request(app).get('/api/suggestions/user/all');
      expect(res.status).toBe(401);
    });

    it('should return 200 with user suggestions', async () => {
      const res = await request(app)
        .get('/api/suggestions/user/all')
        .set('x-auth-token', token);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0]).toHaveProperty('_id', suggestion._id.toString());
    });
  });

  describe('GET /session/:sessionId', () => {
    it('should return 401 if user is not authenticated', async () => {
      const res = await request(app).get(
        `/api/suggestions/session/${suggestion.sessionId}`
      );
      expect(res.status).toBe(401);
    });

    it('should return 400 if session ID is invalid', async () => {
      const res = await request(app)
        .get('/api/suggestions/session/invalid-id')
        .set('x-auth-token', token);
      expect(res.status).toBe(400);
    });

    it('should return 200 with session suggestions', async () => {
      const res = await request(app)
        .get(`/api/suggestions/session/${suggestion.sessionId}`)
        .set('x-auth-token', token);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0]).toHaveProperty('_id', suggestion._id.toString());
    });
  });

  describe('POST /:id/accept', () => {
    it('should return 401 if user is not authenticated', async () => {
      const res = await request(app).post(
        `/api/suggestions/${suggestion._id}/accept`
      );
      expect(res.status).toBe(401);
    });

    it('should return 400 if ID is invalid', async () => {
      const res = await request(app)
        .post('/api/suggestions/invalid-id/accept')
        .set('x-auth-token', token);
      expect(res.status).toBe(400);
    });

    it('should return 404 if suggestion with given ID is not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/suggestions/${nonExistentId}/accept`)
        .set('x-auth-token', token);
      expect(res.status).toBe(404);
    });

    it('should return 200 and update suggestion status to accepted', async () => {
      const res = await request(app)
        .post(`/api/suggestions/${suggestion._id}/accept`)
        .set('x-auth-token', token)
        .send({ message: 'I like this suggestion' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('_id', suggestion._id.toString());
      expect(res.body).toHaveProperty('status', 'accepted');

      // Verify in the database
      const updatedSuggestion = await Suggestion.findById(suggestion._id);
      expect(updatedSuggestion).not.toBeNull();
      expect(updatedSuggestion?.status).toBe('accepted');
    });
  });

  describe('POST /:id/reject', () => {
    it('should return 401 if user is not authenticated', async () => {
      const res = await request(app).post(
        `/api/suggestions/${suggestion._id}/reject`
      );
      expect(res.status).toBe(401);
    });

    it('should return 400 if ID is invalid', async () => {
      const res = await request(app)
        .post('/api/suggestions/invalid-id/reject')
        .set('x-auth-token', token);
      expect(res.status).toBe(400);
    });

    it('should return 404 if suggestion with given ID is not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/suggestions/${nonExistentId}/reject`)
        .set('x-auth-token', token);
      expect(res.status).toBe(404);
    });

    it('should return 200 and update suggestion status to rejected', async () => {
      const res = await request(app)
        .post(`/api/suggestions/${suggestion._id}/reject`)
        .set('x-auth-token', token)
        .send({
          message: "I don't like this suggestion",
          reason: 'Not enough detail',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('_id', suggestion._id.toString());
      expect(res.body).toHaveProperty('status', 'rejected');

      // Verify in the database
      const updatedSuggestion = await Suggestion.findById(suggestion._id);
      expect(updatedSuggestion).not.toBeNull();
      expect(updatedSuggestion?.status).toBe('rejected');
    });
  });

  describe('PUT /:id', () => {
    it('should return 401 if user is not authenticated', async () => {
      const res = await request(app).put(`/api/suggestions/${suggestion._id}`);
      expect(res.status).toBe(401);
    });

    it('should return 400 if ID is invalid', async () => {
      const res = await request(app)
        .put('/api/suggestions/invalid-id')
        .set('x-auth-token', token);
      expect(res.status).toBe(400);
    });

    it('should return 404 if suggestion with given ID is not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/suggestions/${nonExistentId}`)
        .set('x-auth-token', token)
        .send({ content: { boardName: 'Modified Board Name' } });
      expect(res.status).toBe(404);
    });

    it('should return 200 and update suggestion content', async () => {
      const modifiedContent = {
        boardName: 'Modified Project Board',
        columns: [
          {
            name: 'To Do',
            position: 0,
            tasks: [
              {
                id: new Types.ObjectId().toString(),
                title: 'Modified Task',
                description: 'Modified description',
              },
            ],
          },
          {
            name: 'In Progress',
            position: 1,
            tasks: [],
          },
          {
            name: 'Done',
            position: 2,
            tasks: [],
          },
        ],
      };

      const res = await request(app)
        .put(`/api/suggestions/${suggestion._id}`)
        .set('x-auth-token', token)
        .send({
          content: modifiedContent,
          message: 'I modified this suggestion',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('_id', suggestion._id.toString());
      expect(res.body).toHaveProperty('status', 'modified');

      // Verify in the database
      const updatedSuggestion = await Suggestion.findById(suggestion._id);
      expect(updatedSuggestion).not.toBeNull();
      expect(updatedSuggestion?.status).toBe('modified');

      // Ensure we're working with a board suggestion
      if (
        updatedSuggestion?.type === 'board' &&
        'boardName' in updatedSuggestion.content
      ) {
        expect(updatedSuggestion.content.boardName).toBe(
          'Modified Project Board'
        );
      } else {
        throw new Error('Expected a board suggestion with boardName property');
      }
    });
  });
});
