import { Types } from 'mongoose';
import {
  BoardSuggestion,
  Suggestion,
  SuggestionStatus,
  TaskBreakdownSuggestion,
  TaskImprovementSuggestion,
} from '../../models/suggestion.model';
import { boardService } from '../board/board.service';
import { chatService } from '../chat/chat.service';

// Extended type that includes _id for Mongoose documents
type SuggestionDocument = InstanceType<typeof Suggestion> & {
  _id: Types.ObjectId;
};

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
    return suggestion ? (suggestion as SuggestionDocument) : null;
  }

  /**
   * Get all suggestions for a user
   */
  async getSuggestionsByUser(
    userId: string | Types.ObjectId
  ): Promise<SuggestionDocument[]> {
    return (await Suggestion.find({ userId })) as SuggestionDocument[];
  }

  /**
   * Get all suggestions for a chat session
   */
  async getSuggestionsBySession(
    sessionId: string | Types.ObjectId
  ): Promise<SuggestionDocument[]> {
    return (await Suggestion.find({ sessionId }).sort({
      createdAt: -1,
    })) as SuggestionDocument[];
  }

  /**
   * Get all pending suggestions for a chat session
   */
  async getPendingSuggestionsBySession(
    sessionId: string | Types.ObjectId
  ): Promise<SuggestionDocument[]> {
    return (await Suggestion.find({
      sessionId,
      status: SuggestionStatus.PENDING,
    }).sort({ createdAt: -1 })) as SuggestionDocument[];
  }

  /**
   * Accept a suggestion
   */
  async acceptSuggestion(
    suggestionId: string,
    messageContent?: string
  ): Promise<SuggestionDocument | null> {
    const suggestion = (await Suggestion.findById(
      suggestionId
    )) as SuggestionDocument;

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
        // This would update an existing task with improved title/description
      }
    } catch (error) {
      console.error(`Error implementing suggestion ${suggestionId}:`, error);
      // We continue with the flow even if implementation fails
    }

    // If message content is provided, add a new message to the chat session
    if (messageContent && suggestion.sessionId) {
      await chatService.addMessage({
        sessionId: suggestion.sessionId,
        role: 'assistant',
        content: messageContent,
        metadata: {
          // Map to the correct metadata fields based on the suggestion type
          suggestedBoardId:
            suggestion.type === 'board' ? suggestion._id.toString() : undefined,
          suggestedTaskId:
            suggestion.type === 'task-breakdown' ||
            suggestion.type === 'task-improvement'
              ? suggestion._id.toString()
              : undefined,
          // Include intent information
          intent: 'accept_suggestion',
        },
      });
    }

    return suggestion;
  }

  /**
   * Reject a suggestion
   */
  async rejectSuggestion(
    suggestionId: string,
    messageContent?: string
  ): Promise<SuggestionDocument | null> {
    const suggestion = (await Suggestion.findById(
      suggestionId
    )) as SuggestionDocument;

    if (!suggestion) {
      return null;
    }

    suggestion.status = SuggestionStatus.REJECTED;
    await suggestion.save();

    // If message content is provided, add a new message to the chat session
    if (messageContent && suggestion.sessionId) {
      await chatService.addMessage({
        sessionId: suggestion.sessionId,
        role: 'assistant',
        content: messageContent,
        metadata: {
          // Map to the correct metadata fields based on the suggestion type
          suggestedBoardId:
            suggestion.type === 'board' ? suggestion._id.toString() : undefined,
          suggestedTaskId:
            suggestion.type === 'task-breakdown' ||
            suggestion.type === 'task-improvement'
              ? suggestion._id.toString()
              : undefined,
          // Include intent information
          intent: 'reject_suggestion',
        },
      });
    }

    return suggestion;
  }

  /**
   * Modify a suggestion
   */
  async modifySuggestion(
    suggestionId: string,
    updatedContent: Partial<
      BoardSuggestion | TaskBreakdownSuggestion | TaskImprovementSuggestion
    >,
    messageContent?: string
  ): Promise<SuggestionDocument | null> {
    const suggestion = (await Suggestion.findById(
      suggestionId
    )) as SuggestionDocument;

    if (!suggestion) {
      return null;
    }

    // Update the content with the new values
    suggestion.content = {
      ...suggestion.content,
      ...updatedContent,
    };
    suggestion.status = SuggestionStatus.MODIFIED;
    await suggestion.save();

    // If message content is provided, add a new message to the chat session
    if (messageContent && suggestion.sessionId) {
      await chatService.addMessage({
        sessionId: suggestion.sessionId,
        role: 'assistant',
        content: messageContent,
        metadata: {
          // Map to the correct metadata fields based on the suggestion type
          suggestedBoardId:
            suggestion.type === 'board' ? suggestion._id.toString() : undefined,
          suggestedTaskId:
            suggestion.type === 'task-breakdown' ||
            suggestion.type === 'task-improvement'
              ? suggestion._id.toString()
              : undefined,
          // Include intent information
          intent: 'modify_suggestion',
        },
      });
    }

    return suggestion;
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
   * Find a board suggestion that contains a specific task ID
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
          return suggestion;
        }
      }
    }

    return null;
  }
}

export const suggestionService = new SuggestionService();
