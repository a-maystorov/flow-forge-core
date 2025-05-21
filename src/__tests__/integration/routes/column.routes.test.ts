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

  const createUserAndToken = async (withEmail = true) => {
    user = new User({
      email: withEmail ? 'test@example.com' : undefined,
      password: withEmail ? 'password123' : undefined,
      username: withEmail ? 'testuser' : undefined,
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

    it('should return 401 if auth token is empty', async () => {
      token = '';
      const res = await execPost('New Column');

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Unauthorized');
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

    describe('unregistered user (no email)', () => {
      beforeEach(async () => {
        await createUserAndToken(false);
        await createBoard('Test Board');
      });

      it('should allow creating up to three columns', async () => {
        let res = await execPost('Column 1');
        expect(res.status).toBe(201);

        res = await execPost('Column 2');
        expect(res.status).toBe(201);

        res = await execPost('Column 3');
        expect(res.status).toBe(201);
      });

      it('should prevent creating more than three columns', async () => {
        await execPost('Column 1');
        await execPost('Column 2');
        await execPost('Column 3');

        const res = await execPost('Column 4');

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty(
          'message',
          'Unregistered users are limited to creating only three columns.'
        );
      });
    });
  });

  describe('POST /batch', () => {
    beforeEach(async () => {
      await createUserAndToken();
      await createBoard('Test Board');
    });

    const execBatchPost = (columnNames: string[]) => {
      return request(app)
        .post(`/api/boards/${boardId}/columns/batch`)
        .set('x-auth-token', token)
        .send({ columns: columnNames });
    };

    it('should return 401 if auth token is empty', async () => {
      token = '';
      const res = await execBatchPost(['Column 1', 'Column 2']);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Unauthorized');
    });

    it('should return 404 if invalid board id is passed', async () => {
      boardId = '1';
      const res = await execBatchPost(['Column 1', 'Column 2']);

      expect(res.status).toBe(404);
    });

    it('should return 404 if board is not found', async () => {
      boardId = new mongoose.Types.ObjectId();
      const res = await execBatchPost(['Column 1', 'Column 2']);

      expect(res.status).toBe(404);
    });

    it('should return 400 if any column name is invalid', async () => {
      const res = await execBatchPost(['Column 1', '']);

      expect(res.status).toBe(400);
      expect(res.body.errors[0].message).toMatch(/Column name is required/);
    });

    it('should save all columns if input is valid', async () => {
      const columnNames = ['Column 1', 'Column 2', 'Column 3'];
      const res = await execBatchPost(columnNames);

      expect(res.status).toBe(201);

      // Check if all columns are saved
      for (const name of columnNames) {
        const columnInDB = await Column.findOne({ name });
        expect(columnInDB).not.toBeNull();
        expect(columnInDB!.boardId.toString()).toBe(boardId.toString());
      }
    });

    it('should add all column IDs to the board’s columns array', async () => {
      const columnNames = ['Column 1', 'Column 2'];
      await execBatchPost(columnNames);

      const boardInDB = await Board.findById(boardId);
      expect(boardInDB!.columns).toHaveLength(columnNames.length);
      expect(boardInDB!.columns[0]).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(boardInDB!.columns[1]).toBeInstanceOf(mongoose.Types.ObjectId);
    });

    it('should maintain correct position order', async () => {
      const columnNames = ['Column 1', 'Column 2', 'Column 3'];
      await execBatchPost(columnNames);

      const columns = await Column.find({ boardId }).sort({ position: 1 });
      expect(columns).toHaveLength(columnNames.length);
      columns.forEach((col, index) => {
        expect(col.name).toBe(columnNames[index]);
        expect(col.position).toBe(index);
      });
    });

    describe('unregistered user (no email)', () => {
      beforeEach(async () => {
        await createUserAndToken(false);
        await createBoard('Test Board');
      });

      it('should allow creating up to three columns', async () => {
        const res = await execBatchPost(['Column 1', 'Column 2', 'Column 3']);
        expect(res.status).toBe(201);
      });

      it('should prevent creating more than three columns', async () => {
        const res = await execBatchPost([
          'Column 1',
          'Column 2',
          'Column 3',
          'Column 4',
        ]);
        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty(
          'message',
          'Unregistered users are limited to creating only three columns.'
        );
      });

      it('should prevent exceeding the limit with existing columns', async () => {
        // Create two columns first using the batch endpoint
        await execBatchPost(['Column 1', 'Column 2']);

        // Try to create two more columns which would exceed the limit
        const res = await execBatchPost(['Column 3', 'Column 4']);
        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty(
          'message',
          'Unregistered users are limited to creating only three columns.'
        );
      });
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

    it('should return 401 if auth token is empty', async () => {
      token = '';
      const res = await execPut('Updated Column');

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Unauthorized');
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

    it('should return 401 if auth token is empty', async () => {
      token = '';
      const res = await execDelete();

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Unauthorized');
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
