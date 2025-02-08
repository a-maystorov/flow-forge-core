import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import app from '../../../app';
import { connectDB, disconnectDB } from '../../../config/database';
import Board, { IBoard } from '../../../models/board.model';
import User from '../../../models/user.model';
import Column from '../../../models/column.model';
import Task from '../../../models/task.model';
import Subtask from '../../../models/subtask.model';

describe('/api/boards', () => {
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
    await Task.deleteMany({});
    await Subtask.deleteMany({});
  });

  const createUserAndToken = async (isGuest = false) => {
    user = new User({
      email: isGuest ? undefined : 'test@example.com',
      password: isGuest ? undefined : 'password123',
      username: isGuest ? undefined : 'testuser',
      isGuest,
    });

    await user.save();
    token = user.generateAuthToken();
  };

  const createBoard = async (name: string) => {
    const board = new Board({ name, ownerId: user._id });
    await board.save();
    boardId = board._id;
  };

  describe('GET /', () => {
    beforeEach(async () => {
      await createUserAndToken();
    });

    it('should return all boards for the logged-in user', async () => {
      await Board.collection.insertMany([
        { name: 'board1', ownerId: user._id },
        { name: 'board2', ownerId: user._id },
      ]);

      const res = await request(app)
        .get('/api/boards')
        .set('x-auth-token', token);

      expect(res.status).toBe(200);
      expect(res.body.some((b: IBoard) => b.name === 'board2')).toBeTruthy();
      expect(
        res.body.every(
          (b: IBoard) => b.ownerId.toString() === user._id.toString()
        )
      ).toBeTruthy();
    });
  });

  describe('GET /:boardId', () => {
    beforeEach(async () => {
      await createUserAndToken();
      await createBoard('board1');
    });

    it('should return 404 if no board with the given id exists', async () => {
      const id = new mongoose.Types.ObjectId();

      const res = await request(app)
        .get(`/api/boards/${id}`)
        .set('x-auth-token', token);

      expect(res.status).toBe(404);
    });

    it('should return 404 if invalid id is passed', async () => {
      const res = await request(app)
        .get('/api/boards/1')
        .set('x-auth-token', token);

      expect(res.status).toBe(404);
    });

    it('should return a board if valid id is passed', async () => {
      const res = await request(app)
        .get(`/api/boards/${boardId}`)
        .set('x-auth-token', token);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('_id', boardId.toString());
      expect(res.body).toHaveProperty('name', 'board1');
      expect(res.body).toHaveProperty('ownerId', user._id.toHexString());
    });
  });

  describe('POST /', () => {
    beforeEach(async () => {
      await createUserAndToken();
    });

    const execPost = (name: string) => {
      return request(app)
        .post('/api/boards')
        .set('x-auth-token', token)
        .send({ name });
    };

    it('should return 401 if auth token is empty', async () => {
      token = '';
      const res = await execPost('board1');

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Unauthorized');
    });

    it('should return 400 if board name is less than 1 character', async () => {
      const res = await execPost('');
      expect(res.status).toBe(400);
    });

    it('should save and create the board if input is valid', async () => {
      const res = await execPost('board1');

      const board = await Board.findOne({ name: 'board1' });

      expect(res.status).toBe(201);
      expect(board).not.toBeNull();
      expect(board!.ownerId.toString()).toBe(user._id.toString());
    });

    it('should return the board if input is valid', async () => {
      const res = await execPost('board1');

      expect(res.body).toHaveProperty('_id');
      expect(res.body).toHaveProperty('name', 'board1');
      expect(res.body).toHaveProperty('ownerId', user._id.toHexString());
    });

    describe('guest user', () => {
      beforeEach(async () => {
        await createUserAndToken(true);
      });

      it('should allow creating first board', async () => {
        const res = await execPost('guest board');

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('name', 'guest board');
        expect(res.body).toHaveProperty('ownerId', user._id.toHexString());
      });

      it('should prevent creating more than one board', async () => {
        // Create first board
        await execPost('first board');

        // Try to create second board
        const res = await execPost('second board');

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty(
          'message',
          'Guest users are limited to creating only one board.'
        );
      });
    });
  });

  describe('PUT /:boardId', () => {
    let newName: string;

    beforeEach(async () => {
      await createUserAndToken();
      await createBoard('board1');
      newName = 'updatedBoard';
    });

    const execPut = () => {
      return request(app)
        .put(`/api/boards/${boardId}`)
        .set('x-auth-token', token)
        .send({ name: newName });
    };

    it('should return 401 if auth token is empty', async () => {
      token = '';
      const res = await execPut();

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Unauthorized');
    });

    it('should return 404 if the board is not found', async () => {
      boardId = new mongoose.Types.ObjectId();

      const res = await execPut();

      expect(res.status).toBe(404);
    });

    it('should update the board if input is valid', async () => {
      await execPut();

      const updatedBoard = await Board.findById(boardId);

      expect(updatedBoard!.name).toBe(newName);
    });

    it('should return the updated board if it is valid', async () => {
      const res = await execPut();

      expect(res.body).toHaveProperty('_id', boardId.toString());
      expect(res.body).toHaveProperty('name', newName);
      expect(res.body).toHaveProperty('ownerId', user._id.toHexString());
    });
  });

  describe('DELETE /:boardId', () => {
    beforeEach(async () => {
      await createUserAndToken();
      await createBoard('Test Board');
    });

    const execDelete = () => {
      return request(app)
        .delete(`/api/boards/${boardId}`)
        .set('x-auth-token', token);
    };

    it('should return 401 if user is not authenticated', async () => {
      token = '';
      const res = await execDelete();
      expect(res.status).toBe(401);
    });

    it('should return 404 if board id is invalid', async () => {
      boardId = new mongoose.Types.ObjectId();
      const res = await execDelete();
      expect(res.status).toBe(404);
    });

    it('should delete board and all associated data (cascade deletion)', async () => {
      const column = new Column({ name: 'Test Column', boardId });
      await column.save();

      const task = new Task({
        title: 'Test Task',
        description: 'Test Description',
        status: 'Todo',
        columnId: column._id,
        position: 0,
      });
      await task.save();

      const subtask = new Subtask({
        title: 'Test Subtask',
        description: 'Test Subtask Description',
        completed: false,
        taskId: task._id,
      });
      await subtask.save();

      column.tasks.push(task._id);
      await column.save();

      const board = await Board.findById(boardId);
      if (board) {
        board.columns.push(column._id);
        await board.save();
      }

      const res = await execDelete();

      expect(res.status).toBe(200);

      const boardExists = await Board.findById(boardId);
      const columnExists = await Column.findById(column._id);
      const taskExists = await Task.findById(task._id);
      const subtaskExists = await Subtask.findById(subtask._id);

      expect(boardExists).toBeNull();
      expect(columnExists).toBeNull();
      expect(taskExists).toBeNull();
      expect(subtaskExists).toBeNull();
    });

    it('should handle empty board deletion (no columns/tasks)', async () => {
      const res = await execDelete();
      expect(res.status).toBe(200);

      const boardExists = await Board.findById(boardId);
      expect(boardExists).toBeNull();
    });

    it('should not delete other user boards or their data', async () => {
      const otherUser = new User({
        email: 'other@example.com',
        password: 'password123',
        username: 'otheruser',
      });
      await otherUser.save();

      const otherBoard = new Board({
        name: 'Other Board',
        ownerId: otherUser._id,
      });
      await otherBoard.save();

      const otherColumn = new Column({
        name: 'Other Column',
        boardId: otherBoard._id,
      });
      await otherColumn.save();

      const res = await execDelete();
      expect(res.status).toBe(200);

      const otherBoardExists = await Board.findById(otherBoard._id);
      const otherColumnExists = await Column.findById(otherColumn._id);

      expect(otherBoardExists).not.toBeNull();
      expect(otherColumnExists).not.toBeNull();
    });

    it("should return 404 if user tries to delete another user's board", async () => {
      const otherUser = new User({
        email: 'other@example.com',
        password: 'password123',
        username: 'otheruser',
      });
      await otherUser.save();

      const otherBoard = new Board({
        name: 'Other Board',
        ownerId: otherUser._id,
      });
      await otherBoard.save();

      boardId = otherBoard._id;
      const res = await execDelete();
      expect(res.status).toBe(404);

      // Verify board still exists
      const boardExists = await Board.findById(otherBoard._id);
      expect(boardExists).not.toBeNull();
    });
  });
});
