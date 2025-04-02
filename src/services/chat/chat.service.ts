import { Types } from 'mongoose';
import ChatMessage, { IChatMessage } from '../../models/chat-message.model';
import ChatSession, { IChatSession } from '../../models/chat-session.model';

// Chat session creation options
interface CreateChatSessionOptions {
  userId: Types.ObjectId | string;
  title?: string;
  boardId?: Types.ObjectId | string;
  taskId?: Types.ObjectId | string;
}

// Message creation options
interface CreateMessageOptions {
  sessionId: Types.ObjectId | string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    suggestedBoardId?: Types.ObjectId | string;
    suggestedTaskId?: Types.ObjectId | string;
    suggestedColumnId?: Types.ObjectId | string;
    intent?: string;
    confidence?: number;
  };
}

/**
 * Service for managing chat sessions and messages
 */
class ChatService {
  /**
   * Create a new chat session
   * @param options - Options for creating a chat session
   * @returns The created chat session
   */
  async createChatSession(
    options: CreateChatSessionOptions
  ): Promise<IChatSession> {
    const { userId, title, boardId, taskId } = options;

    const chatSession = new ChatSession({
      userId,
      title: title || 'New Conversation',
      context: {
        boardId,
        taskId,
      },
    });

    await chatSession.save();
    return chatSession;
  }

  /**
   * Get a chat session by ID
   * @param sessionId - The ID of the chat session to retrieve
   * @returns The chat session or null if not found
   */
  async getChatSession(
    sessionId: Types.ObjectId | string
  ): Promise<IChatSession | null> {
    return ChatSession.findById(sessionId);
  }

  /**
   * Get all chat sessions for a user
   * @param userId - The user ID
   * @param limit - Maximum number of sessions to return
   * @param status - Filter by session status
   * @returns Array of chat sessions
   */
  async getChatSessionsByUser(
    userId: Types.ObjectId | string,
    limit = 10,
    status: 'active' | 'archived' | 'all' = 'active'
  ): Promise<IChatSession[]> {
    const query: { userId: Types.ObjectId | string; status?: string } = {
      userId,
    };

    if (status !== 'all') {
      query.status = status;
    }

    return ChatSession.find(query).sort({ lastActive: -1 }).limit(limit);
  }

  /**
   * Update a chat session
   * @param sessionId - The chat session ID
   * @param updates - The fields to update
   * @returns The updated chat session
   */
  async updateChatSession(
    sessionId: Types.ObjectId | string,
    updates: Partial<Omit<IChatSession, '_id' | 'userId'>>
  ): Promise<IChatSession | null> {
    return ChatSession.findByIdAndUpdate(
      sessionId,
      { ...updates, lastActive: new Date() },
      { new: true }
    );
  }

  /**
   * Archive a chat session
   * @param sessionId - The chat session ID
   * @returns The updated chat session
   */
  async archiveChatSession(
    sessionId: Types.ObjectId | string
  ): Promise<IChatSession | null> {
    return ChatSession.findByIdAndUpdate(
      sessionId,
      { status: 'archived' },
      { new: true }
    );
  }

  /**
   * Add a message to a chat session
   * @param options - Message creation options
   * @returns The created message
   */
  async addMessage(options: CreateMessageOptions): Promise<IChatMessage> {
    const { sessionId, role, content, metadata } = options;

    // Create the new message
    const message = new ChatMessage({
      sessionId,
      role,
      content,
      timestamp: new Date(),
      metadata,
    });

    await message.save();

    // Update the chat session
    await ChatSession.findByIdAndUpdate(sessionId, {
      lastActive: new Date(),
      $push: { messages: message._id },
    });

    return message;
  }

  /**
   * Get messages for a chat session
   * @param sessionId - The chat session ID
   * @param limit - Maximum number of messages to return
   * @param skip - Number of messages to skip (for pagination)
   * @returns Array of messages
   */
  async getMessages(
    sessionId: Types.ObjectId | string,
    limit = 50,
    skip = 0
  ): Promise<IChatMessage[]> {
    return ChatMessage.find({ sessionId })
      .sort({ timestamp: 1 })
      .skip(skip)
      .limit(limit);
  }

  /**
   * Get conversation context for AI processing
   * @param sessionId - The chat session ID
   * @param limit - Maximum number of messages to include
   * @returns Array of messages formatted for AI processing
   */
  async getConversationContext(
    sessionId: Types.ObjectId | string,
    limit = 10
  ): Promise<Array<{ role: string; content: string }>> {
    const messages = await ChatMessage.find({ sessionId })
      .sort({ timestamp: -1 })
      .limit(limit);

    // Reverse to get chronological order
    return messages.reverse().map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Delete a chat session and all its messages
   * @param sessionId - The chat session ID
   */
  async deleteChatSession(sessionId: Types.ObjectId | string): Promise<void> {
    await ChatMessage.deleteMany({ sessionId });
    await ChatSession.findByIdAndDelete(sessionId);
  }
}

export const chatService = new ChatService();
