/**
 * Adapter to transform AI board suggestion responses into application model objects
 */

import { Types } from 'mongoose';
import {
  BoardDocument,
  ColumnDocument,
  TaskDocument,
  SubtaskDocument,
} from '../../../types/mongoose';
import { BoardSuggestion } from '../templates/board-suggestion.template';

/**
 * Adapter to transform AI board suggestion responses into application model objects
 */
export class BoardAdapter {
  /**
   * Transform an AI response into a board document with columns and tasks
   *
   * @param suggestion The AI board suggestion
   * @param ownerId Owner of the board
   * @returns Board document ready for database insertion
   */
  toBoardDocument(
    suggestion: BoardSuggestion,
    ownerId: string | Types.ObjectId
  ): {
    board: Partial<BoardDocument>;
    columns: Partial<ColumnDocument>[];
    tasks: Partial<TaskDocument>[];
    subtasks: Partial<SubtaskDocument>[];
  } {
    // Create board object
    const boardId = new Types.ObjectId();
    const board: Partial<BoardDocument> = {
      _id: boardId,
      name: suggestion.boardName,
      ownerId:
        typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId,
    };

    const columns: Partial<ColumnDocument>[] = [];
    const tasks: Partial<TaskDocument>[] = [];
    const subtasks: Partial<SubtaskDocument>[] = [];

    // Create columns and tasks
    suggestion.columns.forEach((column) => {
      // Create column
      const columnId = new Types.ObjectId();
      columns.push({
        _id: columnId,
        name: column.name,
        position: column.position,
        boardId: boardId,
      });

      // Create tasks for this column
      column.tasks.forEach((task) => {
        const taskId = new Types.ObjectId();

        // Create subtask documents first
        const subtaskIds: Types.ObjectId[] = task.subtasks.map((subtask) => {
          const subtaskId = new Types.ObjectId();

          // Add to subtasks array for bulk creation
          subtasks.push({
            _id: subtaskId,
            title: subtask.title,
            description: subtask.description,
            completed: subtask.completed || false,
            taskId: taskId,
          });

          return subtaskId;
        });

        // Add task with references to subtasks
        tasks.push({
          _id: taskId,
          title: task.title,
          description: task.description,
          position: task.position,
          columnId: columnId,
          subtasks: subtaskIds,
        });
      });
    });

    return { board, columns, tasks, subtasks };
  }
}

// Export singleton instance
export const boardAdapter = new BoardAdapter();
