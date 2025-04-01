import { ChatCompletionMessageParam } from 'openai/resources';

/**
 * Service for generating optimized prompts for the AI assistant
 */
export class PromptService {
  /**
   * Generate a system prompt for the AI assistant
   * @returns System message defining the assistant's role and capabilities
   */
  generateSystemPrompt(): ChatCompletionMessageParam {
    return {
      role: 'system',
      content: `You are an AI project management assistant for a Kanban board application.
Your purpose is to help users translate project requirements into clear, organized tasks.
You should analyze project descriptions and requirements, then suggest appropriate board structures,
columns, tasks, and subtasks that efficiently organize the work.

You should:
1. Identify key project components and suggest logical columns (e.g., "Backlog", "In Progress", "Done")
2. Break down requirements into specific tasks with clear titles and descriptions
3. Further divide complex tasks into subtasks where appropriate
4. Suggest appropriate organization and priority for tasks
5. Use project management best practices to structure your suggestions

Your responses should be structured, professional, and focused on clarity and organization.`,
    };
  }

  /**
   * Generate a prompt for board creation
   * @param projectDescription Description of the project from the user
   * @returns Formatted user message for board creation
   */
  generateBoardCreationPrompt(
    projectDescription: string
  ): ChatCompletionMessageParam {
    return {
      role: 'user',
      content: `I need to create a Kanban board for the following project:
      
${projectDescription}

Please suggest a board structure with appropriate columns, tasks, and subtasks.
Format your response as valid JSON with the following structure:
{
  "boardName": "Suggested board name",
  "columns": [
    {
      "name": "Column name",
      "position": 0,
      "tasks": [
        {
          "title": "Task title",
          "description": "Detailed task description",
          "position": 0,
          "status": "Todo",
          "subtasks": [
            {
              "title": "Subtask title",
              "description": "Subtask description",
              "completed": false
            }
          ]
        }
      ]
    }
  ]
}`,
    };
  }

  /**
   * Generate a prompt for task breakdown
   * @param taskDescription Description of the task to break down
   * @returns Formatted user message for task breakdown
   */
  generateTaskBreakdownPrompt(
    taskDescription: string
  ): ChatCompletionMessageParam {
    return {
      role: 'user',
      content: `I need to break down the following task into subtasks:
      
${taskDescription}

Please suggest a logical breakdown of this task into subtasks.
Format your response as valid JSON with the following structure:
{
  "taskTitle": "Refined task title",
  "taskDescription": "Refined task description",
  "subtasks": [
    {
      "title": "Subtask title",
      "description": "Subtask description",
      "completed": false
    }
  ]
}`,
    };
  }

  /**
   * Generate a prompt for improving task descriptions
   * @param taskTitle The title of the task to improve
   * @param taskDescription The current description (if any)
   * @returns Formatted user message for task improvement
   */
  generateTaskImprovementPrompt(
    taskTitle: string,
    taskDescription?: string
  ): ChatCompletionMessageParam {
    return {
      role: 'user',
      content: `I need to improve the following task:
      
Title: ${taskTitle}
${taskDescription ? `Description: ${taskDescription}` : 'No description provided'}

Please suggest an improved title and description for this task that is clear, specific, and actionable.
Format your response as valid JSON with the following structure:
{
  "title": "Improved task title",
  "description": "Improved task description"
}`,
    };
  }
}

export const promptService = new PromptService();
