import { Types } from 'mongoose';
import Board from '../../models/board.model';
import Column from '../../models/column.model';
import {
  BoardEntity,
  ColumnEntity,
  ColumnMetadata,
  EntityType,
  IPreview,
  SubtaskEntity,
  TaskEntity,
} from '../../models/preview.model';
import Subtask from '../../models/subtask.model';
import Task from '../../models/task.model';
import { DiffResult, generateDiff } from '../../utils/diff.utils';
import { PreviewService } from '../preview.service';

// Define types for AI-generated plan data using existing model interfaces
type BoardPlanData = {
  title?: string;
  name?: string;
  description?: string;
  columns?: ColumnPlanData[];
};

type ColumnPlanData = {
  title?: string;
  name?: string;
  description?: string;
  position?: number;
  tasks?: TaskPlanData[];
};

type TaskPlanData = {
  title?: string;
  name?: string;
  description?: string;
  status?: string;
  position?: number;
  subtasks?: SubtaskPlanData[];
};

type SubtaskPlanData = {
  title?: string;
  name?: string;
  description?: string;
  completed?: boolean;
};

export class EntityMapperService {
  private previewService: PreviewService;

  constructor() {
    this.previewService = new PreviewService();
  }

  /**
   * Create a board preview from AI-generated plan
   * @param planData - AI-generated board plan
   * @param userId - User ID requesting the plan
   * @returns Preview of the board to be created
   */
  async createBoardPreviewFromPlan(
    planData: BoardPlanData,
    userId: Types.ObjectId
  ) {
    console.log(
      'Creating board preview from plan data:',
      JSON.stringify(planData, null, 2)
    );

    // Create a clean board entity from the plan data
    const boardEntity: BoardEntity = {
      name: planData.title || planData.name || 'New Project', // Handle both title and name fields
      ownerId: userId,
      columns: [], // Initialize with empty array as board.columns should be ObjectIds
    };

    // Create preview entity
    const preview = await this.previewService.createPreview(
      userId,
      'create',
      'board',
      boardEntity
    );

    // Store column information in the preview's metadata
    // This will be used when the preview is approved to create the actual columns
    if (Array.isArray(planData.columns)) {
      const columnMetadata: ColumnMetadata[] = planData.columns.map(
        (col, index) => ({
          name: col.title || col.name || `Column ${index + 1}`,
          description: col.description || '',
          position: col.position || index,
          tasks: [], // Initialize with empty tasks that can be populated later
        })
      );

      // If the preview already has metadata, extend it
      const existingMetadata = preview.metadata || {};
      preview.metadata = {
        ...existingMetadata,
        columns: columnMetadata,
      };

      await preview.save();

      console.log(
        'Updated preview with column metadata:',
        JSON.stringify(preview.metadata, null, 2)
      );
    }

    return preview;
  }

  /**
   * Create board with columns and tasks from AI plan
   * @param planData - AI-generated plan data
   * @param userId - User ID creating the board
   * @returns The created board with populated columns and tasks
   */
  async createBoardFromPlan(planData: BoardPlanData, userId: Types.ObjectId) {
    try {
      // Create the board
      const board = new Board({
        name: planData.name || planData.title,
        ownerId: userId,
        description: planData.description || '',
        columns: [],
      });
      await board.save();

      // Create columns
      const columnIds: Types.ObjectId[] = [];

      if (planData.columns && Array.isArray(planData.columns)) {
        for (const columnData of planData.columns) {
          const column = new Column({
            name: columnData.name || columnData.title,
            boardId: board._id,
            position: columnData.position || 0,
            tasks: [],
          });
          await column.save();
          columnIds.push(column._id);

          // Create tasks for this column
          const taskIds: Types.ObjectId[] = [];

          if (columnData.tasks && Array.isArray(columnData.tasks)) {
            for (const taskData of columnData.tasks) {
              const task = new Task({
                title: taskData.title || taskData.name,
                description: taskData.description || '',
                status: taskData.status || 'Todo',
                columnId: column._id,
                position: taskData.position || 0,
                subtasks: [],
              });
              await task.save();
              taskIds.push(task._id);

              // Create subtasks for this task
              const subtaskIds: Types.ObjectId[] = [];

              if (taskData.subtasks && Array.isArray(taskData.subtasks)) {
                for (const subtaskData of taskData.subtasks) {
                  const subtask = new Subtask({
                    title: subtaskData.title || subtaskData.name,
                    description: subtaskData.description || '',
                    completed: subtaskData.completed || false,
                    taskId: task._id,
                  });
                  await subtask.save();
                  subtaskIds.push(subtask._id);
                }
              }

              // Update task with subtasks
              await Task.findByIdAndUpdate(task._id, {
                subtasks: subtaskIds,
              });
            }
          }

          // Update column with tasks
          await Column.findByIdAndUpdate(column._id, {
            tasks: taskIds,
          });
        }
      }

      // Update board with columns
      await Board.findByIdAndUpdate(board._id, {
        columns: columnIds,
      });

      // Return the fully populated board
      return Board.findById(board._id).populate({
        path: 'columns',
        populate: {
          path: 'tasks',
          populate: {
            path: 'subtasks',
          },
        },
      });
    } catch (error) {
      console.error('Error creating entities from plan:', error);
      throw error;
    }
  }

