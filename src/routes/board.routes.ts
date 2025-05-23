import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { auth, validateObjectId } from '../middleware';
import Board from '../models/board.model';
import Column from '../models/column.model';
import Subtask from '../models/subtask.model';
import Task from '../models/task.model';
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
      options: { sort: { position: 1 } },
      populate: {
        path: 'tasks',
        populate: {
          path: 'subtasks',
        },
      },
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
      populate: {
        path: 'tasks',
        populate: {
          path: 'subtasks',
        },
      },
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

    const user = await mongoose.model('User').findById(req.userId);
    if (!user?.email) {
      const existingBoard = await Board.findOne({ ownerId: req.userId });

      if (existingBoard) {
        throw new ForbiddenError(
          'Unregistered users are limited to creating only one board.'
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
  validateObjectId('boardId'),
  auth,
  asyncHandler(async (req, res) => {
    const { boardId } = req.params;
    const userId = req.userId;

    const board = await Board.findOne({ _id: boardId, ownerId: userId });
    if (!board) {
      throw new NotFoundError('Board not found');
    }

    const columns = await Column.find({ boardId }, { _id: 1 });
    const columnIds = columns.map((col) => col._id);

    const tasks = await Task.find({ columnId: { $in: columnIds } }, { _id: 1 });
    const taskIds = tasks.map((task) => task._id);

    await Promise.all([
      Subtask.deleteMany({ taskId: { $in: taskIds } }),
      Task.deleteMany({ columnId: { $in: columnIds } }),
      Column.deleteMany({ boardId }),
      board.deleteOne(),
    ]);

    res.status(200).json(board);
  })
);

router.use('/:boardId/columns', columnRoutes);

export default router;
