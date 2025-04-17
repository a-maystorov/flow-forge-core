import { Types } from 'mongoose';
import {
  BoardSuggestion,
  Suggestion,
  SuggestionStatus,
  TaskBreakdownSuggestion,
  TaskImprovementSuggestion,
} from '../../models/suggestion.model';
import { SuggestionDocument } from '../../types';
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
      userId,
      sessionId,
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
      userId,
      sessionId,
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
      userId,
      sessionId,
      type: 'task-improvement',
      status: SuggestionStatus.PENDING,
      content,
      originalMessage,
      relatedSuggestionId,
      metadata,
    });

    await suggestion.save();
    return suggestion as SuggestionDocument;
  }

  /**
   * Get a suggestion by ID
   */
  async getSuggestion(
    suggestionId: string
  ): Promise<SuggestionDocument | null> {
    const suggestion = await Suggestion.findById(suggestionId);
    return suggestion as SuggestionDocument | null;
  }

  /**
   * Get all suggestions for a user
   */
  async getSuggestionsByUser(
    userId: string | Types.ObjectId
  ): Promise<SuggestionDocument[]> {
    const suggestions = await Suggestion.find({ userId });
    return suggestions as SuggestionDocument[];
  }

  /**
   * Get all suggestions for a chat session
   */
  async getSuggestionsBySession(
    sessionId: string | Types.ObjectId
  ): Promise<SuggestionDocument[]> {
    const suggestions = await Suggestion.find({ sessionId }).sort({
      createdAt: -1,
    });
    return suggestions as SuggestionDocument[];
  }

  /**
   * Get all pending suggestions for a chat session
   */
  async getPendingSuggestionsBySession(
    sessionId: string | Types.ObjectId
  ): Promise<SuggestionDocument[]> {
    const suggestions = await Suggestion.find({
      sessionId,
      status: SuggestionStatus.PENDING,
    }).sort({ createdAt: -1 });
    return suggestions as SuggestionDocument[];
  }

  /**
   * Accept a suggestion
   */
  async acceptSuggestion(
    suggestionId: string,
    messageContent?: string
  ): Promise<SuggestionDocument | null> {
    const suggestion = await Suggestion.findById(suggestionId);

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

        console.log(
          `Board created from suggestion: ${result.board.name} with ${result.columns.length} columns and ${result.tasks.length} tasks`
        );
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
      // We don't want to throw here, just log the error
      // The suggestion is still marked as accepted even if processing fails
    }

    // Return the updated suggestion
    return suggestion as SuggestionDocument;
  }

  /**
   * Reject a suggestion
   */
  async rejectSuggestion(
    suggestionId: string,
    messageContent?: string
  ): Promise<SuggestionDocument | null> {
    const suggestion = await Suggestion.findById(suggestionId);

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

    return suggestion as SuggestionDocument;
  }

  /**
   * Modify a suggestion
   */
  async modifySuggestion(
    suggestionId: string,
    content: Partial<
      BoardSuggestion | TaskBreakdownSuggestion | TaskImprovementSuggestion
    >,
    messageContent?: string
  ): Promise<SuggestionDocument | null> {
    const suggestion = await Suggestion.findById(suggestionId);

    if (!suggestion) {
      return null;
    }

    // Update the content with the modifications
    suggestion.content = { ...suggestion.content, ...content };
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

    return suggestion as SuggestionDocument;
  }

  /**
   * Find a task within a board suggestion by ID
   */
  findTaskInBoardSuggestion(
    boardSuggestion: BoardSuggestion,
    taskId: string
  ): {
    task: { title: string; description: string } | null;
    columnName: string | null;
  } {
    for (const column of boardSuggestion.columns) {
      const task = column.tasks.find((task) => task.id === taskId);
      if (task) {
        return { task, columnName: column.name };
      }
    }
    return { task: null, columnName: null };
  }

  /**
   * Find a board suggestion that contains a specific task
   */
  async findBoardSuggestionContainingTask(
    sessionId: string | Types.ObjectId,
    taskId: string
  ): Promise<SuggestionDocument | null> {
    const boardSuggestions = (await Suggestion.find({
      sessionId,
      type: 'board',
    })) as SuggestionDocument[];

    for (const suggestion of boardSuggestions) {
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