  /**
   * Create a preview for updating a task
   * @param taskId - ID of the task to update
   * @param updatedData - Updated task data
   * @param userId - User ID making the update
   * @returns Preview of the task update
   */
  async createTaskUpdatePreview(
    taskId: string | Types.ObjectId,
    updatedData: Partial<TaskEntity>,
    userId: string | Types.ObjectId
  ) {
    try {
      // Fetch the original task with subtasks
      const originalTask = await Task.findById(taskId).populate('subtasks');

      if (!originalTask) {
        throw new Error('Task not found');
      }

      // Create modified task entity
      const proposedEntity: TaskEntity = {
        ...originalTask.toObject(),
        ...updatedData,
      };

      // Create preview
      return this.previewService.createPreview(
        userId,
        'update',
        'task',
        proposedEntity,
        originalTask.toObject()
      );
    } catch (error) {
      console.error('Error creating task update preview:', error);
      throw error;
    }
  }

  /**
   * Create a preview for updating a board
   * @param boardId - ID of the board to update
   * @param updatedData - Updated board data
   * @param userId - User ID making the update
   * @returns Preview of the board update
   */
  async createBoardUpdatePreview(
    boardId: string | Types.ObjectId,
    updatedData: Partial<BoardEntity>,
    userId: Types.ObjectId
  ) {
    try {
      // Fetch the original board
      const originalBoard = await Board.findById(boardId);

      if (!originalBoard) {
        throw new Error('Board not found');
      }

      // Create modified board entity
      const proposedEntity: BoardEntity = {
        ...originalBoard.toObject(),
        ...updatedData,
      };

      // Create preview
      return this.previewService.createPreview(
        userId,
        'update',
        'board',
        proposedEntity,
        originalBoard.toObject()
      );
    } catch (error) {
      console.error('Error creating board update preview:', error);
      throw error;
    }
  }

  /**
   * Create a preview for updating a column
   * @param columnId - ID of the column to update
   * @param updatedData - Updated column data
   * @param userId - User ID making the update
   * @returns Preview of the column update
   */
  async createColumnUpdatePreview(
    columnId: string | Types.ObjectId,
    updatedData: Partial<ColumnEntity>,
    userId: Types.ObjectId
  ) {
    try {
      // Fetch the original column
      const originalColumn = await Column.findById(columnId);

      if (!originalColumn) {
        throw new Error('Column not found');
      }

      // Create modified column entity
      const proposedEntity: ColumnEntity = {
        ...originalColumn.toObject(),
        ...updatedData,
      };

      // Create preview
      return this.previewService.createPreview(
        userId,
        'update',
        'column',
        proposedEntity,
        originalColumn.toObject()
      );
    } catch (error) {
      console.error('Error creating column update preview:', error);
      throw error;
    }
  }

  /**
   * Apply a preview to create or update an entity
   * @param previewId - ID of the preview to apply
   * @returns Created/updated entity
   */
  async applyPreview(previewId: string | Types.ObjectId) {
    try {
      // For the first step, we don't need to specify userId
      // The PreviewService will handle the status check
      const preview = await this.previewService.getPreviewById(previewId, null);

      if (!preview) {
        throw new Error('Preview not found');
      }

      if (preview.status !== 'approved') {
        throw new Error('Preview is not approved');
      }

      // Handle different entity types and operations
      switch (preview.operation) {
        case 'create':
          return this.createEntityFromPreview(preview);
        case 'update':
          return this.updateEntityFromPreview(preview);
        case 'delete':
          return this.deleteEntityFromPreview(preview);
        default:
          throw new Error(`Unsupported operation: ${preview.operation}`);
      }
    } catch (error) {
      console.error('Error applying preview:', error);
      throw error;
    }
  }

