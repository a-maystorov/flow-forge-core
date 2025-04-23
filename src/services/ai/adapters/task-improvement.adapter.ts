/**
 * Adapter to transform AI task improvement responses into suggestion model objects
 */

import { Types } from 'mongoose';
import { TaskImprovementSuggestion } from '../../../models/suggestion.model';
import { TaskDocument, toObjectId } from '../../../types/mongoose';
import { TaskImprovementSuggestion as AITaskImprovementSuggestion } from '../assistant.service';

/**
 * Adapter for task improvement suggestions
 */
export class TaskImprovementAdapter {
  /**
   * Transform an AI task improvement into a suggestion model
   *
   * @param taskImprovement The AI task improvement response
   * @param originalTitle Optional original task title
   * @param originalDescription Optional original task description
   * @returns Task improvement suggestion matching the database model
   */
  toSuggestionModel(
    taskImprovement: AITaskImprovementSuggestion,
    originalTitle?: string,
    originalDescription?: string
  ): TaskImprovementSuggestion {
    return {
      originalTask: {
        title: originalTitle || 'Original Task',
        description: originalDescription || '',
      },
      improvedTask: {
        title: taskImprovement.title,
        description: taskImprovement.description,
      },
      thoughtProcess:
        taskImprovement.thoughtProcess ||
        'Analysis of the original task to make it clearer and more actionable.',
      reasoning:
        'AI-generated improvement to make the task clearer and more actionable.',
    };
  }

  /**
   * Transform a task improvement into a task update
   *
   * @param taskImprovement The task improvement to transform
   * @param taskId The ID of the task to update
   * @param columnId The column ID of the task
   * @returns Database-ready document for task update
   */
  toTaskDocument(
    taskImprovement: TaskImprovementSuggestion,
    taskId: string | Types.ObjectId,
    columnId: string | Types.ObjectId
  ): Partial<TaskDocument> {
    // Create a task document with the improvements
    return {
      _id: toObjectId(taskId),
      title: taskImprovement.improvedTask.title,
      description: taskImprovement.improvedTask.description,
      columnId: toObjectId(columnId),
    };
  }
}

// Export singleton instance
export const taskImprovementAdapter = new TaskImprovementAdapter();
