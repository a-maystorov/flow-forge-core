import express, { Response } from 'express';
import { z } from 'zod';
import authMiddleware, { AuthRequest } from '../middleware/authMiddleware';
import Board from '../models/board.model';
import Column from '../models/column.model';

const router = express.Router();

const columnCreationSchema = z.object({
  name: z.string().min(1, 'Column name is required'),
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
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

export default router;
