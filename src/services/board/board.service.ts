import { Types } from 'mongoose';
import Board from '../../models/board.model';
import Column from '../../models/column.model';
import Task from '../../models/task.model';
import { BoardSuggestion } from '../../models/suggestion.model';
import {
  BoardDocument,
  ColumnDocument,
  TaskDocument,
  toObjectId,
} from '../../types/mongoose';

class BoardService {
  /**
   * Create a board with columns and tasks from a suggestion
   */
  async createBoardFromSuggestion(
    userId: string | Types.ObjectId,
    boardSuggestion: BoardSuggestion
  ): Promise<{
    board: BoardDocument;
    columns: ColumnDocument[];
    tasks: TaskDocument[];
  }> {
    // Convert userId to ObjectId if it's a string
    const userObjectId = toObjectId(userId);

    try {
      // 1. Create the board
      const board = new Board({
        name: boardSuggestion.boardName,
        ownerId: userObjectId,
        columns: [], // Will be populated with column IDs later
      });

      await board.save();

      // 2. Create columns
      const columns: ColumnDocument[] = [];
      const tasks: TaskDocument[] = [];

      for (let i = 0; i < boardSuggestion.columns.length; i++) {
        const columnData = boardSuggestion.columns[i];

        // Create column
        const column = new Column({
          name: columnData.name,
          boardId: board._id,
          tasks: [], // Will be populated with task IDs later
          position: i,
        });

        await column.save();
        columns.push(column);

        // Add column to board's columns array
        board.columns.push(column._id);

        // Create tasks for the column
        for (let j = 0; j < columnData.tasks.length; j++) {
          const taskData = columnData.tasks[j];

          const task = new Task({
            title: taskData.title,
            description: taskData.description || '',
            status: 'Todo',
            subtasks: [],
            columnId: column._id,
            position: j,
          });

          await task.save();
          tasks.push(task);

          // Add task to column's tasks array
          column.tasks.push(task._id);
        }

        // Save column with tasks
        await column.save();
      }

      // Save board with columns
      await board.save();

      return { board, columns, tasks };
    } catch (error) {
      console.error('Error creating board from suggestion:', error);
      throw error;
    }
  }

  /**
   * Get a board by ID
   */
  async getBoardById(
    boardId: string | Types.ObjectId
  ): Promise<BoardDocument | null> {
    const id = toObjectId(boardId);
    return Board.findById(id).populate({
      path: 'columns',
      populate: {
        path: 'tasks',
      },
    });
  }
}

export const boardService = new BoardService();
