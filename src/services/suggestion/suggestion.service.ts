import { Types } from 'mongoose';
import Column from '../../models/column.model';
import Subtask from '../../models/subtask.model';
import {
  BoardSuggestion,
  Suggestion,
  SuggestionStatus,
  TaskBreakdownSuggestion,
  TaskImprovementSuggestion,
} from '../../models/suggestion.model';
import Task from '../../models/task.model';
import { SuggestionDocument, toObjectId } from '../../types/mongoose';
import { taskBreakdownAdapter } from '../ai/adapters/task-breakdown.adapter';
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
        // Create a new board from the board suggestion
        const boardSuggestion = suggestion.content as BoardSuggestion;
        const userId = suggestion.userId;

        if (!userId) {
          throw new Error('User ID is required to create a board');
        }

        await boardService.createBoardFromSuggestion(
          userId.toString(),
          boardSuggestion
        );
      } else if (suggestion.type === 'task-breakdown') {
        // Process task breakdown suggestion
        const taskBreakdownSuggestion =
          suggestion.content as TaskBreakdownSuggestion;

        // We need to know which column to add the task to
        // If metadata contains columnId, use that, otherwise use the first column found
        let columnId: Types.ObjectId;

        if (suggestion.metadata?.columnId) {
          columnId = toObjectId(suggestion.metadata.columnId);
        } else {
          // Find the first column available (ideally "To Do" or similar)
          const column = await Column.findOne({});
          if (!column) {
            throw new Error('No column found to add task to');
          }
          columnId = column._id;
        }

        // Transform to task document using adapter
        const { task: taskData, subtasks: subtasksData } =
          taskBreakdownAdapter.toTaskDocument(
            taskBreakdownSuggestion,
            columnId
          );

        // Create and save the main task
        const task = new Task({
          ...taskData,
          subtasks: [],
        });
        await task.save();

        // Create and save subtasks
        for (const subtaskData of subtasksData) {
          const subtask = new Subtask({
            ...subtaskData,
            taskId: task._id,
          });
          await subtask.save();

          // Add subtask to task's subtasks array
          task.subtasks.push(subtask._id);
        }

        // Save the task with subtasks references
        await task.save();

        // Add task to column
        const column = await Column.findById(columnId);
        if (column) {
          column.tasks.push(task._id);
          await column.save();
        }
      } else if (suggestion.type === 'task-improvement') {
        // Process task improvement suggestion
        const taskImprovementSuggestion =
          suggestion.content as TaskImprovementSuggestion;

        // Check if we have a task ID in the metadata
        if (!suggestion.metadata?.taskId) {
          // If there's no taskId in metadata, check if this is a batch suggestion
          if (suggestion.metadata?.isBatchSuggestion) {
            console.log(
              `Processing batch suggestion ${suggestion._id} as part of batch ${suggestion.metadata.batchId}`
            );
            // Continue with acceptance without trying to update a task
            // This is valid for batch suggestions when accepting individually
          } else {
            console.log(
              'No task ID found in metadata, treating as a generic task improvement without a specific task to update'
            );
            // Just acknowledge that the suggestion was accepted without trying to update a task
            // This allows the user to manually create a new task with the improvements
          }
        } else {
          // If we have a task ID, proceed with updating the existing task
          const taskId = toObjectId(suggestion.metadata.taskId);
          const task = await Task.findById(taskId);

          if (!task) {
            throw new Error(`Task with ID ${taskId} not found`);
          }

          // Update the task with improved content
          task.title = taskImprovementSuggestion.improvedTask.title;
          task.description =
            taskImprovementSuggestion.improvedTask.description || '';

          await task.save();

          console.log(
            `Successfully updated task ${taskId} with improved content`
          );
        }
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

  /**
   * Create multiple task improvement suggestions in a batch
   * @param userId User ID
   * @param sessionId Chat session ID
   * @param improvements Array of task IDs and their improvement suggestions
   * @param originalMessage Original user message that triggered the improvements
   * @returns Array of created suggestion documents
   */
  async createBatchTaskImprovementSuggestions(
    userId: string | Types.ObjectId,
    sessionId: string | Types.ObjectId,
    improvements: Array<{
      taskId: string | Types.ObjectId;
      content: TaskImprovementSuggestion;
    }>,
    originalMessage: string
  ): Promise<SuggestionDocument[]> {
    // Create a batch ID to group these suggestions
    const batchId = new Types.ObjectId().toString();

    // Create all suggestions with batch metadata
    const suggestions: SuggestionDocument[] = [];

    for (const { taskId, content } of improvements) {
      const suggestion = new Suggestion({
        userId: toObjectId(userId),
        sessionId: toObjectId(sessionId),
        type: 'task-improvement',
        status: SuggestionStatus.PENDING,
        content,
        originalMessage,
        metadata: {
          taskId: taskId.toString(),
          isBatchSuggestion: true,
          batchId,
        },
      });

      await suggestion.save();
      suggestions.push(suggestion as SuggestionDocument);
    }

    return suggestions;
  }

  /**
   * Accept multiple suggestions in a batch
   * @param suggestionIds Array of suggestion IDs to accept
   * @param messageContent Optional message to add to chat
   * @returns Object containing succeeded and failed suggestions
   */
  async acceptBatchSuggestions(
    suggestionIds: (string | Types.ObjectId)[],
    messageContent?: string
  ): Promise<{
    succeeded: SuggestionDocument[];
    failed: { id: string; error: string }[];
  }> {
    const results = {
      succeeded: [] as SuggestionDocument[],
      failed: [] as { id: string; error: string }[],
    };

    // Process each suggestion
    for (const suggestionId of suggestionIds) {
      try {
        const suggestion = await this.acceptSuggestion(
          suggestionId,
          messageContent
        );
        if (suggestion) {
          results.succeeded.push(suggestion);
        } else {
          results.failed.push({
            id: suggestionId.toString(),
            error: 'Suggestion not found',
          });
        }
      } catch (error) {
        results.failed.push({
          id: suggestionId.toString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Get all suggestions belonging to the same batch
   * @param batchId Batch ID
   * @returns Array of suggestions in the batch
   */
  async getSuggestionsByBatch(batchId: string): Promise<SuggestionDocument[]> {
    return Suggestion.find({
      'metadata.batchId': batchId,
    }).sort({ createdAt: -1 }) as Promise<SuggestionDocument[]>;
  }
}

export const suggestionService = new SuggestionService();
