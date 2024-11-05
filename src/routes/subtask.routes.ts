import express from 'express';
import { z } from 'zod';
import auth from '../middleware/auth.middleware';
import validateObjectId from '../middleware/validateObjectId.middleware';
import Subtask from '../models/subtask.model';
import Task from '../models/task.model';

const router = express.Router({ mergeParams: true });

router.use(validateObjectId('taskId'));

const subtaskCreationSchema = z.object({
  title: z.string().min(1, 'Subtask title is required'),
  description: z.string().optional(),
  completed: z.boolean().default(false),
});

router.post('/', auth, async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await Task.findById(taskId);

    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    const parsedData = subtaskCreationSchema.parse(req.body);
    const { title, description, completed } = parsedData;

    const subtask = new Subtask({ title, description, completed, taskId });
    await subtask.save();

    await Task.updateOne({ _id: taskId }, { $push: { subtasks: subtask._id } });

    res.status(201).json(subtask);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

router.put(
  '/:subtaskId',
  validateObjectId('subtaskId'),
  auth,
  async (req, res) => {
    try {
      const { subtaskId, taskId } = req.params;

      const subtask = await Subtask.findOne({ _id: subtaskId, taskId });

      if (!subtask) {
        res.status(404).json({ message: 'Subtask not found' });
        return;
      }

      const parsedData = subtaskCreationSchema.parse(req.body);
      const { title, description, completed } = parsedData;

      subtask.title = title;
      subtask.description = description;
      subtask.completed = completed;
      await subtask.save();

      res.status(200).json(subtask);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ errors: error.errors });
      } else {
        res.status(500).json({ error: (error as Error).message });
      }
    }
  }
);

router.delete(
  '/:subtaskId',
  validateObjectId('subtaskId'),
  auth,
  async (req, res) => {
    try {
      const { subtaskId, taskId } = req.params;

      const subtask = await Subtask.findOne({ _id: subtaskId, taskId });

      if (!subtask) {
        res.status(404).json({ message: 'Subtask not found' });
        return;
      }

      await subtask.deleteOne();

      // TODO: Not sure if I should pull this from the tasks. TBD.
      // await Task.updateOne({ _id: taskId }, { $pull: { subtasks: subtaskId } });

      res.status(200).json(subtask);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

export default router;
