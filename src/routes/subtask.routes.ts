import express from 'express';
import { z } from 'zod';
import authMiddleware from '../middleware/authMiddleware';
import Subtask from '../models/subtask.model';
import Task from '../models/task.model';

const router = express.Router({ mergeParams: true });

const subtaskCreationSchema = z.object({
  name: z.string().min(1, 'Subtask name is required'),
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const parsedData = subtaskCreationSchema.parse(req.body);
    const { name } = parsedData;
    const { taskId } = req.params;

    const subtask = new Subtask({ name });
    await subtask.save();

    const task = await Task.findByIdAndUpdate(
      taskId,
      { $push: { subtasks: subtask._id } },
      { new: true }
    );

    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    res.status(201).json(subtask);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

router.patch('/:subtaskId', authMiddleware, async (req, res) => {
  try {
    const { subtaskId } = req.params;
    const { name, completed } = req.body;

    const subtask = await Subtask.findByIdAndUpdate(
      subtaskId,
      { name, completed },
      { new: true }
    );
    if (!subtask) {
      res.status(404).json({ message: 'Subtask not found' });
      return;
    }

    res.status(200).json(subtask);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete('/:subtaskId', authMiddleware, async (req, res) => {
  try {
    const { subtaskId, taskId } = req.params;

    const subtask = await Subtask.findByIdAndDelete(subtaskId);
    if (!subtask) {
      res.status(404).json({ message: 'Subtask not found' });
      return;
    }

    await Task.findByIdAndUpdate(taskId, { $pull: { subtasks: subtaskId } });

    res.status(200).json({ message: 'Subtask deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
