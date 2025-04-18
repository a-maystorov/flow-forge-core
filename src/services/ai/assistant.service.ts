import { Types } from 'mongoose';
import { boardAdapter } from './adapters/board-adapter';
import { taskBreakdownAdapter } from './adapters/task-breakdown.adapter';
import { taskImprovementAdapter } from './adapters/task-improvement.adapter';
import { openAIService } from './openai.service';
import { BoardSuggestion, TaskBreakdown, TaskImprovement } from './templates';

// Ensure templates are registered
import './templates';

// Re-export interfaces for backward compatibility
export { BoardSuggestion } from './templates/board-suggestion.template';
export { TaskImprovement as TaskImprovementSuggestion } from './templates/task-improvement.template';

/**
 * Service for AI assistant functionality related to flow-forge boards
 */
export class AssistantService {
  /**
   * Generate board suggestions based on project description
   * @param projectDescription User's description of the project
   * @returns Suggested board structure with columns, tasks, and subtasks
   */
  async generateBoardSuggestion(
    projectDescription: string
  ): Promise<BoardSuggestion | null> {
    try {
      // Generate board suggestion using template
      const response =
        await openAIService.generateFromTemplate<BoardSuggestion>(
          'board-suggestion',
          { projectDescription },
          {
            temperature: 0.7,
            maxTokens: 2000,
          }
        );

      return response;
    } catch (error) {
      console.error('Error generating board suggestion:', error);
      return null;
    }
  }

  /**
   * Generate a board document with columns and tasks from a project description
   *
   * @param projectDescription Description of the project
   * @param ownerId ID of the user creating the board
   * @returns Board document with columns and tasks ready for database insertion
   */
  async generateBoardDocument(
    projectDescription: string,
    ownerId: string | Types.ObjectId
  ) {
    const suggestion = await this.generateBoardSuggestion(projectDescription);

    if (!suggestion) {
      throw new Error('Failed to generate board suggestion');
    }

    // Transform the AI response into application models
    return boardAdapter.toBoardDocument(suggestion, ownerId);
  }

  /**
   * Break down a task into subtasks
   * @param taskTitle Title of the task to break down
   * @param taskDescription Description of the task to break down
   * @returns Suggested subtasks
   */
  async generateTaskBreakdown(
    taskTitle: string,
    taskDescription?: string
  ): Promise<TaskBreakdown | null> {
    try {
      // Prepare variables based on what's provided
      const variables: Record<string, string> = {
        taskTitle,
      };

      if (taskDescription) {
        variables.taskDescription = taskDescription;
      }

      // Generate task breakdown using template
      const response = await openAIService.generateFromTemplate<TaskBreakdown>(
        'task-breakdown',
        variables,
        {
          temperature: 0.7,
          maxTokens: 1500,
        }
      );

      return response;
    } catch (error) {
      console.error('Error generating task breakdown:', error);
      return null;
    }
  }

  /**
   * Generate a task breakdown suggestion with database-friendly format
   *
   * @param taskTitle Title of the task to break down
   * @param taskDescription Description of the task to break down (optional)
   * @returns Task breakdown suggestion ready for database insertion
   */
  async generateTaskBreakdownSuggestion(
    taskTitle: string,
    taskDescription?: string
  ) {
    const breakdown = await this.generateTaskBreakdown(
      taskTitle,
      taskDescription
    );

    if (!breakdown) {
      throw new Error('Failed to generate task breakdown');
    }

    // Transform the AI response into an application model
    return taskBreakdownAdapter.toSuggestionModel(breakdown);
  }

  /**
   * Improve a task title and description
   * @param taskTitle Current task title
   * @param taskDescription Current task description (optional)
   * @returns Improved task title and description
   */
  async improveTaskDescription(
    taskTitle: string,
    taskDescription?: string
  ): Promise<TaskImprovement | null> {
    try {
      // Prepare variables based on what's provided
      const variables: Record<string, string> = {
        taskTitle,
      };

      if (taskDescription) {
        variables.taskDescription = taskDescription;
      }

      // Generate task improvement using template
      const response =
        await openAIService.generateFromTemplate<TaskImprovement>(
          'task-improvement',
          variables,
          {
            temperature: 0.7,
            maxTokens: 1000,
          }
        );

      return response;
    } catch (error) {
      console.error('Error improving task description:', error);
      return null;
    }
  }

  /**
   * Generate a task improvement suggestion with database-friendly format
   *
   * @param taskTitle Current task title
   * @param taskDescription Current task description (optional)
   * @returns Task improvement suggestion ready for database insertion
   */
  async generateTaskImprovementSuggestion(
    taskTitle: string,
    taskDescription?: string
  ) {
    const improvement = await this.improveTaskDescription(
      taskTitle,
      taskDescription
    );

    if (!improvement) {
      throw new Error('Failed to generate task improvement');
    }

    // Transform the AI response into an application model, passing original task details
    return taskImprovementAdapter.toSuggestionModel(
      improvement,
      taskTitle,
      taskDescription
    );
  }
}

export const assistantService = new AssistantService();
