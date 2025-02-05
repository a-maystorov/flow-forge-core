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

    it('should return 401 if auth token is empty', async () => {
      token = '';
      const res = await execPost('New Task');

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Unauthorized');
    });

    it('should return 404 if invalid column id is passed', async () => {
      columnId = '1';

      const res = await execPost('New Task');

      expect(res.status).toBe(404);
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

    it('should return 401 if auth token is empty', async () => {
      token = '';
      const res = await execPut('Updated Task');

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Unauthorized');
    });

    it('should return 404 if invalid column id is passed', async () => {
      columnId = '1';

      const res = await execPut('Updated Task');

      expect(res.status).toBe(404);
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

    it('should return 401 if auth token is empty', async () => {
      token = '';
      const res = await execDelete();

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Unauthorized');
    });

    it('should return 404 if invalid column id is passed', async () => {
      columnId = '1';

      const res = await execDelete();

      expect(res.status).toBe(404);
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

      expect(columnInDB!.tasks).not.toContain(taskId);
    });

    it('should return the deleted task', async () => {
      const res = await execDelete();

      expect(res.body).toHaveProperty('_id', taskId.toString());
      expect(res.body).toHaveProperty('title', 'Task to delete');
    });
  });

  describe('PATCH /:taskId/move', () => {
    let taskId: string | Types.ObjectId;
    let targetColumnId: string | Types.ObjectId;
    let task: InstanceType<typeof Task>;

    beforeEach(async () => {
      await createUserAndToken();
      await createBoardAndColumn();

      task = new Task({
        title: 'Test Task',
        description: 'Test Description',
        columnId,
      });
      await task.save();
      taskId = task._id;

      const targetColumn = new Column({ name: 'Target Column', boardId });
      await targetColumn.save();
      targetColumnId = targetColumn._id;

      await Column.findByIdAndUpdate(columnId, {
        $push: { tasks: taskId },
      });
    });

    const execMove = () => {
      return request(app)
        .patch(
          `/api/boards/${boardId}/columns/${columnId}/tasks/${taskId}/move`
        )
        .set('x-auth-token', token)
        .send({ targetColumnId });
    };

    it('should return 401 if auth token is empty', async () => {
      token = '';
      const res = await execMove();

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Unauthorized');
    });

    it('should return 404 if source column is not found', async () => {
      columnId = new mongoose.Types.ObjectId();
      const res = await execMove();

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Source column not found');
    });

    it('should return 404 if target column is not found', async () => {
      targetColumnId = new mongoose.Types.ObjectId();
      const res = await execMove();

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Target column not found');
    });

    it('should return 404 if task is not found', async () => {
      taskId = new mongoose.Types.ObjectId();
      const res = await execMove();

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Task not found');
    });

    it('should return 400 if targetColumnId is not provided', async () => {
      targetColumnId = '';
      const res = await execMove();

      expect(res.status).toBe(400);
      expect(res.body.errors[0].message).toMatch(
        /Target column ID is required/
      );
    });

    describe('when moving a task with valid input', () => {
      let expectedPosition: number;

      beforeEach(async () => {
        expectedPosition = await Task.countDocuments({
          columnId: targetColumnId,
        });
      });

      it('should return 200 with updated task data', async () => {
        const res = await execMove();

        expect(res.status).toBe(200);
        expect(res.body.columnId).toBe(targetColumnId.toString());
        expect(res.body.position).toBe(expectedPosition);
      });

      it('should update task columnId and position in database', async () => {
        await execMove();

        const updatedTask = await Task.findById(taskId);
        expect(updatedTask?.columnId.toString()).toBe(
          targetColumnId.toString()
        );
        expect(updatedTask?.position).toBe(expectedPosition);
      });

      it('should remove task from source column', async () => {
        await execMove();

        const sourceColumn = await Column.findById(columnId);
        expect(sourceColumn?.tasks).not.toContain(taskId);
      });

      it('should add task to target column', async () => {
        await execMove();

        const targetColumn = await Column.findById(targetColumnId);
        expect(targetColumn?.tasks.map((t) => t.toString())).toContain(
          taskId.toString()
        );
      });

      it('should maintain correct task positions in target column', async () => {
        await execMove();

        const targetTasks = await Task.find({ columnId: targetColumnId }).sort(
          'position'
        );

        // New task should be at the end
        expect(targetTasks[targetTasks.length - 1]._id.toString()).toBe(
          taskId.toString()
        );

        // Other tasks should maintain their positions
        for (let i = 0; i < targetTasks.length - 1; i++) {
          expect(targetTasks[i].position).toBe(i);
        }
      });
    });
  });

  describe('PATCH /:taskId/reorder', () => {
    let taskId: string | Types.ObjectId;
    let task1: InstanceType<typeof Task>;
    let task2: InstanceType<typeof Task>;
    let task3: InstanceType<typeof Task>;

    beforeEach(async () => {
      await createUserAndToken();
      await createBoardAndColumn();

      task1 = new Task({ title: 'Task 1', columnId, position: 0 });
      task2 = new Task({ title: 'Task 2', columnId, position: 1 });
      task3 = new Task({ title: 'Task 3', columnId, position: 2 });

      await Promise.all([task1.save(), task2.save(), task3.save()]);
      taskId = task2._id; // We'll be moving task2 in most tests
    });

    const execReorder = (newPosition: number) => {
      return request(app)
        .patch(
          `/api/boards/${boardId}/columns/${columnId}/tasks/${taskId}/reorder`
        )
        .set('x-auth-token', token)
        .send({ newPosition });
    };

    it('should return 401 if auth token is empty', async () => {
      token = '';
      const res = await execReorder(0);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Unauthorized');
    });

    it('should return 404 if invalid column id is passed', async () => {
      columnId = '1';

      const res = await execReorder(0);

      expect(res.status).toBe(404);
    });

    it('should return 404 if task is not found', async () => {
      taskId = new mongoose.Types.ObjectId();

      const res = await execReorder(0);

      expect(res.status).toBe(404);
    });

    it('should return 400 if newPosition is negative', async () => {
      const res = await execReorder(-1);

      expect(res.status).toBe(400);
      expect(res.body.errors[0].message).toMatch(
        /Position must be non-negative/
      );
    });

    it('should move task up when newPosition is less than current position', async () => {
      const res = await execReorder(0);

      const [updatedTask1, updatedTask2, updatedTask3] = await Promise.all([
        Task.findById(task1._id),
        Task.findById(task2._id),
        Task.findById(task3._id),
      ]);

      expect(res.status).toBe(200);
      expect(updatedTask1!.position).toBe(1); // Shifted down
      expect(updatedTask2!.position).toBe(0); // Moved to front
      expect(updatedTask3!.position).toBe(2); // Unchanged
    });

    it('should move task down when newPosition is greater than current position', async () => {
      const res = await execReorder(2);

      const [updatedTask1, updatedTask2, updatedTask3] = await Promise.all([
        Task.findById(task1._id),
        Task.findById(task2._id),
        Task.findById(task3._id),
      ]);

      expect(res.status).toBe(200);
      expect(updatedTask1!.position).toBe(0); // Unchanged
      expect(updatedTask2!.position).toBe(2); // Moved to back
      expect(updatedTask3!.position).toBe(1); // Shifted up
    });

    it('should not change positions if newPosition equals current position', async () => {
      const res = await execReorder(1);

      const [updatedTask1, updatedTask2, updatedTask3] = await Promise.all([
        Task.findById(task1._id),
        Task.findById(task2._id),
        Task.findById(task3._id),
      ]);

      expect(res.status).toBe(200);
      expect(updatedTask1!.position).toBe(0);
      expect(updatedTask2!.position).toBe(1);
      expect(updatedTask3!.position).toBe(2);
    });

    it('should return the reordered task if successful', async () => {
      const res = await execReorder(0);

      expect(res.body).toHaveProperty('_id', taskId.toString());
      expect(res.body).toHaveProperty('position', 0);
    });
  });
});
