import express from 'express';
import { z } from 'zod';
import auth from '../middleware/auth.middleware';
import Board from '../models/board.model';
import Column from '../models/column.model';
import taskRoutes from './task.routes';

const router = express.Router({ mergeParams: true });

const columnCreationSchema = z.object({
  name: z.string().min(1, 'Column name is required'),
});

router.post('/', auth, async (req, res) => {
  try {
    const boardId = req.params.boardId;
    const parsedData = columnCreationSchema.parse(req.body);
    const { name } = parsedData;

    const board = await Board.findById(boardId);

    if (!board) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }

    const column = new Column({ name, boardId });
    await column.save();

    res.status(201).json(board);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

router.put('/:columnId', auth, async (req, res) => {
  try {
    const { columnId } = req.params;
    const parsedData = columnCreationSchema.parse(req.body);
    const { name } = parsedData;

    const column = await Column.findOneAndUpdate(
      { _id: columnId },
      { name },
      { new: true }
    );

    if (!column) {
      res.status(404).json({ message: 'Column not found' });
      return;
    }

    res.status(200).json(column);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

router.delete('/:columnId', auth, async (req, res) => {
  try {
    const { columnId } = req.params;

    const column = await Column.findByIdAndDelete(columnId);

    if (!column) {
      res.status(404).json({ message: 'Column not found' });
      return;
    }

    res.status(200).json({ message: 'Column deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.use('/:columnId/tasks', taskRoutes);

export default router;
