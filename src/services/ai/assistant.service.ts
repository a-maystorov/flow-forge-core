import { openAIService } from './openai.service';
import { promptService } from './prompt.service';

// Interfaces for AI-generated suggestions
export interface BoardSuggestion {
  boardName: string;
  columns: ColumnSuggestion[];
}

export interface ColumnSuggestion {
  name: string;
  position: number;
  tasks: TaskSuggestion[];
}

export interface TaskSuggestion {
  title: string;
  description: string;
  position: number;
  status: 'Todo' | 'Doing' | 'Done';
  subtasks: SubtaskSuggestion[];
}

export interface SubtaskSuggestion {
  title: string;
  description: string;
  completed: boolean;
}

export interface TaskImprovementSuggestion {
  title: string;
  description: string;
}

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
      const messages = [
        promptService.generateSystemPrompt(),
        promptService.generateBoardCreationPrompt(projectDescription),
      ];

      const completion = await openAIService.generateChatCompletion(messages, {
        temperature: 0.7,
        maxTokens: 2000,
      });

      const content = openAIService.extractContent(completion);
      if (!content) return null;

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;

        return JSON.parse(jsonMatch[0]) as BoardSuggestion;
      } catch (error) {
        console.error('Error parsing AI response as JSON:', error);
        return null;
      }
    } catch (error) {
      console.error('Error generating board suggestion:', error);
      return null;
    }
  }

  /**
   * Break down a task into subtasks
   * @param taskDescription Description of the task to break down
   * @returns Suggested subtasks
   */
  async generateTaskBreakdown(taskDescription: string): Promise<{
    taskTitle: string;
    taskDescription: string;
    subtasks: SubtaskSuggestion[];
  } | null> {
    try {
      const messages = [
        promptService.generateSystemPrompt(),
        promptService.generateTaskBreakdownPrompt(taskDescription),
      ];

      const completion = await openAIService.generateChatCompletion(messages, {
        temperature: 0.7,
        maxTokens: 1500,
      });

      const content = openAIService.extractContent(completion);
      if (!content) return null;

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;

        return JSON.parse(jsonMatch[0]) as {
          taskTitle: string;
          taskDescription: string;
          subtasks: SubtaskSuggestion[];
        };
      } catch (error) {
        console.error('Error parsing AI response as JSON:', error);
        return null;
      }
    } catch (error) {
      console.error('Error generating task breakdown:', error);
      return null;
    }
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
  ): Promise<TaskImprovementSuggestion | null> {
    try {
      const messages = [
        promptService.generateSystemPrompt(),
        promptService.generateTaskImprovementPrompt(taskTitle, taskDescription),
      ];

      const completion = await openAIService.generateChatCompletion(messages, {
        temperature: 0.7,
        maxTokens: 1000,
      });

      const content = openAIService.extractContent(completion);
      if (!content) return null;

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;

        return JSON.parse(jsonMatch[0]) as TaskImprovementSuggestion;
      } catch (error) {
        console.error('Error parsing AI response as JSON:', error);
        return null;
      }
    } catch (error) {
      console.error('Error improving task description:', error);
      return null;
    }
  }
}

export const assistantService = new AssistantService();
