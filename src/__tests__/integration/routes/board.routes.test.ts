import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import app from '../../../app';
import { connectDB, disconnectDB } from '../../../config/database';
import Board, { IBoard } from '../../../models/board.model';
import User from '../../../models/user.model';

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
    describe('regular user', () => {
      beforeEach(async () => {
        await createUserAndToken();
      });

      it('should return 400 if board name is less than 1 character', async () => {
        const res = await request(app)
          .post('/api/boards')
          .set('x-auth-token', token)
          .send({ name: '' });

        expect(res.status).toBe(400);
      });

      it('should save and create the board if input is valid', async () => {
        const res = await request(app)
          .post('/api/boards')
          .set('x-auth-token', token)
          .send({ name: 'board1' });

        const board = await Board.findOne({ name: 'board1' });

        expect(res.status).toBe(201);
        expect(board).not.toBeNull();
        expect(board!.ownerId.toString()).toBe(user._id.toString());
      });

      it('should return the board if input is valid', async () => {
        const res = await request(app)
          .post('/api/boards')
          .set('x-auth-token', token)
          .send({ name: 'board1' });

        expect(res.body).toHaveProperty('_id');
        expect(res.body).toHaveProperty('name', 'board1');
        expect(res.body).toHaveProperty('ownerId', user._id.toHexString());
      });
    });

    describe('guest user', () => {
      beforeEach(async () => {
        await createUserAndToken(true);
      });

      it('should allow creating first board with guest warning message', async () => {
        const res = await request(app)
          .post('/api/boards')
          .set('x-auth-token', token)
          .send({ name: 'guest board' });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('board');
        expect(res.body.board).toHaveProperty('name', 'guest board');
        expect(res.body).toHaveProperty('message');
        expect(res.body.message).toContain('7 days');
        expect(res.body.message).toContain('Guest');
      });

      it('should prevent creating more than one board', async () => {
        // Create first board
        await request(app)
          .post('/api/boards')
          .set('x-auth-token', token)
          .send({ name: 'first board' });

        // Try to create second board
        const res = await request(app)
          .post('/api/boards')
          .set('x-auth-token', token)
          .send({ name: 'second board' });

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
      await createBoard('board1');
    });

    const execDelete = () => {
      return request(app)
        .delete(`/api/boards/${boardId}`)
        .set('x-auth-token', token);
    };

    it('should return 404 if the board does not exist', async () => {
      boardId = new mongoose.Types.ObjectId();

      const res = await execDelete();

      expect(res.status).toBe(404);
    });

    it('should return 404 if invalid id is passed', async () => {
      boardId = '1';

      const res = await execDelete();

      expect(res.status).toBe(404);
    });

    it('should delete the board if input is valid', async () => {
      await execDelete();

      const boardInDB = await Board.findById(boardId);

      expect(boardInDB).toBeNull();
    });

    it('should return the deleted board', async () => {
      const res = await execDelete();

      expect(res.body).toHaveProperty('_id', boardId.toString());
      expect(res.body).toHaveProperty('name', 'board1');
    });
  });
});
