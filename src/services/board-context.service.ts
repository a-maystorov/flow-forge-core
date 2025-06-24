import mongoose, { Types } from 'mongoose';
import Board from '../models/board.model';
import Chat from '../models/chat.model';
import Column from '../models/column.model';
import Subtask from '../models/subtask.model';
import Task from '../models/task.model';
import { BoardContext, PreviewSubtask, PreviewTask } from '../types/ai.types';

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
   * Populates a board context from an existing board
   * @param boardId - The ID of the board to get context from
   * @returns A populated BoardContext object
   */
  static async populateBoardContextFromBoard(
    boardId: string | mongoose.Types.ObjectId
  ): Promise<BoardContext> {
    const boardObjectId =
      typeof boardId === 'string'
        ? new mongoose.Types.ObjectId(boardId)
        : boardId;

    const board = await Board.findById(boardObjectId).lean();

    if (!board) {
      throw new Error('Board not found');
    }

    const columns = await Column.find({ boardId: boardObjectId })
      .sort('position')
      .lean();

    const boardContext: BoardContext = {
      name: board.name,
      description: '',
      columns: [],
    };

    const columnIds = columns.map((col) => col._id);

    const allTasks = await Task.find({ columnId: { $in: columnIds } })
      .sort('position')
      .lean();

    const tasksByColumnId = allTasks.reduce(
      (acc, task) => {
        const columnId = task.columnId.toString();
        if (!acc[columnId]) {
          acc[columnId] = [];
        }
        acc[columnId].push(task);
        return acc;
      },
      {} as Record<string, (typeof allTasks)[0][]>
    );

    const taskIds = allTasks.map((task) => task._id);
    const allSubtasks = await Subtask.find({ taskId: { $in: taskIds } }).lean();

    const subtasksByTaskId = allSubtasks.reduce(
      (acc, subtask) => {
        const taskId = subtask.taskId.toString();
        if (!acc[taskId]) {
          acc[taskId] = [];
        }
        acc[taskId].push(subtask);
        return acc;
      },
      {} as Record<string, (typeof allSubtasks)[0][]>
    );

    for (const column of columns) {
      const columnId = column._id.toString();
      const columnTasks = tasksByColumnId[columnId] || [];

      const previewTasks: PreviewTask[] = columnTasks.map((task) => {
        const taskId = task._id.toString();
        const taskSubtasks = subtasksByTaskId[taskId] || [];

        const previewSubtasks: PreviewSubtask[] = taskSubtasks.map(
          (subtask) => ({
            title: subtask.title,
            description: subtask.description || '',
            _id: subtask._id.toString(),
          })
        );

        return {
          title: task.title,
          description: task.description || '',
          subtasks: previewSubtasks,
          _id: taskId,
        };
      });

      boardContext.columns.push({
        name: column.name,
        tasks: previewTasks,
      });
    }

    return boardContext;
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
