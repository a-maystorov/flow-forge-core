import express from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { auth, validateObjectId } from '../middleware';
import Column from '../models/column.model';
import Task from '../models/task.model';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError } from '../utils/errors';
import subtaskRoutes from './subtask.routes';

const router = express.Router({ mergeParams: true });

router.use(validateObjectId('columnId'));

const taskSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  description: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
  dueDate: z.string().optional(),
});

const moveTaskSchema = z.object({
  targetColumnId: z.string().min(1, 'Target column ID is required'),
});

const reorderTaskSchema = z.object({
  newPosition: z.number().min(0, 'Position must be non-negative'),
});

router.post(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const { columnId } = req.params;

    const column = await Column.findById(columnId);
    if (!column) {
      throw new NotFoundError('Column not found');
    }

    const parsedData = taskSchema.parse(req.body);
    const { title, description } = parsedData;

    const task = new Task({ title, description, columnId });
    await task.save();

    await Column.updateOne({ _id: columnId }, { $push: { tasks: task._id } });

    res.status(201).json(task);
  })
);

router.put(
  '/:taskId',
  validateObjectId('taskId'),
  auth,
  asyncHandler(async (req, res) => {
    const { taskId, columnId } = req.params;

    const task = await Task.findOne({ _id: taskId, columnId });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    const parsedData = taskSchema.parse(req.body);
    const { title, description } = parsedData;

    task.title = title;
    task.description = description;
    await task.save();

    res.status(200).json(task);
  })
);

router.patch(
  '/:taskId/reorder',
  validateObjectId('taskId'),
  auth,
  asyncHandler(async (req, res) => {
    const { taskId, columnId } = req.params;
    const { newPosition } = reorderTaskSchema.parse(req.body);

    const task = await Task.findOne({ _id: taskId, columnId });
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    const oldPosition = task.position;

    if (oldPosition === newPosition) {
      return res.status(200).json(task);
    }

    await Task.bulkWrite([
      {
        updateMany: {
          filter: {
            columnId,
            _id: { $ne: task._id },
            position:
              oldPosition < newPosition
                ? { $gt: oldPosition, $lte: newPosition } // Moving down
                : { $gte: newPosition, $lt: oldPosition }, // Moving up
          },
          update: {
            $inc: { position: oldPosition < newPosition ? -1 : 1 },
          },
        },
      },
      {
        updateOne: {
          filter: { _id: task._id },
          update: { $set: { position: newPosition } },
        },
      },
    ]);

    const updatedTask = await Task.findById(taskId);
    res.status(200).json(updatedTask);
  })
);

router.patch(
  '/:taskId/move',
  validateObjectId('taskId'),
  auth,
  asyncHandler(async (req, res) => {
    const { taskId, columnId: sourceColumnId } = req.params;
    const { targetColumnId } = moveTaskSchema.parse(req.body);

    const [sourceColumn, targetColumn, task] = await Promise.all([
      Column.findById(sourceColumnId),
      Column.findById(targetColumnId),
      Task.findById(taskId),
    ]);

    if (!sourceColumn) {
      throw new NotFoundError('Source column not found');
    }

    if (!targetColumn) {
      throw new NotFoundError('Target column not found');
    }

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    await Column.findByIdAndUpdate(sourceColumnId, {
      $pull: { tasks: taskId },
    });

    await Column.findByIdAndUpdate(targetColumnId, {
      $push: { tasks: taskId },
    });

    const targetColumnTaskCount = await Task.countDocuments({
      columnId: targetColumnId,
    });

    task.columnId = new Types.ObjectId(targetColumnId);
    task.position = targetColumnTaskCount;
    await task.save();

    res.status(200).json(task);
  })
);

router.delete(
  '/:taskId',
  validateObjectId('taskId'),
  auth,
  asyncHandler(async (req, res) => {
    const { taskId, columnId } = req.params;

    const task = await Task.findOne({ _id: taskId, columnId });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    await task.deleteOne();

    await Column.updateOne({ _id: columnId }, { $pull: { tasks: taskId } });

    res.status(200).json(task);
  })
);

router.use('/:taskId/subtasks', subtaskRoutes);

export default router;
