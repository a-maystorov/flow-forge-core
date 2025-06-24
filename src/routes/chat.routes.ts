import express from 'express';
import { validateObjectId } from '../middleware';
import auth from '../middleware/auth.middleware';
import Chat from '../models/chat.model';
import Message from '../models/message.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ForbiddenError, NotFoundError } from '../utils/errors';

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

router.get(
  '/:id/messages',
  auth,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const chat = await Chat.findById(req.params.id).exec();

    if (!chat) {
      throw new NotFoundError('Chat not found');
    }

    const messages = await Message.find({ chatId: req.params.id })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    res.status(200).json(messages);
  })
);

router.patch(
  '/:id',
  auth,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const chat = await Chat.findById(req.params.id).exec();

    if (!chat) {
      throw new NotFoundError('Chat not found');
    }

    if (req.userId?.toString() !== chat.userId.toString()) {
      throw new ForbiddenError(
        'You do not have permission to update this chat'
      );
    }

    try {
      const updatedChat = await Chat.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true, runValidators: true }
      ).lean();

      res.status(200).json(updatedChat);
    } catch (error) {
      console.error('Error updating chat:', error);
      throw error;
    }
  })
);

router.delete(
  '/:id',
  auth,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const chat = await Chat.findById(req.params.id).exec();

    if (!chat) {
      throw new NotFoundError('Chat not found');
    }

    if (req.userId?.toString() !== chat.userId.toString()) {
      throw new ForbiddenError(
        'You do not have permission to delete this chat'
      );
    }

    try {
      await Message.deleteMany({ chatId: req.params.id });
      await Chat.findByIdAndDelete(req.params.id);

      res.status(200).json({
        message: 'Chat and all associated messages deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting chat:', error);
      throw error;
    }
  })
);

export default router;
