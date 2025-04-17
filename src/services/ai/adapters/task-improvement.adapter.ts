/**
 * Adapter to transform AI task improvement responses into application model objects
 */

import { TaskImprovementSuggestion } from '../../../models/suggestion.model';
import { TaskImprovement } from '../templates/task-improvement.template';

/**
 * Adapter for task improvement suggestions
 */
export class TaskImprovementAdapter {
  /**
   * Transform an AI task improvement response into a suggestion model
   *
   * @param taskImprovement The AI task improvement response
   * @returns Task improvement matching the database model
   */
  toSuggestionModel(
    taskImprovement: TaskImprovement
  ): TaskImprovementSuggestion {
    return {
      title: taskImprovement.title,
      description: taskImprovement.description,
    };
  }
}

// Export singleton instance
export const taskImprovementAdapter = new TaskImprovementAdapter();
