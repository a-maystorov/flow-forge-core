import express from 'express';
import { z } from 'zod';
import auth from '../middleware/auth.middleware';
import Column from '../models/column.model';
import Task from '../models/task.model';
import subtaskRoutes from './subtask.routes';
import validateObjectId from '../middleware/validateObjectId.middleware';

const router = express.Router({ mergeParams: true });

router.use(validateObjectId('columnId'));

const taskCreationSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  description: z.string().optional(),
});

router.post('/', auth, async (req, res) => {
  try {
    const { columnId } = req.params;

    const column = await Column.findById(columnId);

    if (!column) {
      res.status(404).json({ message: 'Column not found' });
      return;
    }

    const parsedData = taskCreationSchema.parse(req.body);
    const { title, description } = parsedData;

    const task = new Task({ title, description, columnId });
    await task.save();

    await Column.updateOne({ _id: columnId }, { $push: { tasks: task._id } });

    res.status(201).json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

router.put('/:taskId', validateObjectId('taskId'), auth, async (req, res) => {
  try {
    const { taskId, columnId } = req.params;

    const task = await Task.findOne({ _id: taskId, columnId });

    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    const parsedData = taskCreationSchema.parse(req.body);
    const { title, description } = parsedData;

    task.title = title;
    task.description = description;
    await task.save();

    res.status(200).json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

router.delete(
  '/:taskId',
  validateObjectId('taskId'),
  auth,
  async (req, res) => {
    try {
      const { taskId, columnId } = req.params;

      const task = await Task.findOne({ _id: taskId, columnId });

      if (!task) {
        res.status(404).json({ message: 'Task not found' });
        return;
      }

      await task.deleteOne();

      await Column.updateOne({ _id: columnId }, { $pull: { tasks: taskId } });

      res.status(200).json(task);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

router.use('/:taskId/subtasks', subtaskRoutes);

export default router;
