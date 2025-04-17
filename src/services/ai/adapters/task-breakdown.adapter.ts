/**
 * Adapter to transform AI task breakdown responses into application model objects
 */

import {
  BaseSubtask,
  TaskBreakdownSuggestion,
} from '../../../models/suggestion.model';
import { TaskBreakdown } from '../templates/task-breakdown.template';

/**
 * Adapter for task breakdown suggestions
 */
export class TaskBreakdownAdapter {
  /**
   * Transform an AI task breakdown response into a suggestion model
   *
   * @param taskBreakdown The AI task breakdown response
   * @returns Task breakdown matching the database model
   */
  toSuggestionModel(taskBreakdown: TaskBreakdown): TaskBreakdownSuggestion {
    return {
      taskTitle: taskBreakdown.task.title,
      taskDescription: taskBreakdown.task.description,
      subtasks: taskBreakdown.subtasks.map((subtask) => ({
        title: subtask.title,
        description: subtask.description,
        completed: subtask.completed || false,
      })) as BaseSubtask[],
    };
  }
}

// Export singleton instance
export const taskBreakdownAdapter = new TaskBreakdownAdapter();
