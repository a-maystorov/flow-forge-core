import { Types } from 'mongoose';
import {
  BoardSuggestion,
  Suggestion,
  SuggestionStatus,
  TaskBreakdownSuggestion,
  TaskImprovementSuggestion,
} from '../../models/suggestion.model';
import { SuggestionDocument, toObjectId } from '../../types/mongoose';
import { boardService } from '../board/board.service';
import { chatService } from '../chat/chat.service';

class SuggestionService {
  /**
   * Create a board suggestion
   */
  async createBoardSuggestion(
    userId: string | Types.ObjectId,
    sessionId: string | Types.ObjectId,
    content: BoardSuggestion,
    originalMessage: string
  ): Promise<SuggestionDocument> {
    const suggestion = new Suggestion({
      userId: toObjectId(userId),
      sessionId: toObjectId(sessionId),
      type: 'board',
      status: SuggestionStatus.PENDING,
      content,
      originalMessage,
    });

    await suggestion.save();
    return suggestion as SuggestionDocument;
  }

  /**
   * Create a task breakdown suggestion
   */
  async createTaskBreakdownSuggestion(
    userId: string | Types.ObjectId,
    sessionId: string | Types.ObjectId,
    content: TaskBreakdownSuggestion,
    originalMessage: string
  ): Promise<SuggestionDocument> {
    const suggestion = new Suggestion({
      userId: toObjectId(userId),
      sessionId: toObjectId(sessionId),
      type: 'task-breakdown',
      status: SuggestionStatus.PENDING,
      content,
      originalMessage,
    });

    await suggestion.save();
    return suggestion as SuggestionDocument;
  }

  /**
   * Create a task improvement suggestion that can be linked to a specific task from a board suggestion
   */
  async createTaskImprovementSuggestion(
    userId: string | Types.ObjectId,
    sessionId: string | Types.ObjectId,
    content: TaskImprovementSuggestion,
    originalMessage: string,
    relatedSuggestionId?: string | Types.ObjectId,
    metadata?: { taskId?: string }
  ): Promise<SuggestionDocument> {
    const suggestion = new Suggestion({
      userId: toObjectId(userId),
      sessionId: toObjectId(sessionId),
      type: 'task-improvement',
      status: SuggestionStatus.PENDING,
      content,
      originalMessage,
      relatedSuggestionId: relatedSuggestionId
        ? toObjectId(relatedSuggestionId)
        : undefined,
      metadata,
    });

    await suggestion.save();
    return suggestion as SuggestionDocument;
  }

  /**
   * Get a suggestion by ID
   */
  async getSuggestion(
    suggestionId: string | Types.ObjectId
  ): Promise<SuggestionDocument | null> {
    return Suggestion.findById(
      toObjectId(suggestionId)
    ) as Promise<SuggestionDocument | null>;
  }

  /**
   * Get all suggestions for a user
   */
  async getSuggestionsByUser(
    userId: string | Types.ObjectId
  ): Promise<SuggestionDocument[]> {
    return Suggestion.find({
      userId: toObjectId(userId),
    }) as Promise<SuggestionDocument[]>;
  }

  /**
   * Get all suggestions for a chat session
   */
  async getSuggestionsBySession(
    sessionId: string | Types.ObjectId
  ): Promise<SuggestionDocument[]> {
    return Suggestion.find({ sessionId: toObjectId(sessionId) }).sort({
      createdAt: -1,
    }) as Promise<SuggestionDocument[]>;
  }

  /**
   * Get all pending suggestions for a chat session
   */
  async getPendingSuggestionsBySession(
    sessionId: string | Types.ObjectId
  ): Promise<SuggestionDocument[]> {
    return Suggestion.find({
      sessionId: toObjectId(sessionId),
      status: SuggestionStatus.PENDING,
    }).sort({ createdAt: -1 }) as Promise<SuggestionDocument[]>;
  }

