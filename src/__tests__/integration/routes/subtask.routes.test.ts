import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import app from '../../../app';
import { connectDB, disconnectDB } from '../../../config/database';
import Board from '../../../models/board.model';
import Column from '../../../models/column.model';
import Subtask from '../../../models/subtask.model';
import Task from '../../../models/task.model';
import User from '../../../models/user.model';

describe('/api/boards/:boardId/columns/:columnId/tasks/:taskId/subtasks', () => {
  let user: InstanceType<typeof User>;
  let token: string;
  let boardId: string | Types.ObjectId;
  let columnId: string | Types.ObjectId;
  let taskId: string | Types.ObjectId;

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

  const createUserAndToken = async () => {
    user = new User({
      email: 'test@example.com',
      password: 'password123',
      username: 'testuser',
    });

    await user.save();
    token = user.generateAuthToken();
  };

  const createBoardColumnAndTask = async () => {
    const board = new Board({ name: 'Test Board', ownerId: user._id });
    await board.save();
    boardId = board._id;

    const column = new Column({ name: 'Test Column', boardId });
    await column.save();
    columnId = column._id;

    const task = new Task({ title: 'Test Task', columnId });
    await task.save();
    taskId = task._id;
  };

  describe('POST /', () => {
    beforeEach(async () => {
      await createUserAndToken();
      await createBoardColumnAndTask();
    });

    const execPost = (
      title: string,
      description?: string,
      completed = false
    ) => {
      return request(app)
        .post(
          `/api/boards/${boardId}/columns/${columnId}/tasks/${taskId}/subtasks`
        )
        .set('x-auth-token', token)
        .send({ title, description, completed });
    };

    it('should return 401 if user is not authenticated', async () => {
      token = '';

      const res = await execPost('New Subtask');

      expect(res.status).toBe(401);
    });

    it('should return 404 if invalid task id is passed', async () => {
      taskId = '1';

      const res = await execPost('New Subtask');

      expect(res.status).toBe(404);
    });

    it('should return 404 if task is not found', async () => {
      taskId = new mongoose.Types.ObjectId();

      const res = await execPost('New Subtask');

      expect(res.status).toBe(404);
    });

    it('should return 400 if subtask title is invalid', async () => {
      const res = await execPost('');

      expect(res.status).toBe(400);
      expect(res.body.errors[0].message).toMatch(/Subtask title is required/);
    });

    it('should save the subtask if input is valid', async () => {
      const res = await execPost('New Subtask', 'Subtask description');

      const subtaskInDB = await Subtask.findOne({ title: 'New Subtask' });

      expect(res.status).toBe(201);
      expect(subtaskInDB).not.toBeNull();
      expect(subtaskInDB!.taskId.toString()).toBe(taskId.toString());
    });

    it('should add the subtask ID to the task’s subtasks array if input is valid', async () => {
      await execPost('New Subtask');

      const taskInDB = await Task.findById(taskId);

      expect(taskInDB!.subtasks).toContainEqual(
        expect.any(mongoose.Types.ObjectId)
      );
    });

    it('should return the created subtask if input is valid', async () => {
      const res = await execPost('New Subtask', 'Subtask description');

      expect(res.body).toHaveProperty('_id');
      expect(res.body).toHaveProperty('title', 'New Subtask');
      expect(res.body).toHaveProperty('description', 'Subtask description');
      expect(res.body).toHaveProperty('taskId', taskId.toString());
    });
  });

  describe('PUT /:subtaskId', () => {
    let subtaskId: string | Types.ObjectId;

    beforeEach(async () => {
      await createUserAndToken();
      await createBoardColumnAndTask();

      const subtask = new Subtask({ title: 'Initial Subtask', taskId });
      await subtask.save();
      subtaskId = subtask._id;
    });

    const execPut = (
      newTitle: string,
      newDescription?: string,
      completed = false
    ) => {
      return request(app)
        .put(
          `/api/boards/${boardId}/columns/${columnId}/tasks/${taskId}/subtasks/${subtaskId}`
        )
        .set('x-auth-token', token)
        .send({ title: newTitle, description: newDescription, completed });
    };

    it('should return 401 if user is not authenticated', async () => {
      token = '';

      const res = await execPut('Updated Subtask');

      expect(res.status).toBe(401);
    });

    it('should return 404 if invalid task id is passed', async () => {
      taskId = '1';

      const res = await execPut('Updated Subtask');

      expect(res.status).toBe(404);
    });

    it('should return 404 if subtask is not found', async () => {
      subtaskId = new mongoose.Types.ObjectId();

      const res = await execPut('Updated Subtask');

      expect(res.status).toBe(404);
    });

    it('should return 404 if invalid subtask id is passed', async () => {
      subtaskId = '1';

      const res = await execPut('Updated Subtask');

      expect(res.status).toBe(404);
    });

    it('should return 400 if subtask title is invalid', async () => {
      const res = await execPut('');

      expect(res.status).toBe(400);
      expect(res.body.errors[0].message).toMatch(/Subtask title is required/);
    });

    it('should update the subtask if input is valid', async () => {
      const res = await execPut('Updated Subtask', 'Updated description', true);

      const subtaskInDB = await Subtask.findById(subtaskId);

      expect(res.status).toBe(200);
      expect(subtaskInDB!.title).toBe('Updated Subtask');
      expect(subtaskInDB!.description).toBe('Updated description');
      expect(subtaskInDB!.completed).toBe(true);
    });

    it('should return the updated subtask if input is valid', async () => {
      const res = await execPut('Updated Subtask', 'Updated description', true);

      expect(res.body).toHaveProperty('_id', subtaskId.toString());
      expect(res.body).toHaveProperty('title', 'Updated Subtask');
      expect(res.body).toHaveProperty('description', 'Updated description');
      expect(res.body).toHaveProperty('completed', true);
    });
  });

  describe('DELETE /:subtaskId', () => {
    let subtaskId: string | Types.ObjectId;

    beforeEach(async () => {
      await createUserAndToken();
      await createBoardColumnAndTask();

      const subtask = new Subtask({ title: 'Subtask to delete', taskId });
      await subtask.save();
      subtaskId = subtask._id;
    });

    const execDelete = () => {
      return request(app)
        .delete(
          `/api/boards/${boardId}/columns/${columnId}/tasks/${taskId}/subtasks/${subtaskId}`
        )
        .set('x-auth-token', token);
    };

    it('should return 401 if user is not authenticated', async () => {
      token = '';

      const res = await execDelete();

      expect(res.status).toBe(401);
    });

    it('should return 404 if invalid task id is passed', async () => {
      taskId = '1';

      const res = await execDelete();

      expect(res.status).toBe(404);
    });

    it('should return 404 if subtask is not found', async () => {
      subtaskId = new mongoose.Types.ObjectId();

      const res = await execDelete();

      expect(res.status).toBe(404);
    });

    it('should return 404 if invalid subtask id is passed', async () => {
      subtaskId = '1';

      const res = await execDelete();

      expect(res.status).toBe(404);
    });

    it('should delete the subtask if it exists', async () => {
      const res = await execDelete();

      const subtaskInDB = await Subtask.findById(subtaskId);

      expect(res.status).toBe(200);
      expect(subtaskInDB).toBeNull();
    });

    it('should remove the subtask ID from the task’s subtasks array', async () => {
      await execDelete();

      const taskInDB = await Task.findById(taskId);

      expect(taskInDB!.subtasks).not.toContainEqual(subtaskId);
    });

    it('should return the deleted subtask', async () => {
      const res = await execDelete();

      expect(res.body).toHaveProperty('_id', subtaskId.toString());
      expect(res.body).toHaveProperty('title', 'Subtask to delete');
    });
  });
});
