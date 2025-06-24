import mongoose, { Types } from 'mongoose';
import Board from '../models/board.model';
import Column from '../models/column.model';
import Subtask, { ISubtask } from '../models/subtask.model';
import Task, { ITask } from '../models/task.model';
import { BoardContext } from '../types/ai.types';

/**
 * Type for safely creating tasks in the database
 */
type TaskCreate = Pick<
  ITask,
  'title' | 'description' | 'columnId' | 'position'
> & {
  boardId: Types.ObjectId;
  order: number;
  status?: 'Todo' | 'Doing' | 'Done';
};

/**
 * Type for safely creating subtasks in the database∏
 */
type SubtaskCreate = Pick<ISubtask, 'title' | 'description' | 'taskId'> & {
  boardId: Types.ObjectId;
  order: number;
  completed?: boolean;
};

class BoardService {
  /**
   * Sanitize board context by removing all _id fields
   * This prevents confusion with AI-generated IDs that aren't real MongoDB IDs
   * @param context The board context to sanitize
   * @returns Sanitized board context without _id fields
   */
  private static sanitizeBoardContext(context: BoardContext): BoardContext {
    if (!context) {
      throw new Error('Board context is undefined or null');
    }

    const sanitized = JSON.parse(JSON.stringify(context)) as BoardContext;

    if (sanitized.columns) {
      sanitized.columns = sanitized.columns.map((column) => {
        const { _id, ...columnWithoutId } = column;

        if (column.tasks) {
          columnWithoutId.tasks = column.tasks.map((task) => {
            const { _id, ...taskWithoutId } = task;

            if (task.subtasks) {
              taskWithoutId.subtasks = task.subtasks.map((subtask) => {
                const { _id, ...subtaskWithoutId } = subtask;
                return subtaskWithoutId;
              });
            }

            return taskWithoutId;
          });
        }

        return columnWithoutId;
      });
    }

    return sanitized;
  }

