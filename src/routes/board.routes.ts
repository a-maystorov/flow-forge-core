import express, { Response } from 'express';
import { z } from 'zod';
import authMiddleware, { AuthRequest } from '../middleware/authMiddleware';
import Board from '../models/board.model';
import Task from '../models/task.model';
import Subtask from '../models/subtask.model';

const router = express.Router();

// Boards

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const boards = await Board.find({ ownerId: req.userId });
    res.status(200).json(boards);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const boardId = req.params.id;
    const userId = req.userId;

    const board = await Board.findOne({ _id: boardId, ownerId: userId });

    if (!board) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }

    res.status(200).json(board);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

const boardCreationSchema = z.object({
  name: z.string().min(1, 'Board name is required'),
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const parsedData = boardCreationSchema.parse(req.body);
    const { name } = parsedData;

    const board = new Board({ name, ownerId: req.userId });
    await board.save();

    res.status(201).json(board);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const boardId = req.params.id;
    const userId = req.userId;

    const parsedData = boardCreationSchema.parse(req.body);
    const { name } = parsedData;

    const board = await Board.findOneAndUpdate(
      { _id: boardId, ownerId: userId },
      { name },
      { new: true }
    );

    if (!board) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }

    res.status(200).json(board);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

// Subtasks
const subtaskCreationSchema = z.object({
  name: z.string().min(1, 'Subtask name is required'),
});

router.post(
  '/:boardId/tasks/:taskId/subtasks',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
  }
);

router.patch(
  '/:boardId/tasks/:taskId/subtasks/:subtaskId',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
  }
);

router.delete(
  '/:boardId/tasks/:taskId/subtasks/:subtaskId',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
  }
);

export default router;