  /**
   * Accept a suggestion
   */
  async acceptSuggestion(
    suggestionId: string | Types.ObjectId,
    messageContent?: string
  ): Promise<SuggestionDocument | null> {
    const suggestion = (await Suggestion.findById(
      toObjectId(suggestionId)
    )) as SuggestionDocument | null;

    if (!suggestion) {
      return null;
    }

    suggestion.status = SuggestionStatus.ACCEPTED;
    await suggestion.save();

    // Implementation: Process the accepted suggestion based on its type
    try {
      if (suggestion.type === 'board') {
        // Create the board, columns, and tasks in the database
        const boardData = suggestion.content as BoardSuggestion;
        const result = await boardService.createBoardFromSuggestion(
          suggestion.userId,
          boardData
        );

        // Store the created board ID in suggestion metadata
        if (!suggestion.metadata) {
          suggestion.metadata = {};
        }
        suggestion.metadata.boardId = result.board._id.toString();
        await suggestion.save();
      } else if (suggestion.type === 'task-breakdown') {
        // TODO: Implement task breakdown handling
        // This would create a task with subtasks
      } else if (suggestion.type === 'task-improvement') {
        // TODO: Implement task improvement handling
        // This would update a task's title/description
      }

      // If message content is provided, add a new message to the chat session
      if (messageContent && suggestion.sessionId) {
        await chatService.addMessage({
          sessionId: suggestion.sessionId.toString(),
          role: 'user',
          content: messageContent,
        });

        // Add a system message acknowledging acceptance
        await chatService.addMessage({
          sessionId: suggestion.sessionId.toString(),
          role: 'system',
          content: `✅ The suggestion has been accepted and processed.`,
        });
      }
    } catch (error) {
      console.error('Error processing accepted suggestion:', error);
      // Revert to pending if there was an error
      suggestion.status = SuggestionStatus.PENDING;
      await suggestion.save();
      throw error;
    }

    // Return the updated suggestion
    return suggestion;
  }

  /**
   * Reject a suggestion
   */
  async rejectSuggestion(
    suggestionId: string | Types.ObjectId,
    messageContent?: string
  ): Promise<SuggestionDocument | null> {
    const suggestion = (await Suggestion.findById(
      toObjectId(suggestionId)
    )) as SuggestionDocument | null;

    if (!suggestion) {
      return null;
    }

    suggestion.status = SuggestionStatus.REJECTED;
    await suggestion.save();

    // If message content is provided, add a new message to the chat session
    if (messageContent && suggestion.sessionId) {
      await chatService.addMessage({
        sessionId: suggestion.sessionId.toString(),
        role: 'user',
        content: messageContent,
      });

      // Add a system message acknowledging rejection
      await chatService.addMessage({
        sessionId: suggestion.sessionId.toString(),
        role: 'system',
        content: `❌ The suggestion has been rejected.`,
      });
    }

    return suggestion;
  }

  /**
   * Modify a suggestion's content
   */
  async modifySuggestion(
    suggestionId: string | Types.ObjectId,
    content: Partial<
      BoardSuggestion | TaskBreakdownSuggestion | TaskImprovementSuggestion
    >,
    messageContent?: string
  ): Promise<SuggestionDocument | null> {
    const suggestion = (await Suggestion.findById(
      toObjectId(suggestionId)
    )) as SuggestionDocument | null;

    if (!suggestion) {
      return null;
    }

    // Update the content with new values
    suggestion.content = {
      ...suggestion.content,
      ...content,
    };

    suggestion.status = SuggestionStatus.MODIFIED;

    await suggestion.save();

    // If message content is provided, add a new message to the chat session
    if (messageContent && suggestion.sessionId) {
      await chatService.addMessage({
        sessionId: suggestion.sessionId.toString(),
        role: 'user',
        content: messageContent,
      });

      // Add a system message acknowledging modification
      await chatService.addMessage({
        sessionId: suggestion.sessionId.toString(),
        role: 'system',
        content: `✏️ The suggestion has been modified.`,
      });
    }

    return suggestion;
  }

  /**
   * Find the suggestion containing a task by ID
   */
  async findSuggestionByTaskId(
    taskId: string
  ): Promise<SuggestionDocument | null> {
    const suggestions = await Suggestion.find({
      type: 'board',
    });

    for (const suggestion of suggestions) {
      const boardSuggestion = suggestion.content as BoardSuggestion;
      for (const column of boardSuggestion.columns) {
        if (column.tasks.some((task) => task.id === taskId)) {
          return suggestion as SuggestionDocument;
        }
      }
    }

    return null;
  }
}

export const suggestionService = new SuggestionService();
