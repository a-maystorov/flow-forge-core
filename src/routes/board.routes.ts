import express, { Response } from 'express';
import Board from '../models/board.model';
import authMiddleware, { AuthRequest } from '../middleware/authMiddleware';
import { z } from 'zod';

const router = express.Router();

const boardCreationSchema = z.object({
  name: z.string().min(1, 'Board name is required'),
  columns: z
    .array(
      z.object({
        name: z.string().min(1, 'Column name is required'),
        tasks: z.array(z.string()),
      })
    )
    .optional(),
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const parsedData = boardCreationSchema.parse(req.body);
    const { name, columns } = parsedData;

    const board = new Board({ name, ownerId: req.userId, columns });
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

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const boards = await Board.find({ ownerId: req.userId });
    res.status(200).json(boards);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
