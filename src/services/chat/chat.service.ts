import { Types } from 'mongoose';
import { socketService } from '../../config/socket';
import ChatMessage, {
  ChatMessageMetadata,
  MessageStatus,
} from '../../models/chat-message.model';
import ChatSession from '../../models/chat-session.model';
import {
  ChatMessageDocument,
  ChatSessionDocument,
  toObjectId,
} from '../../types/mongoose';

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
  metadata?: ChatMessageMetadata;
}

// Typing status options
interface TypingStatusOptions {
  sessionId: Types.ObjectId | string;
  isTyping: boolean;
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
  ): Promise<ChatSessionDocument> {
    const { userId, title, boardId, taskId } = options;

    const chatSession = new ChatSession({
      userId: toObjectId(userId),
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
  ): Promise<ChatSessionDocument | null> {
    return (await ChatSession.findById(
      toObjectId(sessionId)
    )) as ChatSessionDocument | null;
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
  ): Promise<ChatSessionDocument[]> {
    const query: { userId: Types.ObjectId; status?: string } = {
      userId: toObjectId(userId),
    };

    if (status !== 'all') {
      query.status = status;
    }

    return (await ChatSession.find(query)
      .sort({ lastActive: -1 })
      .limit(limit)) as ChatSessionDocument[];
  }

  /**
   * Update a chat session
   * @param sessionId - The chat session ID
   * @param updates - The fields to update
   * @returns The updated chat session
   */
  async updateChatSession(
    sessionId: Types.ObjectId | string,
    updates: Partial<Omit<ChatSessionDocument, '_id' | 'userId'>>
  ): Promise<ChatSessionDocument | null> {
    return (await ChatSession.findByIdAndUpdate(
      toObjectId(sessionId),
      { ...updates, lastActive: new Date() },
      { new: true }
    )) as ChatSessionDocument | null;
  }

  /**
   * Archive a chat session
   * @param sessionId - The chat session ID
   * @returns The updated chat session
   */
  async archiveChatSession(
    sessionId: Types.ObjectId | string
  ): Promise<ChatSessionDocument | null> {
    return (await ChatSession.findByIdAndUpdate(
      toObjectId(sessionId),
      { status: 'archived' },
      { new: true }
    )) as ChatSessionDocument | null;
  }

  /**
   * Add a message to a chat session
   * @param options - Message creation options
   * @returns The created message
   */
  async addMessage(
    options: CreateMessageOptions
  ): Promise<ChatMessageDocument> {
    const { sessionId, role, content, metadata } = options;
    const typedSessionId =
      typeof sessionId === 'string' ? sessionId : sessionId.toString();

    // Create the new message
    const message = new ChatMessage({
      sessionId: toObjectId(sessionId),
      role,
      content,
      timestamp: new Date(),
      metadata: metadata || {},
      status: role === 'user' ? MessageStatus.SENT : MessageStatus.DELIVERED,
    });

    await message.save();

    // Update the chat session
    await ChatSession.findByIdAndUpdate(toObjectId(sessionId), {
      lastActive: new Date(),
      $push: { messages: message._id },
    });

    // Clear typing indicator if this is a user message
    if (role === 'user') {
      this.setTypingStatus({
        sessionId: typedSessionId,
        isTyping: false,
      });
    }

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
  ): Promise<ChatMessageDocument[]> {
    return (await ChatMessage.find({ sessionId: toObjectId(sessionId) })
      .sort({ timestamp: 1 })
      .skip(skip)
      .limit(limit)) as ChatMessageDocument[];
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
    const messages = await ChatMessage.find({
      sessionId: toObjectId(sessionId),
    })
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
    await ChatMessage.deleteMany({ sessionId: toObjectId(sessionId) });
    await ChatSession.findByIdAndDelete(toObjectId(sessionId));
  }

  /**
   * Update typing status for a user in a chat session
   * @param options - Typing status options
   */
  async setTypingStatus(options: TypingStatusOptions): Promise<void> {
    const { sessionId, isTyping } = options;

    // Ensure string type for socket events
    const typedSessionId =
      typeof sessionId === 'string' ? sessionId : sessionId.toString();

    // Emit typing status through socket
    socketService.emitToChatSession(typedSessionId, 'user_typing', {
      sessionId: typedSessionId,
      isTyping,
    });
  }

  /**
   * Set user typing status in a chat session
   * @param sessionId - Chat session ID
   * @param isTyping - Whether the user is typing
   */
  async setUserTypingStatus(
    sessionId: Types.ObjectId | string,
    isTyping: boolean
  ): Promise<void> {
    await this.setTypingStatus({
      sessionId,
      isTyping,
    });
  }

  /**
   * Set AI typing indicator to show that the AI is generating a response
   * @param sessionId - Chat session ID
   * @param isTyping - Whether the AI is typing
   */
  async setAITypingStatus(
    sessionId: Types.ObjectId | string,
    isTyping: boolean
  ): Promise<void> {
    const typedSessionId =
      typeof sessionId === 'string' ? sessionId : sessionId.toString();
    socketService.setAITypingStatus(typedSessionId, isTyping);
  }

  /**
   * Mark a message as read
   * @param messageId - Message ID
   */
  async markMessageAsRead(messageId: Types.ObjectId | string): Promise<void> {
    const message = (await ChatMessage.findById(
      toObjectId(messageId)
    )) as ChatMessageDocument;

    if (!message) {
      throw new Error('Message not found');
    }

    // Only update if not already read
    if (message.status !== MessageStatus.READ) {
      message.status = MessageStatus.READ;
      await message.save();

      // Emit read status
      const typedSessionId =
        typeof message.sessionId === 'string'
          ? message.sessionId
          : message.sessionId.toString();

      socketService.emitToChatSession(typedSessionId, 'message_read_status', {
        messageId: message._id.toString(),
      });
    }
  }

  /**
   * Mark all AI messages in a session as read
   * @param sessionId - Chat session ID
   */
  async markAllMessagesAsRead(
    sessionId: Types.ObjectId | string
  ): Promise<void> {
    // Find all unread AI messages
    const messages = (await ChatMessage.find({
      sessionId: toObjectId(sessionId),
      role: 'assistant',
      status: { $ne: MessageStatus.READ },
    })) as ChatMessageDocument[];

    // Mark each message as read
    for (const message of messages) {
      await this.markMessageAsRead(message._id);
    }
  }

  /**
   * Check if the user is typing
   * @param sessionId - Chat session ID
   * @returns Boolean indicating if the user is typing
   */
  isUserTyping(sessionId: Types.ObjectId | string): boolean {
    const typedSessionId =
      typeof sessionId === 'string' ? sessionId : sessionId.toString();
    return socketService.isUserTyping(typedSessionId);
  }
}

export const chatService = new ChatService();