  /**
   * Create a new board from board context object
   * @param boardContext The board context object from chat
   * @param userId The ID of the user creating the board
   * @param chatId Optional chat ID to link the board to a chat
   * @returns The newly created board with populated columns, tasks and subtasks
   */
  static async createBoardFromContext(
    boardContext: BoardContext,
    userId: string | Types.ObjectId,
    chatId?: string | Types.ObjectId
  ) {
    try {
      const sanitizedContext = this.sanitizeBoardContext(boardContext);

      const userIdObj =
        typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
      const newBoard = await Board.create({
        name: sanitizedContext.name || 'New Board',
        ownerId: userIdObj,
      });

      const boardId = newBoard._id;

      if (chatId) {
        const chatIdObj =
          typeof chatId === 'string' ? new Types.ObjectId(chatId) : chatId;

        await mongoose.model('Chat').findByIdAndUpdate(chatIdObj, {
          boardId: boardId,
        });
      }

      if (!sanitizedContext.columns || sanitizedContext.columns.length === 0) {
        return newBoard;
      }
      const columnMap = new Map<number, Types.ObjectId>();
      for (
        let columnIndex = 0;
        columnIndex < sanitizedContext.columns.length;
        columnIndex++
      ) {
        const column = sanitizedContext.columns[columnIndex];

        const newColumn = await Column.create({
          name: column.name,
          boardId: boardId,
          position:
            column.position !== undefined ? column.position : columnIndex,
          order: columnIndex,
          tasks: [],
        });

        columnMap.set(columnIndex, newColumn._id);
      }

      const columnIds = Array.from(columnMap.values());
      await Board.findByIdAndUpdate(boardId, { columns: columnIds });

      const taskMap = new Map<string, Types.ObjectId>();

      for (
        let columnIndex = 0;
        columnIndex < sanitizedContext.columns.length;
        columnIndex++
      ) {
        const columnContext = sanitizedContext.columns[columnIndex];
        const columnId = columnMap.get(columnIndex);

        if (
          !columnContext.tasks ||
          columnContext.tasks.length === 0 ||
          !columnId
        ) {
          continue;
        }

        const taskIds: Types.ObjectId[] = [];

        for (
          let taskIndex = 0;
          taskIndex < columnContext.tasks.length;
          taskIndex++
        ) {
          const task = columnContext.tasks[taskIndex];

          const taskData: TaskCreate = {
            title: task.title,
            description: task.description || '',
            columnId: columnId,
            boardId: boardId,
            position: task.position !== undefined ? task.position : taskIndex,
            order: taskIndex,
            status: 'Todo',
          };

          const newTask = await Task.create(taskData);

          const taskKey = `${columnIndex}_${taskIndex}`;
          taskMap.set(taskKey, newTask._id);
          taskIds.push(newTask._id);
        }
        await Column.findByIdAndUpdate(columnId, { tasks: taskIds });
      }

      for (
        let columnIndex = 0;
        columnIndex < sanitizedContext.columns.length;
        columnIndex++
      ) {
        const columnContext = sanitizedContext.columns[columnIndex];

        if (!columnContext.tasks || columnContext.tasks.length === 0) {
          continue;
        }

        for (
          let taskIndex = 0;
          taskIndex < columnContext.tasks.length;
          taskIndex++
        ) {
          const taskContext = columnContext.tasks[taskIndex];
          const taskKey = `${columnIndex}_${taskIndex}`;
          const taskId = taskMap.get(taskKey);

          if (
            !taskContext.subtasks ||
            taskContext.subtasks.length === 0 ||
            !taskId
          ) {
            continue;
          }

          const subtaskIds: Types.ObjectId[] = [];

          for (
            let subtaskIndex = 0;
            subtaskIndex < taskContext.subtasks.length;
            subtaskIndex++
          ) {
            const subtask = taskContext.subtasks[subtaskIndex];

            const subtaskData: SubtaskCreate = {
              title: subtask.title,
              description: subtask.description || '',
              taskId: taskId,
              boardId: boardId,
              order: subtaskIndex,
              completed: false,
            };

            const newSubtask = await Subtask.create(subtaskData);
            subtaskIds.push(newSubtask._id);
          }

          await Task.findByIdAndUpdate(taskId, { subtasks: subtaskIds });
        }
      }
      const populatedBoard = await Board.findById(boardId).populate({
        path: 'columns',
        options: { sort: { order: 1 } },
        populate: {
          path: 'tasks',
          options: { sort: { order: 1 } },
          populate: {
            path: 'subtasks',
            options: { sort: { order: 1 } },
          },
        },
      });

      return populatedBoard;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update an existing board from board context
   * This method updates the board and all its nested entities while preventing duplication
   *
   * @param boardId The ID of the board to update
   * @param boardContext The board context with updated data
   * @param userId The user ID to ensure proper ownership
   * @returns The updated board populated with columns, tasks and subtasks
   */
  static async updateBoardFromContext(
    boardId: string | Types.ObjectId,
    boardContext: BoardContext,
    userId: string | Types.ObjectId
  ) {
    try {
      const sanitizedContext = this.sanitizeBoardContext(boardContext);

      const boardIdObj =
        typeof boardId === 'string' ? new Types.ObjectId(boardId) : boardId;

      const userIdObj =
        typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

      const existingBoard = await Board.findOne({
        _id: boardIdObj,
        ownerId: userIdObj,
      });

      if (!existingBoard) {
        throw new Error(
          `Board not found or you don't have permission to update it`
        );
      }

      if (sanitizedContext.name) {
        existingBoard.name = sanitizedContext.name;
      }

      await existingBoard.save();

      const existingColumns = await Column.find({ boardId: boardIdObj }).lean();
      const updatedColumnIds: Types.ObjectId[] = [];
      const columnMap = new Map<number, Types.ObjectId>();

      const contextColumnNames = sanitizedContext.columns
        ? sanitizedContext.columns.map((col) => col.name.toLowerCase())
        : [];
      if (sanitizedContext.columns) {
        for (
          let columnIndex = 0;
          columnIndex < sanitizedContext.columns.length;
          columnIndex++
        ) {
          const columnContext = sanitizedContext.columns[columnIndex];

          let matchingColumn = existingColumns.find(
            (column) =>
              column.name.toLowerCase() === columnContext.name.toLowerCase()
          );

          if (!matchingColumn) {
            const newColumn = await Column.create({
              name: columnContext.name,
              boardId: boardIdObj,
              position:
                columnContext.position !== undefined
                  ? columnContext.position
                  : columnIndex,
              tasks: [],
              order: columnIndex,
            });

            columnMap.set(columnIndex, newColumn._id);
            updatedColumnIds.push(newColumn._id);
          } else {
            const columnId = matchingColumn._id;
            await Column.findByIdAndUpdate(columnId, {
              position:
                columnContext.position !== undefined
                  ? columnContext.position
                  : columnIndex,
              order: columnIndex,
            });

            columnMap.set(columnIndex, columnId);
            updatedColumnIds.push(columnId);
          }
        }
      }

      for (const existingColumn of existingColumns) {
        if (!contextColumnNames.includes(existingColumn.name.toLowerCase())) {
          await Column.findByIdAndDelete(existingColumn._id);

          if (existingColumn.tasks && existingColumn.tasks.length > 0) {
            const tasksToDelete = await Task.find({
              columnId: existingColumn._id,
            });

            for (const task of tasksToDelete) {
              await Subtask.deleteMany({ taskId: task._id });
            }
            await Task.deleteMany({ columnId: existingColumn._id });
          }
        }
      }

      await Board.findByIdAndUpdate(boardIdObj, { columns: updatedColumnIds });

      const taskMap = new Map<string, Types.ObjectId>();

      if (sanitizedContext.columns) {
        for (
          let columnIndex = 0;
          columnIndex < sanitizedContext.columns.length;
          columnIndex++
        ) {
          const columnContext = sanitizedContext.columns[columnIndex];
          const columnId = columnMap.get(columnIndex);

          if (!columnId) {
            continue;
          }

          const existingTasks = await Task.find({ columnId }).lean();
          const updatedTaskIds: Types.ObjectId[] = [];

          const contextTaskTitles = columnContext.tasks
            ? columnContext.tasks.map((task) => task.title.toLowerCase())
            : [];

          if (columnContext.tasks && columnContext.tasks.length > 0) {
            for (
              let taskIndex = 0;
              taskIndex < columnContext.tasks.length;
              taskIndex++
            ) {
              const taskContext = columnContext.tasks[taskIndex];

              let matchingTask = existingTasks.find(
                (task) =>
                  task.title.toLowerCase() === taskContext.title.toLowerCase()
              );

              if (!matchingTask) {
                const taskData: TaskCreate = {
                  title: taskContext.title,
                  description: taskContext.description || '',
                  columnId: columnId,
                  boardId: boardIdObj,
                  position:
                    taskContext.position !== undefined
                      ? taskContext.position
                      : taskIndex,
                  order: taskIndex,
                  status: 'Todo',
                };

                const newTask = await Task.create(taskData);
                const taskKey = `${columnIndex}_${taskIndex}`;

                taskMap.set(taskKey, newTask._id);
                updatedTaskIds.push(newTask._id);
              } else {
                const taskId = matchingTask._id;
                await Task.findByIdAndUpdate(taskId, {
                  title: taskContext.title,
                  description:
                    taskContext.description || matchingTask.description,
                  position:
                    taskContext.position !== undefined
                      ? taskContext.position
                      : taskIndex,
                  order: taskIndex,
                });

                const taskKey = `${columnIndex}_${taskIndex}`;
                taskMap.set(taskKey, taskId);
                updatedTaskIds.push(taskId);
              }
            }
          }

          for (const existingTask of existingTasks) {
            if (!contextTaskTitles.includes(existingTask.title.toLowerCase())) {
              await Task.findByIdAndDelete(existingTask._id);

              await Subtask.deleteMany({ taskId: existingTask._id });
            }
          }

          await Column.findByIdAndUpdate(columnId, { tasks: updatedTaskIds });
        }
      }
      if (sanitizedContext.columns) {
        for (
          let columnIndex = 0;
          columnIndex < sanitizedContext.columns.length;
          columnIndex++
        ) {
          const columnContext = sanitizedContext.columns[columnIndex];

          if (!columnContext.tasks || columnContext.tasks.length === 0) {
            continue;
          }

          for (
            let taskIndex = 0;
            taskIndex < columnContext.tasks.length;
            taskIndex++
          ) {
            const taskContext = columnContext.tasks[taskIndex];
            const taskKey = `${columnIndex}_${taskIndex}`;
            const taskId = taskMap.get(taskKey);

            if (!taskId) {
              continue;
            }

            const existingSubtasks = await Subtask.find({ taskId }).lean();
            const updatedSubtaskIds: Types.ObjectId[] = [];

            const contextSubtaskTitles = taskContext.subtasks
              ? taskContext.subtasks.map((subtask) =>
                  subtask.title.toLowerCase()
                )
              : [];

            if (taskContext.subtasks && taskContext.subtasks.length > 0) {
              for (
                let subtaskIndex = 0;
                subtaskIndex < taskContext.subtasks.length;
                subtaskIndex++
              ) {
                const subtaskContext = taskContext.subtasks[subtaskIndex];

                let matchingSubtask = existingSubtasks.find(
                  (subtask) =>
                    subtask.title.toLowerCase() ===
                    subtaskContext.title.toLowerCase()
                );

                if (!matchingSubtask) {
                  const subtaskData: SubtaskCreate = {
                    title: subtaskContext.title,
                    description: subtaskContext.description || '',
                    taskId: taskId,
                    boardId: boardIdObj,
                    order: subtaskIndex,
                    completed: false,
                  };

                  const newSubtask = await Subtask.create(subtaskData);
                  updatedSubtaskIds.push(newSubtask._id);
                } else {
                  const subtaskId = matchingSubtask._id;
                  await Subtask.findByIdAndUpdate(subtaskId, {
                    title: subtaskContext.title,
                    description:
                      subtaskContext.description || matchingSubtask.description,
                    order: subtaskIndex,
                  });

                  updatedSubtaskIds.push(subtaskId);
                }
              }
            }

            for (const existingSubtask of existingSubtasks) {
              if (
                !contextSubtaskTitles.includes(
                  existingSubtask.title.toLowerCase()
                )
              ) {
                await Subtask.findByIdAndDelete(existingSubtask._id);
              }
            }
            await Task.findByIdAndUpdate(taskId, {
              subtasks: updatedSubtaskIds,
            });
          }
        }
      }
      const populatedBoard = await Board.findById(boardIdObj).populate({
        path: 'columns',
        options: { sort: { order: 1 } },
        populate: {
          path: 'tasks',
          options: { sort: { order: 1 } },
          populate: {
            path: 'subtasks',
            options: { sort: { order: 1 } },
          },
        },
      });

      return populatedBoard;
    } catch (error) {
      throw error;
    }
  }
}

export default BoardService;
