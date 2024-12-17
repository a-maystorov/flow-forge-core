import express from 'express';
import { z } from 'zod';
import { auth, validateObjectId } from '../middleware';
import Board from '../models/board.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import columnRoutes from './column.routes';

const router = express.Router();

router.get(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const boards = await Board.find({ ownerId: req.userId }).populate({
      path: 'columns',
    });
    res.status(200).json(boards);
  })
);

router.get(
  '/:boardId',
  auth,
  validateObjectId('boardId'),
  asyncHandler(async (req, res) => {
    const { boardId } = req.params;
    const userId = req.userId;

    const board = await Board.findOne({
      _id: boardId,
      ownerId: userId,
    }).populate({
      path: 'columns',
    });

    if (!board) {
      throw new NotFoundError('Board not found');
    }

    res.status(200).json(board);
  })
);

const boardCreationSchema = z.object({
  name: z.string().min(1, 'Board name is required'),
});

router.post(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const parsedData = boardCreationSchema.parse(req.body);
    const { name } = parsedData;

    if (req.isGuest) {
      const existingBoard = await Board.findOne({ ownerId: req.userId });

      if (existingBoard) {
        throw new ForbiddenError(
          'Guest users are limited to creating only one board.'
        );
      }
    }

    const board = new Board({ name, ownerId: req.userId });
    await board.save();

    res.status(201).json(board);
  })
);

router.put(
  '/:boardId',
  auth,
  validateObjectId('boardId'),
  asyncHandler(async (req, res) => {
    const { boardId } = req.params;
    const userId = req.userId;

    const board = await Board.findOne({ _id: boardId, ownerId: userId });

    if (!board) {
      throw new NotFoundError('Board not found');
    }

    const parsedData = boardCreationSchema.parse(req.body);
    const { name } = parsedData;

    board.name = name;
    await board.save();

    res.status(200).json(board);
  })
);

router.delete(
  '/:boardId',
  auth,
  validateObjectId('boardId'),
  asyncHandler(async (req, res) => {
    const { boardId } = req.params;
    const userId = req.userId;

    const board = await Board.findOne({ _id: boardId, ownerId: userId });

    if (!board) {
      throw new NotFoundError('Board not found');
    }

    await board.deleteOne();
    res.status(200).json(board);
  })
);

router.use('/:boardId/columns', columnRoutes);

export default router;
