import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import app from '../../../app';
import { connectDB, disconnectDB } from '../../../config/database';
import Board from '../../../models/board.model';
import Column from '../../../models/column.model';
import Task from '../../../models/task.model';
import User from '../../../models/user.model';

describe('/api/boards/:boardId/columns/:columnId/tasks', () => {
  let user: InstanceType<typeof User>;
  let token: string;
  let boardId: string | Types.ObjectId;
  let columnId: string | Types.ObjectId;

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

  const createBoardAndColumn = async () => {
    const board = new Board({ name: 'Test Board', ownerId: user._id });
    await board.save();
    boardId = board._id;

    const column = new Column({ name: 'Test Column', boardId });
    await column.save();
    columnId = column._id;
  };

  describe('POST /', () => {
    beforeEach(async () => {
      await createUserAndToken();
      await createBoardAndColumn();
    });

    const execPost = (title: string, description?: string) => {
      return request(app)
        .post(`/api/boards/${boardId}/columns/${columnId}/tasks`)
        .set('x-auth-token', token)
        .send({ title, description });
    };

    it('should return 401 if user is not authenticated', async () => {
      token = '';

      const res = await execPost('New Task');

      expect(res.status).toBe(401);
    });

    it('should return 404 if column is not found', async () => {
      columnId = new mongoose.Types.ObjectId();

      const res = await execPost('New Task');

      expect(res.status).toBe(404);
    });

    it('should return 400 if task title is invalid', async () => {
      const res = await execPost('');

      expect(res.status).toBe(400);
      expect(res.body.errors[0].message).toMatch(/Task title is required/);
    });

    it('should save the task if input is valid', async () => {
      const res = await execPost('New Task', 'Task description');

      const taskInDB = await Task.findOne({ title: 'New Task' });

      expect(res.status).toBe(201);
      expect(taskInDB).not.toBeNull();
      expect(taskInDB!.columnId.toString()).toBe(columnId.toString());
    });

    it('should add the task ID to the column’s tasks array if input is valid', async () => {
      await execPost('New Task');

      const columnInDB = await Column.findById(columnId);

      expect(columnInDB!.tasks).toContainEqual(
        expect.any(mongoose.Types.ObjectId)
      );
    });

    it('should return the created task if input is valid', async () => {
      const res = await execPost('New Task', 'Task description');

      expect(res.body).toHaveProperty('_id');
      expect(res.body).toHaveProperty('title', 'New Task');
      expect(res.body).toHaveProperty('description', 'Task description');
      expect(res.body).toHaveProperty('columnId', columnId.toString());
    });
  });

  describe('PUT /:taskId', () => {
    let taskId: string | Types.ObjectId;

    beforeEach(async () => {
      await createUserAndToken();
      await createBoardAndColumn();

      const task = new Task({ title: 'Initial Task', columnId });
      await task.save();
      taskId = task._id;
    });

    const execPut = (newTitle: string, newDescription?: string) => {
      return request(app)
        .put(`/api/boards/${boardId}/columns/${columnId}/tasks/${taskId}`)
        .set('x-auth-token', token)
        .send({ title: newTitle, description: newDescription });
    };

    it('should return 401 if user is not authenticated', async () => {
      token = '';

      const res = await execPut('Updated Task');

      expect(res.status).toBe(401);
    });

    it('should return 404 if task is not found', async () => {
      taskId = new mongoose.Types.ObjectId();

      const res = await execPut('Updated Task');

      expect(res.status).toBe(404);
    });

    it('should return 400 if task title is invalid', async () => {
      const res = await execPut('');

      expect(res.status).toBe(400);
      expect(res.body.errors[0].message).toMatch(/Task title is required/);
    });

    it('should update the task if input is valid', async () => {
      const res = await execPut('Updated Task', 'Updated description');

      const taskInDB = await Task.findById(taskId);

      expect(res.status).toBe(200);
      expect(taskInDB!.title).toBe('Updated Task');
      expect(taskInDB!.description).toBe('Updated description');
    });

    it('should return the updated task if input is valid', async () => {
      const res = await execPut('Updated Task', 'Updated description');

      expect(res.body).toHaveProperty('_id', taskId.toString());
      expect(res.body).toHaveProperty('title', 'Updated Task');
      expect(res.body).toHaveProperty('description', 'Updated description');
    });
  });

  describe('DELETE /:taskId', () => {
    let taskId: string | Types.ObjectId;

    beforeEach(async () => {
      await createUserAndToken();
      await createBoardAndColumn();

      const task = new Task({ title: 'Task to delete', columnId });
      await task.save();
      taskId = task._id;
    });

    const execDelete = () => {
      return request(app)
        .delete(`/api/boards/${boardId}/columns/${columnId}/tasks/${taskId}`)
        .set('x-auth-token', token);
    };

    it('should return 401 if user is not authenticated', async () => {
      token = '';

      const res = await execDelete();

      expect(res.status).toBe(401);
    });

    it('should return 404 if task is not found', async () => {
      taskId = new mongoose.Types.ObjectId();

      const res = await execDelete();

      expect(res.status).toBe(404);
    });

    it('should delete the task if it exists', async () => {
      const res = await execDelete();

      const taskInDB = await Task.findById(taskId);

      expect(res.status).toBe(200);
      expect(taskInDB).toBeNull();
    });

    it('should remove the task ID from the column’s tasks array', async () => {
      await execDelete();

      const columnInDB = await Column.findById(columnId);

      expect(columnInDB!.tasks).not.toContainEqual(taskId);
    });

    it('should return the deleted task', async () => {
      const res = await execDelete();

      expect(res.body).toHaveProperty('_id', taskId.toString());
      expect(res.body).toHaveProperty('title', 'Task to delete');
    });
  });
});
