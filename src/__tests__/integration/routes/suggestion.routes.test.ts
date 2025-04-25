import { jest } from '@jest/globals';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import app from '../../../app';

// Mock the socket service for suggestion updates
jest.mock('../../../config/socket', () => ({
  socketService: {
    emitSuggestionStatusUpdate: jest.fn(),
    emitToChatSession: jest.fn(),
    initialize: jest.fn(),
  },
  SuggestionStatus: {
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    PENDING: 'pending',
  },
}));

import { connectDB, disconnectDB } from '../../../config/database';
import { Suggestion, SuggestionStatus } from '../../../models/suggestion.model';
import User from '../../../models/user.model';
import { SuggestionDocument } from '../../../types';
import Board from '../../../models/board.model';
import Column from '../../../models/column.model';
import Task from '../../../models/task.model';
import Subtask from '../../../models/subtask.model';

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
    await Board.deleteMany({});
    await Column.deleteMany({});
    await Task.deleteMany({});
    await Subtask.deleteMany({});
  });

  describe('GET /:id', () => {
    it('should return 401 if user is not authenticated', async () => {
      const res = await request(app).get(`/api/suggestions/${suggestion._id}`);
      expect(res.status).toBe(401);
    });

    it('should return 404 if ID is invalid', async () => {
      const res = await request(app)
        .get('/api/suggestions/invalid-id')
        .set('x-auth-token', token);
      expect(res.status).toBe(404);
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

    it('should return 404 if session ID is invalid', async () => {
      const res = await request(app)
        .get('/api/suggestions/session/invalid-id')
        .set('x-auth-token', token);
      expect(res.status).toBe(404);
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

    it('should return 404 if ID is invalid', async () => {
      const res = await request(app)
        .post('/api/suggestions/invalid-id/accept')
        .set('x-auth-token', token);
      expect(res.status).toBe(404);
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
        .send({
          message: 'This looks great!',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('_id', suggestion._id.toString());
      expect(res.body).toHaveProperty('status', 'accepted');

      // Verify in the database
      const updatedSuggestion = await Suggestion.findById(suggestion._id);
      expect(updatedSuggestion).not.toBeNull();
      expect(updatedSuggestion?.status).toBe('accepted');

      // Verify that board entities were created
      const boards = await Board.find({});
      expect(boards.length).toBe(1);
      expect(boards[0].name).toBe('Test Project Board');
      expect(boards[0].ownerId.toString()).toBe(user._id.toString());

      // Verify columns
      const columns = await Column.find({}).sort({ position: 1 });
      expect(columns.length).toBe(3);
      expect(columns[0].name).toBe('To Do');
      expect(columns[1].name).toBe('In Progress');
      expect(columns[2].name).toBe('Done');

      // Verify tasks
      const tasks = await Task.find({});
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Task 1');
      expect(tasks[0].description).toBe('Task 1 description');
    });
  });

  describe('POST /:id/reject', () => {
    it('should return 401 if user is not authenticated', async () => {
      const res = await request(app).post(
        `/api/suggestions/${suggestion._id}/reject`
      );
      expect(res.status).toBe(401);
    });

    it('should return 404 if ID is invalid', async () => {
      const res = await request(app)
        .post('/api/suggestions/invalid-id/reject')
        .set('x-auth-token', token);
      expect(res.status).toBe(404);
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

  describe('POST /batch/accept', () => {
    let taskImprovementSuggestion1: SuggestionDocument;
    let taskImprovementSuggestion2: SuggestionDocument;
    let task1: InstanceType<typeof Task>;
    let task2: InstanceType<typeof Task>;

    beforeEach(async () => {
      // Create test tasks
      task1 = new Task({
        title: 'Original Task 1',
        description: 'Original description 1',
        boardId: new mongoose.Types.ObjectId(),
        columnId: new mongoose.Types.ObjectId(),
        userId: user._id,
      });
      await task1.save();

      task2 = new Task({
        title: 'Original Task 2',
        description: 'Original description 2',
        boardId: new mongoose.Types.ObjectId(),
        columnId: new mongoose.Types.ObjectId(),
        userId: user._id,
      });
      await task2.save();

      // Create test task improvement suggestions
      taskImprovementSuggestion1 = new Suggestion({
        userId: user._id,
        sessionId: new mongoose.Types.ObjectId(),
        type: 'task-improvement',
        status: SuggestionStatus.PENDING,
        content: {
          originalTask: {
            title: 'Original Task 1',
            description: 'Original description 1',
          },
          improvedTask: {
            title: 'Improved Task 1',
            description: 'Improved description 1',
          },
          thoughtProcess: 'Thought process for task 1',
          reasoning: 'Reasoning for task 1',
        },
        originalMessage: 'Improve task 1',
        metadata: {
          taskId: task1._id,
          isBatchSuggestion: true,
          batchId: 'batch-123',
        },
      }) as SuggestionDocument;
      await taskImprovementSuggestion1.save();

      taskImprovementSuggestion2 = new Suggestion({
        userId: user._id,
        sessionId: new mongoose.Types.ObjectId(),
        type: 'task-improvement',
        status: SuggestionStatus.PENDING,
        content: {
          originalTask: {
            title: 'Original Task 2',
            description: 'Original description 2',
          },
          improvedTask: {
            title: 'Improved Task 2',
            description: 'Improved description 2',
          },
          thoughtProcess: 'Thought process for task 2',
          reasoning: 'Reasoning for task 2',
        },
        originalMessage: 'Improve task 2',
        metadata: {
          taskId: task2._id,
          isBatchSuggestion: true,
          batchId: 'batch-123',
        },
      }) as SuggestionDocument;
      await taskImprovementSuggestion2.save();
    });

    it('should return 401 if user is not authenticated', async () => {
      const res = await request(app).post('/api/suggestions/batch/accept');
      expect(res.status).toBe(401);
    });

    it('should return 400 if no suggestion IDs are provided', async () => {
      const res = await request(app)
        .post('/api/suggestions/batch/accept')
        .set('x-auth-token', token)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Suggestion IDs are required');
    });

    it('should return 200 and accept all valid suggestions in the batch', async () => {
      const res = await request(app)
        .post('/api/suggestions/batch/accept')
        .set('x-auth-token', token)
        .query({
          ids: `${taskImprovementSuggestion1._id.toString()},${taskImprovementSuggestion2._id.toString()}`,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('succeeded');
      expect(
        res.body.succeeded.map((s: { _id: { toString: () => string } }) =>
          s._id.toString()
        )
      ).toEqual(
        expect.arrayContaining([
          taskImprovementSuggestion1._id.toString(),
          taskImprovementSuggestion2._id.toString(),
        ])
      );

      // Verify suggestions are updated in the database
      const updatedSuggestion1 = await Suggestion.findById(
        taskImprovementSuggestion1._id
      );
      const updatedSuggestion2 = await Suggestion.findById(
        taskImprovementSuggestion2._id
      );

      expect(updatedSuggestion1?.status).toBe('accepted');
      expect(updatedSuggestion2?.status).toBe('accepted');

      // Verify tasks are updated in the database
      const updatedTask1 = await Task.findById(task1._id);
      const updatedTask2 = await Task.findById(task2._id);

      expect(updatedTask1?.title).toBe('Improved Task 1');
      expect(updatedTask1?.description).toBe('Improved description 1');
      expect(updatedTask2?.title).toBe('Improved Task 2');
      expect(updatedTask2?.description).toBe('Improved description 2');
    });

    it('should handle a mix of valid and invalid suggestion IDs', async () => {
      const invalidId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .post('/api/suggestions/batch/accept')
        .set('x-auth-token', token)
        .query({
          ids: `${taskImprovementSuggestion1._id.toString()},${invalidId}`,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('succeeded');
      expect(
        res.body.succeeded.map((s: { _id: { toString: () => string } }) =>
          s._id.toString()
        )
      ).toEqual([taskImprovementSuggestion1._id.toString()]);
      expect(res.body).toHaveProperty('failed');
      expect(res.body.failed.map((f: { id: string }) => f.id)).toContain(
        invalidId
      );

      // Verify only the valid suggestion was updated
      const updatedSuggestion1 = await Suggestion.findById(
        taskImprovementSuggestion1._id
      );
      const updatedSuggestion2 = await Suggestion.findById(
        taskImprovementSuggestion2._id
      );

      expect(updatedSuggestion1?.status).toBe('accepted');
      expect(updatedSuggestion2?.status).toBe('pending'); // Should still be pending
    });
  });

  describe('PUT /:id', () => {
    it('should return 401 if user is not authenticated', async () => {
      const res = await request(app).put(`/api/suggestions/${suggestion._id}`);
      expect(res.status).toBe(401);
    });

    it('should return 404 if ID is invalid', async () => {
      const res = await request(app)
        .put('/api/suggestions/invalid-id')
        .set('x-auth-token', token);
      expect(res.status).toBe(404);
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
