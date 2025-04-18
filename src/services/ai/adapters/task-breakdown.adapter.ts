/**
 * Adapter to transform AI task breakdown responses into suggestion model objects
 */

import { Types } from 'mongoose';
import {
  BaseSubtask,
  TaskBreakdownSuggestion,
} from '../../../models/suggestion.model';
import {
  SubtaskDocument,
  TaskDocument,
  toObjectId,
} from '../../../types/mongoose';
import { TaskBreakdown } from '../templates/task-breakdown.template';

/**
 * Adapter for task breakdown suggestions
 */
export class TaskBreakdownAdapter {
  /**
   * Transform an AI task breakdown into a suggestion model
   *
   * @param taskBreakdown The AI task breakdown response
   * @returns Task breakdown suggestion matching the database model
   */
  toSuggestionModel(taskBreakdown: TaskBreakdown): TaskBreakdownSuggestion {
    return {
      taskTitle: taskBreakdown.task.title,
      taskDescription: taskBreakdown.task.description,
      subtasks: taskBreakdown.subtasks.map((subtask) => ({
        id: new Types.ObjectId().toString(),
        title: subtask.title,
        description: subtask.description,
        completed: subtask.completed || false,
      })) as BaseSubtask[],
    };
  }

  /**
   * Transform a task breakdown into database documents
   *
   * @param taskBreakdown The task breakdown to transform
   * @param columnId The column ID to associate the task with
   * @returns Database-ready documents for task creation
   */
  toTaskDocument(
    taskBreakdown: TaskBreakdownSuggestion,
    columnId: string | Types.ObjectId
  ): {
    task: Partial<TaskDocument>;
    subtasks: Partial<SubtaskDocument>[];
  } {
    const taskId = new Types.ObjectId();
    const task: Partial<TaskDocument> = {
      _id: taskId,
      title: taskBreakdown.taskTitle,
      description: taskBreakdown.taskDescription,
      status: 'Todo',
      columnId: toObjectId(columnId),
      position: 0,
    };

    // Create subtasks with explicit references to parent task
    const subtasks: Partial<SubtaskDocument>[] = taskBreakdown.subtasks.map(
      (subtask) => {
        const subtaskId = new Types.ObjectId();
        return {
          _id: subtaskId,
          title: subtask.title,
          description: subtask.description || '',
          completed: subtask.completed || false,
          taskId: toObjectId(taskId),
        };
      }
    );

    return {
      task,
      subtasks,
    };
  }
}

// Export singleton instance
export const taskBreakdownAdapter = new TaskBreakdownAdapter();
