import express from 'express';
import { z } from 'zod';
import auth from '../middleware/auth.middleware';
import validateObjectId from '../middleware/validateObjectId.middleware';
import Board from '../models/board.model';
import Column from '../models/column.model';
import taskRoutes from './task.routes';

const router = express.Router({ mergeParams: true });

router.use(validateObjectId('boardId'));

const columnCreationSchema = z.object({
  name: z.string().min(1, 'Column name is required'),
});

router.post('/', validateObjectId('boardId'), auth, async (req, res) => {
  try {
    const boardId = req.params.boardId;
    const userId = req.userId;

    const board = await Board.findOne({
      _id: boardId,
      ownerId: userId,
    });

    if (!board) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }

    const parsedData = columnCreationSchema.parse(req.body);
    const { name } = parsedData;

    const column = new Column({ name, boardId });
    await column.save();

    await Board.updateOne({ _id: boardId }, { $push: { columns: column._id } });

    res.status(201).json(column);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

router.put(
  '/:columnId',
  validateObjectId('columnId'),
  auth,
  async (req, res) => {
    try {
      const { columnId, boardId } = req.params;

      const column = await Column.findOne({ _id: columnId, boardId });

      if (!column) {
        res.status(404).json({ message: 'Column not found' });
        return;
      }

      const parsedData = columnCreationSchema.parse(req.body);
      const { name } = parsedData;

      column.name = name;
      await column.save();

      res.status(200).json(column);
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
  '/:columnId',
  validateObjectId('columnId'),
  auth,
  async (req, res) => {
    try {
      const { columnId, boardId } = req.params;

      const column = await Column.findOne({ _id: columnId, boardId });

      if (!column) {
        res.status(404).json({ message: 'Column not found' });
        return;
      }

      await column.deleteOne();

      await Board.updateOne({ _id: boardId }, { $pull: { columns: columnId } });

      res.status(200).json(column);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

router.use('/:columnId/tasks', taskRoutes);

export default router;
