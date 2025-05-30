import { openai } from '../config/openai';
import {
  BoardContext,
  MultiColumnGenerationResult,
  MultiTaskGenerationResult,
  PreviewBoard,
  PreviewColumn,
  PreviewSubtask,
  PreviewTask,
  RawAIBoardOutput,
  RawAIColumnOutput,
  RawAISubtaskBreakdownOutput,
  RawAISubtaskOutput,
  RawAITaskOutput,
  TaskContext,
} from '../types/ai.types';

export class AIService {
  /**
   * Generate a complete board suggestion with columns and tasks
   */
  async generateBoardSuggestion(
    prompt: string,
    userId: string
  ): Promise<PreviewBoard> {
    try {
      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application called Flow Forge. 
            Your task is to generate a structured board with columns and tasks based on the user's prompt.
            The response should be a valid JSON object representing a board structure with a 'title', 'description', and 'columns'.
            Each column should have a 'title' and an array of 'tasks'.
            Each task should have a 'title', 'description', and 'priority' (low, medium, or high).
            Ensure the board has at least 3 columns (e.g., "To Do", "In Progress", "Done").`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('OpenAI response content is null');
      }
      const boardData = JSON.parse(content) as RawAIBoardOutput;
      return this.formatBoardResponse(boardData, userId);
    } catch (error) {
      console.error('Error generating board suggestion:', error);
      throw new Error('Failed to generate board suggestion');
    }
  }

  /**
   * Generate a single column with tasks for an existing board using complete board context
   */
  async generateColumn(
    boardContext: BoardContext,
    prompt: string
  ): Promise<PreviewColumn> {
    try {
      // Create a summarized board context for the prompt
      const existingColumns = boardContext.columns
        .map((col) => col.name)
        .join(', ');
      const boardSummary = JSON.stringify({
        name: boardContext.name,
        description: boardContext.description,
        existingColumns: existingColumns,
        columnCount: boardContext.columns.length,
      });

      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application called Flow Forge. 
            A user has the following board: ${boardSummary}
            Your task is to generate a single column with relevant tasks based on the user's prompt.
            The column should meaningfully extend the existing board structure.
            The response should be a valid JSON object representing a column with a 'name' field and an array of 'tasks'.
            Each task should have a 'title', 'description', and 'priority' (low, medium, or high).`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('OpenAI response content is null');
      }

      const columnData = JSON.parse(content) as RawAIColumnOutput;

      // Extract column name from AI response or use a default
      const columnName = columnData.name || columnData.title || 'New Column';

      // Map tasks with default status based on column name
      const columnStatus = this.getStatusFromColumnName(columnName);
      const tasks = (columnData.tasks || []).map((task: RawAITaskOutput) => ({
        title: task.title || 'Unnamed Task',
        description: task.description || '',
        status: columnStatus,
      }));

      return {
        name: columnName,
        tasks: tasks,
      };
    } catch (error) {
      console.error('Error generating column:', error);
      throw new Error('Failed to generate column');
    }
  }

  /**
   * Generate multiple columns at once with tasks for an existing board
   * @param boardContext Complete context of the existing board
   * @param prompt User's request for what columns to generate
   * @param count Optional number of columns to generate (default: determined by AI based on prompt)
   */
  async generateMultipleColumns(
    boardContext: BoardContext,
    prompt: string,
    count?: number
  ): Promise<MultiColumnGenerationResult> {
    try {
      // Create a summarized board context for the prompt
      const existingColumns = boardContext.columns
        .map((col) => col.name)
        .join(', ');
      const boardSummary = JSON.stringify({
        name: boardContext.name,
        description: boardContext.description,
        existingColumns: existingColumns,
        columnCount: boardContext.columns.length,
      });

      const countInstruction = count
        ? `Generate exactly ${count} columns.`
        : 'Generate the appropriate number of columns based on the request.';

      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application called Flow Forge. 
            A user has the following board: ${boardSummary}
            Your task is to generate multiple columns with relevant tasks based on the user's prompt.
            ${countInstruction}
            The response should be a valid JSON object with a 'columns' array.
            Each column should have a 'name' field and an array of 'tasks'.
            Each task should have a 'title', 'description', and 'priority' (low, medium, or high).
            The columns should logically extend the existing board structure without duplicating existing columns.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('OpenAI response content is null');
      }

      const result = JSON.parse(content) as { columns?: RawAIColumnOutput[] };

      if (!result.columns || !Array.isArray(result.columns)) {
        throw new Error('Invalid response format: missing columns array');
      }

      // Process each column
      const columns = result.columns.map((columnData) => {
        // Extract column name
        const columnName = columnData.name || columnData.title || 'New Column';

        // Map tasks with default status based on column name
        const columnStatus = this.getStatusFromColumnName(columnName);
        const tasks = (columnData.tasks || []).map((task: RawAITaskOutput) => ({
          title: task.title || 'Unnamed Task',
          description: task.description || '',
          status: columnStatus,
        }));

        return {
          name: columnName,
          tasks: tasks,
        };
      });

      return { columns };
    } catch (error) {
      console.error('Error generating multiple columns:', error);
      throw new Error('Failed to generate columns');
    }
  }

  /**
   * Generate a single task for an existing column with full board context
   */
  async generateTask(
    boardContext: BoardContext,
    columnName: string,
    prompt: string
  ): Promise<PreviewTask> {
    try {
      // Find the target column and its tasks for context
      const targetColumn = boardContext.columns.find(
        (col) => col.name === columnName
      );
      const columnTasks = targetColumn
        ? targetColumn.tasks.map((t) => t.title).join(', ')
        : 'No existing tasks';

      // Create context summary
      const columnSummary = JSON.stringify({
        boardName: boardContext.name,
        boardDescription: boardContext.description,
        columnName: columnName,
        existingTasks: columnTasks,
      });

      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application called Flow Forge. 
            A user has the following context: ${columnSummary}
            Your task is to generate a single task that fits well with the existing tasks in the column.
            The response should be a valid JSON object representing a task with 'title', 'description', and 'priority' (low, medium, or high) fields.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('OpenAI response content is null');
      }

      const taskData = JSON.parse(content) as RawAITaskOutput;

      return {
        title: taskData.title || 'Unnamed Task',
        description: taskData.description || '',
        status: this.getStatusFromColumnName(columnName),
      };
    } catch (error) {
      console.error('Error generating task:', error);
      throw new Error('Failed to generate task');
    }
  }

  /**
   * Improve a task description based on user request
   */
  async improveTaskDescription(
    taskTitle: string,
    taskDescription: string,
    request: string
  ): Promise<{ title: string; description: string }> {
    try {
      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application.
            Your task is to improve the title and description of a task based on the user's request.
            The response should be a valid JSON object with 'title' and 'description' fields.`,
          },
          {
            role: 'user',
            content: `Current Task Title: ${taskTitle}\nCurrent Task Description: ${taskDescription}\nUser Request: ${request}`,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('OpenAI response content is null');
      }
      const improvedTask = JSON.parse(content) as {
        title?: string;
        description?: string;
      };
      return {
        title: improvedTask.title || taskTitle,
        description: improvedTask.description || taskDescription,
      };
    } catch (error) {
      console.error('Error improving task description:', error);
      throw new Error('Failed to improve task description');
    }
  }

  /**
   * Generate multiple tasks at once for a specific column
   * @param boardContext Complete context of the existing board
   * @param columnName Name of the column to generate tasks for
   * @param prompt User's request for what tasks to generate
   * @param count Optional number of tasks to generate (default: determined by AI based on prompt)
   */
  async generateMultipleTasks(
    boardContext: BoardContext,
    columnName: string,
    prompt: string,
    count?: number
  ): Promise<MultiTaskGenerationResult> {
    try {
      // Find the target column and its tasks for context
      const targetColumn = boardContext.columns.find(
        (col) => col.name === columnName
      );
      const columnTasks = targetColumn
        ? targetColumn.tasks.map((t) => t.title).join(', ')
        : 'No existing tasks';

      // Create context summary
      const columnSummary = JSON.stringify({
        boardName: boardContext.name,
        boardDescription: boardContext.description,
        columnName: columnName,
        existingTasks: columnTasks,
      });

      const countInstruction = count
        ? `Generate exactly ${count} tasks.`
        : 'Generate the appropriate number of tasks based on the request.';

      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application called Flow Forge. 
            A user has the following context: ${columnSummary}
            Your task is to generate multiple tasks that fit well with the existing column.
            ${countInstruction}
            The response should be a valid JSON object with a 'tasks' array.
            Each task should have a 'title', 'description', and 'priority' (low, medium, or high) fields.
            Tasks should be relevant to the column and board context.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('OpenAI response content is null');
      }

      const result = JSON.parse(content) as { tasks?: RawAITaskOutput[] };

      if (!result.tasks || !Array.isArray(result.tasks)) {
        throw new Error('Invalid response format: missing tasks array');
      }

      // Process each task
      const tasks = result.tasks.map((taskData) => ({
        title: taskData.title || 'Unnamed Task',
        description: taskData.description || '',
        status: this.getStatusFromColumnName(columnName),
      }));

      return { tasks };
    } catch (error) {
      console.error('Error generating multiple tasks:', error);
      throw new Error('Failed to generate tasks');
    }
  }

  /**
   * Improve a subtask description based on user request
   * Optionally uses parent task and board context if provided
   */
  async improveSubtaskDescription(
    subtaskTitle: string,
    subtaskDescription: string,
    request: string,
    parentTask?: TaskContext
  ): Promise<{ title: string; description: string }> {
    try {
      // Create context string if parent task is provided
      const contextString = parentTask
        ? `This subtask belongs to the parent task with the following details: ${JSON.stringify(
            {
              title: parentTask.title,
              description: parentTask.description,
              status: parentTask.status,
              subtaskCount: parentTask.subtasks?.length || 0,
            }
          )}`
        : '';

      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application.
            Your task is to improve the title and description of a subtask based on the user's request.
            ${contextString}
            The response should be a valid JSON object with 'title' and 'description' fields.`,
          },
          {
            role: 'user',
            content: `Current Subtask Title: ${subtaskTitle}\nCurrent Subtask Description: ${subtaskDescription}\nUser Request: ${request}`,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('OpenAI response content is null');
      }
      const improvedSubtask = JSON.parse(content) as {
        title?: string;
        description?: string;
      };
      return {
        title: improvedSubtask.title || subtaskTitle,
        description: improvedSubtask.description || subtaskDescription,
      };
    } catch (error) {
      console.error('Error improving subtask description:', error);
      throw new Error('Failed to improve subtask description');
    }
  }

  /**
   * Break down a task into subtasks
   */
  async breakdownTaskIntoSubtasks(
    taskTitle: string,
    taskDescription: string,
    request: string
  ): Promise<PreviewSubtask[]> {
    try {
      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application.
            Your task is to break down a task into smaller subtasks based on the task title, description, and user request.
            The response should be a valid JSON object containing a 'subtasks' array.
            Each subtask in the array should have 'title', 'description', and 'priority' (low, medium, or high) fields.`,
          },
          {
            role: 'user',
            content: `Parent Task Title: ${taskTitle}\nParent Task Description: ${taskDescription}\nUser Request: ${request}`,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('OpenAI response content is null');
      }
      const subtasksData = JSON.parse(content) as RawAISubtaskBreakdownOutput;
      return this.formatSubtasksResponse(subtasksData.subtasks || []);
    } catch (error) {
      console.error('Error breaking down task:', error);
      throw new Error('Failed to break down task into subtasks');
    }
  }

  private formatBoardResponse(
    boardData: RawAIBoardOutput,
    userId: string
  ): PreviewBoard {
    return {
      name: boardData.name || boardData.title || 'AI Generated Board',
      description: boardData.description || 'Generated based on your request',
      columns: (boardData.columns || []).map((column: RawAIColumnOutput) => {
        // Determine status based on column name
        let columnStatus: 'Todo' | 'Doing' | 'Done' = 'Todo';
        const columnName = (column.name || column.title || '').toLowerCase();

        if (/progress|doing|ongoing|in process/i.test(columnName)) {
          columnStatus = 'Doing';
        } else if (/done|complete|finished/i.test(columnName)) {
          columnStatus = 'Done';
        }

        return {
          name: column.name || column.title || 'Unnamed Column',
          tasks: (column.tasks || []).map((task: RawAITaskOutput) => ({
            title: task.title || 'Unnamed Task',
            description: task.description || '',
            status: columnStatus, // Use column's status instead of task priority
          })),
        };
      }),
      ownerId: userId,
    };
  }

  private formatSubtasksResponse(
    subtasksData: RawAISubtaskOutput[]
  ): PreviewSubtask[] {
    return subtasksData.map((subtask: RawAISubtaskOutput) => ({
      title: subtask.title || 'Unnamed Subtask',
      description: subtask.description || '',
      completed: false,
    }));
  }

  /**
   * Helper to determine appropriate task status based on column name
   */
  private getStatusFromColumnName(
    columnName: string
  ): 'Todo' | 'Doing' | 'Done' {
    const columnNameLower = columnName.toLowerCase();

    if (/progress|doing|ongoing|in process/i.test(columnNameLower)) {
      return 'Doing';
    } else if (/done|complete|finished/i.test(columnNameLower)) {
      return 'Done';
    } else {
      return 'Todo';
    }
  }
}

export default new AIService();
