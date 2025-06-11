import { Types } from 'mongoose';
import Chat from '../models/chat.model';
import { BoardContext } from '../types/ai.types';

export class BoardContextService {
  /**
   * Initialize or get the current board context for a chat
   * @param chatId The ID of the chat
   * @returns The current board context
   */
  static async getBoardContext(
    chatId: string | Types.ObjectId
  ): Promise<BoardContext> {
    const chat = await Chat.findById(chatId).select('boardContext').lean();
    if (!chat) {
      throw new Error('Chat not found');
    }
    return chat.boardContext || this.getEmptyBoardContext();
  }

  /**
   * Update the board context for a chat
   * @param chatId The ID of the chat
   * @param updates Partial board context with the fields to update
   * @returns The updated board context
   */
  static async updateBoardContext(
    chatId: string | Types.ObjectId,
    updates: Partial<BoardContext>
  ): Promise<BoardContext> {
    const chat = await Chat.findByIdAndUpdate(
      chatId,
      {
        $set: {
          boardContext: {
            ...updates,
          },
        },
      },
      { new: true, runValidators: true }
    )
      .select('boardContext')
      .lean();

    if (!chat) {
      throw new Error('Chat not found');
    }

    return chat.boardContext;
  }

  /**
   * Reset the board context to an empty state
   * @param chatId The ID of the chat
   * @returns The reset board context
   */
  static async resetBoardContext(
    chatId: string | Types.ObjectId
  ): Promise<BoardContext> {
    return this.updateBoardContext(chatId, this.getEmptyBoardContext());
  }

  /**
   * Get an empty board context
   * @returns An empty board context
   */
  static getEmptyBoardContext(): BoardContext {
    return {
      name: '',
      description: '',
      columns: [],
    };
  }
}

export default BoardContextService;
