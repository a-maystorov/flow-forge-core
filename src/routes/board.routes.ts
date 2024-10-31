import express, { Request, Response } from 'express';
import { z } from 'zod';
import auth from '../middleware/auth.middleware';
import Board from '../models/board.model';
import columnRoutes from './column.routes';

const router = express.Router();

router.get('/', auth, async (req: Request, res: Response) => {
  try {
    const boards = await Board.find({ ownerId: req.userId });
    res.status(200).json(boards);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/:boardId', auth, async (req: Request, res: Response) => {
  try {
    const { boardId } = req.params;
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

router.post('/', auth, async (req: Request, res: Response) => {
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

router.put('/:boardId', auth, async (req: Request, res: Response) => {
  try {
    const { boardId } = req.params;
    const userId = req.userId;

    const board = await Board.findById(boardId);

    if (!board) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }

    if (board.ownerId.toString() !== userId) {
      res
        .status(403)
        .json({ message: 'You do not have permission to edit this board' });
      return;
    }

    const parsedData = boardCreationSchema.parse(req.body);
    const { name } = parsedData;

    board.name = name;
    await board.save();

    res.status(200).json({ message: 'Board updated successfully', board });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

router.delete('/:boardId', auth, async (req, res) => {
  try {
    const { boardId } = req.params;
    const userId = req.userId;

    const board = await Board.findById(boardId);

    if (!board) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }

    if (board.ownerId.toString() !== userId) {
      res
        .status(403)
        .json({ message: 'You do not have permission to delete this board' });
      return;
    }

    await board.deleteOne();

    res.status(200).json({ message: 'Board deleted successfully', board });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.use('/:boardId/columns', columnRoutes);

export default router;