  /**
   * Create an entity from a preview
   * @param preview - Preview with entity data
   * @returns Created entity
   */
  private async createEntityFromPreview(
    preview: Pick<IPreview, 'entityType' | 'proposedEntity' | 'metadata'>
  ) {
    switch (preview.entityType) {
      case 'board':
        // Create the board first
        const boardData = preview.proposedEntity as BoardEntity;
        const board = new Board(boardData);
        await board.save();

        // If metadata contains column information, create those columns
        if (
          preview.metadata?.columns &&
          Array.isArray(preview.metadata.columns)
        ) {
          const columnIds: Types.ObjectId[] = [];

          // Process each column from metadata
          for (const columnData of preview.metadata.columns) {
            const column = new Column({
              name: columnData.name,
              description: columnData.description || '',
              boardId: board._id,
              position: columnData.position || 0,
              tasks: [],
            });
            await column.save();
            columnIds.push(column._id);

            // Create tasks if they exist in the metadata
            if (columnData.tasks && Array.isArray(columnData.tasks)) {
              const taskIds: Types.ObjectId[] = [];

              for (const taskData of columnData.tasks) {
                const task = new Task({
                  title: taskData.title || taskData.name,
                  description: taskData.description || '',
                  status: taskData.status || 'Todo',
                  columnId: column._id,
                  position: taskData.position || 0,
                  subtasks: [],
                });
                await task.save();
                taskIds.push(task._id);

                // Process subtasks if they exist
                if (taskData.subtasks && Array.isArray(taskData.subtasks)) {
                  const subtaskIds: Types.ObjectId[] = [];

                  for (const subtaskData of taskData.subtasks) {
                    const subtask = new Subtask({
                      title: subtaskData.title || subtaskData.name,
                      description: subtaskData.description || '',
                      completed: subtaskData.completed || false,
                      taskId: task._id,
                    });
                    await subtask.save();
                    subtaskIds.push(subtask._id);
                  }

                  // Update task with subtasks
                  if (subtaskIds.length > 0) {
                    await Task.findByIdAndUpdate(task._id, {
                      subtasks: subtaskIds,
                    });
                  }
                }
              }

              // Update column with tasks
              if (taskIds.length > 0) {
                await Column.findByIdAndUpdate(column._id, {
                  tasks: taskIds,
                });
              }
            }
          }

          // Update board with columns
          if (columnIds.length > 0) {
            await Board.findByIdAndUpdate(board._id, {
              columns: columnIds,
            });
          }

          // Return the fully populated board
          return Board.findById(board._id).populate({
            path: 'columns',
            populate: {
              path: 'tasks',
              populate: {
                path: 'subtasks',
              },
            },
          });
        }

        return board;

      case 'column':
        const column = new Column(preview.proposedEntity as ColumnEntity);
        await column.save();
        return column;

      case 'task':
        const task = new Task(preview.proposedEntity as TaskEntity);
        await task.save();
        return task;

      case 'subtask':
        const subtask = new Subtask(preview.proposedEntity as SubtaskEntity);
        await subtask.save();
        return subtask;

      default:
        throw new Error(`Unsupported entity type: ${preview.entityType}`);
    }
  }

  /**
   * Update an entity from a preview
   * @param preview - Preview with entity data
   * @returns Updated entity
   */
  private async updateEntityFromPreview(
    preview: Pick<IPreview, 'entityType' | 'proposedEntity' | 'metadata'>
  ) {
    const { entityType, proposedEntity } = preview;
    const entityId = proposedEntity._id;

    // Create a new object without the _id property
    const { _id, ...updateData } = proposedEntity;

    switch (entityType) {
      case 'board':
        return await Board.findByIdAndUpdate(entityId, updateData, {
          new: true,
        });

      case 'column':
        return await Column.findByIdAndUpdate(entityId, updateData, {
          new: true,
        });

      case 'task':
        return await Task.findByIdAndUpdate(entityId, updateData, {
          new: true,
        });

      case 'subtask':
        return await Subtask.findByIdAndUpdate(entityId, updateData, {
          new: true,
        });

      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  }

  /**
   * Delete an entity from a preview
   * @param preview - Preview with entity data
   * @returns Deleted entity ID
   */
  private async deleteEntityFromPreview(
    preview: Pick<IPreview, 'entityType' | 'proposedEntity' | 'metadata'>
  ) {
    const { entityType, proposedEntity } = preview;
    const entityId = proposedEntity._id;

    switch (entityType) {
      case 'board':
        await Board.findByIdAndDelete(entityId);
        break;

      case 'column':
        await Column.findByIdAndDelete(entityId);
        break;

      case 'task':
        await Task.findByIdAndDelete(entityId);
        break;

      case 'subtask':
        await Subtask.findByIdAndDelete(entityId);
        break;

      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }

    return entityId;
  }

  /**
   * Generate diff between original and proposed entity
   * @param original - Original entity data
   * @param proposed - Proposed entity data
   * @returns Object with added, modified, and removed fields
   */
  generateDiff(original: EntityType, proposed: EntityType): DiffResult {
    return generateDiff(original, proposed);
  }
}
