/**
 * Adapter to transform AI board suggestion responses into suggestion model objects
 */

import { Types } from 'mongoose';
import {
  BaseTask,
  BoardSuggestion as SuggestionBoardType,
} from '../../../models/suggestion.model';
import {
  BoardDocument,
  ColumnDocument,
  SubtaskDocument,
  TaskDocument,
  toObjectId,
} from '../../../types/mongoose';
import { BoardSuggestion } from '../templates/board-suggestion.template';

// Helper interface to represent the task in the template which might have subtasks
interface TaskWithSubtasks {
  title: string;
  description?: string;
  position?: number;
  subtasks?: {
    title: string;
    description?: string;
    completed?: boolean;
  }[];
}

/**
 * Adapter for board suggestions
 */
export class BoardAdapter {
  /**
   * Transform an AI board suggestion into a suggestion model
   *
   * @param boardSuggestion The AI board suggestion response
   * @returns Board suggestion matching the database model
   */
  toSuggestionModel(boardSuggestion: BoardSuggestion): SuggestionBoardType {
    return {
      boardName: boardSuggestion.boardName,
      thoughtProcess: boardSuggestion.thoughtProcess,
      columns: boardSuggestion.columns.map((column) => ({
        name: column.name,
        position: column.position,
        tasks: column.tasks.map((task) => ({
          title: task.title,
          description: task.description,
          position: task.position,
        })) as BaseTask[],
      })),
    };
  }

  /**
   * Transform a board suggestion into database documents
   *
   * @param boardSuggestion The board suggestion to transform
   * @param userId The user ID who owns the board
   * @returns Database-ready documents for board creation
   */
  toBoardDocument(
    boardSuggestion: SuggestionBoardType,
    userId: string | Types.ObjectId
  ): {
    board: Partial<BoardDocument>;
    columns: Partial<ColumnDocument>[];
    tasks: Partial<TaskDocument>[];
    subtasks: Partial<SubtaskDocument>[];
  } {
    // Create board object with a new ID
    const boardId = new Types.ObjectId();
    const board: Partial<BoardDocument> = {
      _id: boardId,
      name: boardSuggestion.boardName,
      ownerId: toObjectId(userId),
    };

    const columns: Partial<ColumnDocument>[] = [];
    const tasks: Partial<TaskDocument>[] = [];
    const subtasks: Partial<SubtaskDocument>[] = [];

    // Create columns and tasks
    boardSuggestion.columns.forEach((column, columnIndex) => {
      // Create column with a new ID
      const columnId = new Types.ObjectId();
      columns.push({
        _id: columnId,
        name: column.name,
        position: column.position || columnIndex,
        boardId: boardId,
      });

      // Create tasks for this column
      column.tasks.forEach((task, taskIndex) => {
        const taskId = new Types.ObjectId();

        // Create task with explicit references to parent column
        tasks.push({
          _id: taskId,
          title: task.title,
          description: task.description || '',
          status: 'Todo',
          position: task.position || taskIndex,
          columnId: columnId,
        });

        // Check if there are subtasks in the template structure
        // Cast to any to access potential subtasks property since BaseTask doesn't have it
        const taskWithSubtasks = task as unknown as TaskWithSubtasks;

        // Create subtasks if present
        if (taskWithSubtasks.subtasks && taskWithSubtasks.subtasks.length > 0) {
          taskWithSubtasks.subtasks.forEach((subtask) => {
            const subtaskId = new Types.ObjectId();

            // Add subtask with explicit reference to parent task
            subtasks.push({
              _id: subtaskId,
              title: subtask.title,
              description: subtask.description || '',
              completed: subtask.completed || false,
              taskId: taskId,
            });
          });
        }
      });
    });

    return {
      board,
      columns,
      tasks,
      subtasks,
    };
  }
}

// Export singleton instance
export const boardAdapter = new BoardAdapter();
