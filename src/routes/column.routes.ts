import express from 'express';
import { z } from 'zod';
import { auth, validateObjectId } from '../middleware';
import Board from '../models/board.model';
import Column from '../models/column.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import taskRoutes from './task.routes';

const router = express.Router({ mergeParams: true });

router.use(validateObjectId('boardId'));

const columnSchema = z.object({
  name: z.string().min(1, 'Column name is required'),
});

const batchColumnSchema = z.object({
  columns: z.array(z.string().min(1, 'Column name is required')),
});

router.post(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const boardId = req.params.boardId;
    const userId = req.userId;
    const { name } = columnSchema.parse(req.body);

    const board = await Board.findOne({
      _id: boardId,
      ownerId: userId,
    });

    if (!board) {
      throw new NotFoundError('Board not found');
    }

    if (req.isGuest) {
      const existingColumns = await Column.countDocuments({ boardId });
      if (existingColumns >= 3) {
        throw new ForbiddenError(
          'Guest users are limited to creating only three columns.'
        );
      }
    }

    const column = new Column({ name, boardId });
    await column.save();

    await Board.updateOne({ _id: boardId }, { $push: { columns: column._id } });

    return res.status(201).json(column);
  })
);

router.post(
  '/batch',
  auth,
  asyncHandler(async (req, res) => {
    const boardId = req.params.boardId;
    const userId = req.userId;
    const { columns: columnNames } = batchColumnSchema.parse(req.body);

    const board = await Board.findOne({
      _id: boardId,
      ownerId: userId,
    });

    if (!board) {
      throw new NotFoundError('Board not found');
    }

    if (req.isGuest) {
      const existingColumns = await Column.countDocuments({ boardId });
      if (existingColumns + columnNames.length > 3) {
        throw new ForbiddenError(
          'Guest users are limited to creating only three columns.'
        );
      }
    }

    const startPosition = await Column.countDocuments({ boardId });
    const columnsToCreate = columnNames.map((name, index) => ({
      name,
      boardId,
      position: startPosition + index,
    }));

    const createdColumns = await Column.insertMany(columnsToCreate);

    await Board.updateOne(
      { _id: boardId },
      {
        $push: {
          columns: { $each: createdColumns.map((col) => col._id) },
        },
      }
    );

    return res.status(201).json(createdColumns);
  })
);

router.put(
  '/:columnId',
  validateObjectId('columnId'),
  auth,
  asyncHandler(async (req, res) => {
    const { columnId, boardId } = req.params;

    const column = await Column.findOne({ _id: columnId, boardId });
    if (!column) {
      throw new NotFoundError('Column not found');
    }

    const { name } = columnSchema.parse(req.body);
    column.name = name;
    await column.save();

    res.status(200).json(column);
  })
);

router.delete(
  '/:columnId',
  validateObjectId('columnId'),
  auth,
  asyncHandler(async (req, res) => {
    const { columnId, boardId } = req.params;

    const column = await Column.findOne({ _id: columnId, boardId });
    if (!column) {
      throw new NotFoundError('Column not found');
    }

    await column.deleteOne();
    await Board.updateOne({ _id: boardId }, { $pull: { columns: columnId } });

    res.status(200).json(column);
  })
);

router.use('/:columnId/tasks', taskRoutes);

export default router;
