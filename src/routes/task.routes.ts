import express from 'express';
import { z } from 'zod';
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
