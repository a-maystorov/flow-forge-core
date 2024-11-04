import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import app from '../../../app';
import { connectDB, disconnectDB } from '../../../config/database';
import Board from '../../../models/board.model';
import Column from '../../../models/column.model';
import User from '../../../models/user.model';

describe('/api/boards/:boardId/columns', () => {
  let user: InstanceType<typeof User>;
  let token: string;
  let boardId: string | Types.ObjectId;

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Board.deleteMany({});
    await Column.deleteMany({});
  });

  const createUserAndToken = async () => {
    user = new User({
      email: 'test@example.com',
      password: 'password123',
      username: 'testuser',
    });

    await user.save();
    token = user.generateAuthToken();
  };

  const createBoard = async (name: string) => {
    const board = new Board({ name, ownerId: user._id });
    await board.save();
    boardId = board._id;
  };

  describe('POST /', () => {
    beforeEach(async () => {
      await createUserAndToken();
      await createBoard('Test Board');
    });

    const execPost = (columnName: string) => {
      return request(app)
        .post(`/api/boards/${boardId}/columns`)
        .set('x-auth-token', token)
        .send({ name: columnName });
    };

    it('should return 401 if user is not authenticated', async () => {
      token = '';

      const res = await execPost('New Column');

      expect(res.status).toBe(401);
    });

    it('should return 404 if board is not found', async () => {
      boardId = new mongoose.Types.ObjectId();

      const res = await execPost('New Column');

      expect(res.status).toBe(404);
    });

    it('should return 400 if column name is invalid', async () => {
      const res = await execPost('');

      expect(res.status).toBe(400);
      expect(res.body.errors[0].message).toMatch(/Column name is required/);
    });

    it('should save the column if input is valid', async () => {
      const res = await execPost('New Column');

      const columnInDB = await Column.findOne({ name: 'New Column' });

      expect(res.status).toBe(201);
      expect(columnInDB).not.toBeNull();
      expect(columnInDB!.boardId.toString()).toBe(boardId.toString());
    });

    it('should add the column ID to the board’s columns array if input is valid', async () => {
      await execPost('New Column');

      const boardInDB = await Board.findById(boardId);

      expect(boardInDB!.columns).toContainEqual(
        expect.any(mongoose.Types.ObjectId)
      );
    });

    it('should return the created column if input is valid', async () => {
      const res = await execPost('New Column');

      expect(res.body).toHaveProperty('_id');
      expect(res.body).toHaveProperty('name', 'New Column');
      expect(res.body).toHaveProperty('boardId', boardId.toString());
    });
  });
});
