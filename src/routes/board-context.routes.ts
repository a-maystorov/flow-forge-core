import express from 'express';
import { validateObjectId } from '../middleware';
import auth from '../middleware/auth.middleware';
import BoardService from '../services/board.service';

const router = express.Router();

/**
 * @route   POST /api/board-context/create
 * @desc    Create a new board from a board context object
 * @access  Private
 */
router.post('/create', auth, async (req, res) => {
  try {
    const { chatId } = req.body;
    const context = req.body.boardContext || req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required',
      });
    }

    const board = await BoardService.createBoardFromContext(
      context,
      userId as string,
      chatId
    );

    res.status(201).json({
      success: true,
      data: board,
      message: 'Board successfully created from context',
    });
  } catch (error) {
    console.error('Error creating board from context:', error);
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'An error occurred while creating the board',
    });
  }
});

/**
 * @route   PUT /api/board-context/update/:boardId
 * @desc    Update an existing board using a board context object
 * @access  Private
 */
router.put(
  '/update/:boardId',
  auth,
  validateObjectId('boardId'),
  async (req, res) => {
    try {
      const { boardId } = req.params;
      const context = req.body.boardContext || req.body;
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User ID is required',
        });
      }

      const board = await BoardService.updateBoardFromContext(
        boardId,
        context,
        userId as string
      );

      res.status(200).json({
        success: true,
        data: board,
        message: 'Board successfully updated from context',
      });
    } catch (error) {
      console.error('Error updating board from context:', error);

      if (
        error instanceof Error &&
        error.message === 'Board not found or unauthorized'
      ) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'An error occurred while updating the board',
      });
    }
  }
);

export default router;
