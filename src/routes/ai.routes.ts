import express from 'express';
import { z } from 'zod';
import { auth } from '../middleware';
import { assistantService } from '../services/ai';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

/**
 * @route   POST /api/ai/board-suggestion
 * @desc    Generate board suggestions based on project description
 * @access  Private
 */
const boardSuggestionSchema = z.object({
  description: z.string().min(1, 'Project description is required'),
});

router.post(
  '/board-suggestion',
  auth,
  asyncHandler(async (req, res) => {
    const parsedData = boardSuggestionSchema.parse(req.body);
    const { description } = parsedData;

    const suggestion =
      await assistantService.generateBoardSuggestion(description);

    if (!suggestion) {
      return res.status(400).json({
        message: 'Failed to generate board suggestion',
      });
    }

    res.status(200).json(suggestion);
  })
);

/**
 * @route   POST /api/ai/task-breakdown
 * @desc    Break down a task into subtasks
 * @access  Private
 */
const taskBreakdownSchema = z.object({
  description: z.string().min(1, 'Task description is required'),
});

router.post(
  '/task-breakdown',
  auth,
  asyncHandler(async (req, res) => {
    const parsedData = taskBreakdownSchema.parse(req.body);
    const { description } = parsedData;

    const taskBreakdown =
      await assistantService.generateTaskBreakdown(description);

    if (!taskBreakdown) {
      return res.status(400).json({
        message: 'Failed to generate task breakdown',
      });
    }

    res.status(200).json({ subtasks: taskBreakdown.subtasks });
  })
);

/**
 * @route   POST /api/ai/task-improvement
 * @desc    Get improvement suggestions for a task
 * @access  Private
 */
const taskImprovementSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  description: z.string().optional(),
});

router.post(
  '/task-improvement',
  auth,
  asyncHandler(async (req, res) => {
    const parsedData = taskImprovementSchema.parse(req.body);
    const { title, description } = parsedData;

    const suggestions = await assistantService.improveTaskDescription(
      title,
      description
    );

    if (!suggestions) {
      return res.status(400).json({
        message: 'Failed to generate improvement suggestions',
      });
    }

    res.status(200).json({ suggestions });
  })
);

export default router;
