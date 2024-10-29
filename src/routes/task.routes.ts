import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import authMiddleware from '../middleware/authMiddleware';
import Column from '../models/column.model';
import Task from '../models/task.model';

const router = express.Router();

const taskCreationSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  description: z.string().optional(),
});

router.post('', authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { columnId } = req.params;
    const parsedData = taskCreationSchema.parse(req.body);
    const { title, description } = parsedData;

    const column = await Column.findById(columnId).session(session);
    if (!column) {
      res.status(404).json({ message: 'Column not found' });
      return;
    }

    const task = new Task({ title, description });
    await task.save({ session });

    await Column.findByIdAndUpdate(
      columnId,
      { $push: { taskIds: task._id } },
      { session }
    );

    await session.commitTransaction();
    res.status(201).json(task);
  } catch (error) {
    await session.abortTransaction();

    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  } finally {
    session.endSession();
  }
});

export default router;
