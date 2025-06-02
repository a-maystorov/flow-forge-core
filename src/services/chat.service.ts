import mongoose from 'mongoose';
import Chat from '../models/chat.model';
import Message, { MessageRole } from '../models/message.model';

/**
 * Service to handle chat conversations and AI interactions
 */
class ChatService {
  /**
   * Creates a new chat conversation
   * @param userId - The ID of the user creating the chat
   * @param initialTitle - Optional initial title for the chat
   * @returns The newly created chat
   */
  async createChat(
    userId: string | mongoose.Types.ObjectId,
    initialTitle: string = 'New Conversation'
  ) {
    try {
      const userObjectId =
        typeof userId === 'string'
          ? new mongoose.Types.ObjectId(userId)
          : userId;

      const chat = new Chat({
        userId: userObjectId,
        title: initialTitle,
      });

      await chat.save();
      return chat;
    } catch (error) {
      console.error('Error creating chat:', error);
      throw error;
    }
  }

  /**
   * Adds a message to an existing chat
   * @param chatId - The ID of the chat
   * @param role - The role of the message sender (user, assistant, system)
   * @param content - The content of the message
   * @returns The newly created message
   */
  async addMessage(
    chatId: string | mongoose.Types.ObjectId,
    role: MessageRole,
    content: string
  ) {
    try {
      // Convert chatId to ObjectId if it's a string
      const chatObjectId =
        typeof chatId === 'string'
          ? new mongoose.Types.ObjectId(chatId)
          : chatId;

      const message = new Message({
        chatId: chatObjectId,
        role,
        content,
      });

      await message.save();

      // Update the lastMessageAt timestamp on the chat
      await Chat.findByIdAndUpdate(chatObjectId, {
        lastMessageAt: new Date(),
      });

      return message;
    } catch (error) {
      console.error('Error adding message:', error);
      throw error;
    }
  }

  /**
   * Gets all messages for a specific chat
   * @param chatId - The ID of the chat
   * @returns Array of messages
   */
  async getChatMessages(chatId: string | mongoose.Types.ObjectId) {
    try {
      // Convert chatId to ObjectId if it's a string
      const chatObjectId =
        typeof chatId === 'string'
          ? new mongoose.Types.ObjectId(chatId)
          : chatId;

      const messages = await Message.find({ chatId: chatObjectId })
        .sort('createdAt')
        .exec();

      return messages;
    } catch (error) {
      console.error('Error getting chat messages:', error);
      throw error;
    }
  }
}

export default new ChatService();
