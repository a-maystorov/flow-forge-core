import express from 'express';
import { z } from 'zod';
import { auth, validateObjectId } from '../middleware';
import Subtask from '../models/subtask.model';
import Task from '../models/task.model';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError } from '../utils/errors';

const router = express.Router({ mergeParams: true });

router.use(validateObjectId('taskId'));

const subtaskCreationSchema = z.object({
  title: z.string().min(1, 'Subtask title is required'),
  description: z.string().optional(),
  completed: z.boolean().default(false),
});

router.post(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const { taskId } = req.params;

    const task = await Task.findById(taskId);
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    const parsedData = subtaskCreationSchema.parse(req.body);
    const { title, description, completed } = parsedData;

    const subtask = new Subtask({ title, description, completed, taskId });
    await subtask.save();

    await Task.updateOne({ _id: taskId }, { $push: { subtasks: subtask._id } });

    res.status(201).json(subtask);
  })
);

router.put(
  '/:subtaskId',
  validateObjectId('subtaskId'),
  auth,
  asyncHandler(async (req, res) => {
    const { subtaskId, taskId } = req.params;

    const subtask = await Subtask.findOne({ _id: subtaskId, taskId });
    if (!subtask) {
      throw new NotFoundError('Subtask not found');
    }

    const parsedData = subtaskCreationSchema.parse(req.body);
    const { title, description, completed } = parsedData;

    subtask.title = title;
    subtask.description = description;
    subtask.completed = completed;
    await subtask.save();

    res.status(200).json(subtask);
  })
);

router.delete(
  '/:subtaskId',
  validateObjectId('subtaskId'),
  auth,
  asyncHandler(async (req, res) => {
    const { subtaskId, taskId } = req.params;

    const subtask = await Subtask.findOne({ _id: subtaskId, taskId });
    if (!subtask) {
      throw new NotFoundError('Subtask not found');
    }

    await subtask.deleteOne();

    await Task.updateOne({ _id: taskId }, { $pull: { subtasks: subtaskId } });

    res.status(200).json(subtask);
  })
);

export default router;
