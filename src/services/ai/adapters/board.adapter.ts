/**
 * Adapter to transform AI board suggestion responses into suggestion model objects
 */

import {
  BaseTask,
  BoardSuggestion as SuggestionBoardType,
} from '../../../models/suggestion.model';
import { BoardSuggestion } from '../templates/board-suggestion.template';

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
}

// Export singleton instance
export const boardAdapter = new BoardAdapter();
