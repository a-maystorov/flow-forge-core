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

    it('should return 404 if invalid board id is passed', async () => {
      boardId = '1';

      const res = await execPost('New Column');

      expect(res.status).toBe(404);
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

  describe('PUT /:columnId', () => {
    let columnId: string | Types.ObjectId;

    beforeEach(async () => {
      await createUserAndToken();
      await createBoard('Test Board');
      const column = new Column({ name: 'Initial Column', boardId });
      await column.save();
      columnId = column._id;
    });

    const execPut = (newName: string) => {
      return request(app)
        .put(`/api/boards/${boardId}/columns/${columnId}`)
        .set('x-auth-token', token)
        .send({ name: newName });
    };

    it('should return 401 if user is not authenticated', async () => {
      token = '';

      const res = await execPut('Updated Column');

      expect(res.status).toBe(401);
    });

    it('should return 404 if invalid board id is passed', async () => {
      boardId = '1';

      const res = await execPut('Updated Column');

      expect(res.status).toBe(404);
    });

    it('should return 404 if column is not found', async () => {
      columnId = new mongoose.Types.ObjectId();

      const res = await execPut('Updated Column');

      expect(res.status).toBe(404);
    });

    it('should return 400 if column name is invalid', async () => {
      const res = await execPut('');

      expect(res.status).toBe(400);
      expect(res.body.errors[0].message).toMatch(/Column name is required/);
    });

    it('should update the column if input is valid', async () => {
      const res = await execPut('Updated Column');

      const columnInDB = await Column.findById(columnId);

      expect(res.status).toBe(200);
      expect(columnInDB!.name).toBe('Updated Column');
    });

    it('should return the updated column if input is valid', async () => {
      const res = await execPut('Updated Column');

      expect(res.body).toHaveProperty('_id', columnId.toString());
      expect(res.body).toHaveProperty('name', 'Updated Column');
    });
  });

  describe('DELETE /:columnId', () => {
    let columnId: string | Types.ObjectId;

    beforeEach(async () => {
      await createUserAndToken();
      await createBoard('Test Board');
      const column = new Column({ name: 'Column to delete', boardId });
      await column.save();
      columnId = column._id;
    });

    const execDelete = () => {
      return request(app)
        .delete(`/api/boards/${boardId}/columns/${columnId}`)
        .set('x-auth-token', token);
    };

    it('should return 401 if user is not authenticated', async () => {
      token = '';

      const res = await execDelete();

      expect(res.status).toBe(401);
    });

    it('should return 404 if invalid board id is passed', async () => {
      boardId = '1';

      const res = await execDelete();

      expect(res.status).toBe(404);
    });

    it('should return 404 if column is not found', async () => {
      columnId = new mongoose.Types.ObjectId();

      const res = await execDelete();

      expect(res.status).toBe(404);
    });

    it('should delete the column if it exists', async () => {
      const res = await execDelete();

      const columnInDB = await Column.findById(columnId);

      expect(res.status).toBe(200);
      expect(columnInDB).toBeNull();
    });

    it('should remove the column ID from the board’s columns array', async () => {
      await execDelete();

      const boardInDB = await Board.findById(boardId);

      expect(boardInDB!.columns).not.toContainEqual(columnId);
    });

    it('should return the deleted column', async () => {
      const res = await execDelete();

      expect(res.body).toHaveProperty('_id', columnId.toString());
      expect(res.body).toHaveProperty('name', 'Column to delete');
    });
  });
});
