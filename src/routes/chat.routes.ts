import express from 'express';
import { validateObjectId } from '../middleware';
import auth from '../middleware/auth.middleware';
import Chat from '../models/chat.model';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError } from '../utils/errors';

const router = express.Router();

router.get(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const chats = await Chat.find({ userId: req.userId })
      .sort({ lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
      .lean()
      .exec();

    res.status(200).json(chats);
  })
);

router.get(
  '/:id',
  auth,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const chat = await Chat.findById(req.params.id).lean().exec();

    if (!chat) {
      throw new NotFoundError('Chat not found');
    }

    res.status(200).json(chat);
  })
);

export default router;
