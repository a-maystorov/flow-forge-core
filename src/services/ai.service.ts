import { Types } from 'mongoose';
import { openai } from '../config/openai';
import {
  BoardContext,
  ChatContext,
  MultiColumnGenerationResult,
  MultiTaskGenerationResult,
  PreviewBoard,
  // PreviewColumn,
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
  async generateBoard(
    prompt: string,
    userId: Types.ObjectId,
    chatContext: ChatContext
  ): Promise<PreviewBoard> {
    try {
      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application called Flow Forge. 
            Your task is to generate a structured board with columns and tasks based on the user's prompt.
            The response should be a valid JSON object representing a board structure with a 'name', 'description', and 'columns'.
            
            COLUMNS:
            - Each column MUST have a clear, descriptive 'name' (e.g., 'Backlog', 'To Do', 'In Progress', 'Review', 'Done')
            - The first column should be for planning/backlog items
            - Subsequent columns should represent stages of progress
            - Include 3-6 columns total based on the workflow
            
            TASKS:
            - All tasks should initially be placed in the first column (Backlog/To Do)
            - Each task MUST have:
              - 'title': A clear, concise title
              - 'description': A detailed description of the task
              - 'subtasks': An array of 2-5 subtasks for each task
            - Each subtask should have:
              - 'title': A clear action item
              - 'description': Additional details if needed
            
            FORMAT REQUIREMENTS:
            - Use double quotes for all JSON properties
            - Include ALL tasks in the first column initially
            - Ensure all required fields are present
            - The response must be valid JSON`,
          },
          {
            role: 'user',
            content: prompt,
          },
          ...chatContext,
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
   * Generate a single column for an existing board using complete board context
   * @param boardContext - The current state of the board
   * @param prompt - User's request for column generation
   * @param chatContext - Previous conversation context
   * @param options - Additional options for column generation
   * @returns The generated column
   */
  async generateColumn(
    boardContext: BoardContext,
    prompt: string,
    chatContext: ChatContext,
    options: {
      position?: 'start' | 'end' | number;
      analyzeExistingPatterns?: boolean;
    } = {}
  ): Promise<{ name: string }> {
    try {
      const { position = 'end', analyzeExistingPatterns = true } = options;

      const existingColumns = boardContext.columns.map((col) => ({
        name: col.name,
        position: col.position || 0,
      }));

      let columnContext = '';
      if (analyzeExistingPatterns && existingColumns.length > 0) {
        columnContext = `Existing columns (in order):\n${existingColumns
          .map((col) => `- "${col.name}"`)
          .join('\n')}`;
      }

      let positionContext = '';
      if (position === 'start') {
        positionContext =
          'The new column should be added at the start of the board.';
      } else if (position === 'end') {
        positionContext =
          'The new column should be added at the end of the board.';
      } else if (typeof position === 'number') {
        positionContext = `The new column should be inserted at position ${position} (0-based index).`;
      }

      const systemPrompt = `You are an AI assistant for a Kanban board application called Flow Forge.
      
      Current board context:
      - Name: ${boardContext.name || 'Untitled Board'}
      - Description: ${boardContext.description || 'No description'}
      - Total columns: ${existingColumns.length}
      
      ${columnContext}
      
      ${positionContext}
      
      Your task is to generate a single column name that fits naturally with the existing board structure.
      Consider the following guidelines:
      1. Column name should be clear, concise, and follow the existing naming pattern
      2. Name should represent a stage in a workflow (e.g., "To Do", "In Progress", "Done")
      3. Avoid duplicating existing column names
      
      Respond with a JSON object containing:
      - name: string (required) - The name of the new column`;

      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Generate a new column based on: ${prompt}`,
          },
          ...chatContext,
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 100,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content in AI response');
      }

      let columnData: { name: string };
      try {
        columnData = JSON.parse(content);
      } catch (error) {
        throw new Error('Invalid JSON response from AI: ' + error);
      }

      if (!columnData.name || typeof columnData.name !== 'string') {
        throw new Error('Invalid or missing column name in AI response');
      }

      // Ensure column name is unique
      let columnName = columnData.name.trim();
      const existingNames = new Set(
        existingColumns.map((col) => col.name.toLowerCase())
      );

      if (existingNames.has(columnName.toLowerCase())) {
        let counter = 1;
        while (existingNames.has(`${columnName} ${counter}`.toLowerCase())) {
          counter++;
        }
        columnName = `${columnName} ${counter}`;
      }

      return { name: columnName };
    } catch (error) {
      console.error('Error generating column:', error);
      throw new Error(
        error instanceof Error
          ? `Failed to generate column: ${error.message}`
          : 'An unknown error occurred while generating the column'
      );
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
    chatContext: ChatContext,
    count?: number
  ): Promise<MultiColumnGenerationResult> {
    try {
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
            The columns should logically extend the existing board structure without duplicating existing columns.
            
            IMPORTANT: Create columns that make sense for the user's use case and prompt.
            There is no fixed number of columns - create as many as needed based on the user's request.
            The column names should be relevant to the user's workflow - you don't have to use standard names if you don't need to.
            Create tasks only if the user requests it.
            Create subtasks only if the task is very complex and requires breaking it down into smaller steps or the user requests it.`,
          },
          {
            role: 'user',
            content: prompt,
          },
          ...chatContext,
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

      const columns = result.columns.map((columnData) => {
        const columnName = columnData.name || 'New Column';

        const tasks = (columnData.tasks || []).map((task: RawAITaskOutput) => ({
          title: task.title || 'Unnamed Task',
          description: task.description || '',
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
    prompt: string,
    chatContext: ChatContext
  ): Promise<PreviewTask> {
    try {
      const targetColumn = boardContext.columns.find(
        (col) => col.name === columnName
      );

      const columnTasks = targetColumn
        ? targetColumn.tasks.map((t) => t.title).join(', ')
        : 'No existing tasks';

      const boardSummary = JSON.stringify({
        boardName: boardContext.name,
        boardDescription: boardContext.description,
        columnName,
        existingTasks: columnTasks,
      });

      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application called Flow Forge. 
            A user has the following context: ${boardSummary}
            Your task is to generate a single task that fits well with the existing tasks in the column.
            The response should be a valid JSON object representing a task with 'title', 'description', and 'status' (Todo, Doing, or Done) fields.
            The task should have an array of 'subtasks' with 'title' and 'description'.
            Create subtasks only if the task is very complex and requires breaking it down into smaller steps or the user requests it.`,
          },
          {
            role: 'user',
            content: prompt,
          },
          ...chatContext,
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
      };
    } catch (error) {
      console.error('Error generating task:', error);
      throw new Error('Failed to generate task');
    }
  }

  /**
   * Improve a task description based on user prompt and board context
   */
  async improveTask(
    userPrompt: string,
    boardContext: BoardContext,
    chatContext: ChatContext
  ): Promise<{
    title: string;
    description: string;
    columnIndex: number;
    taskIndex: number;
  }> {
    try {
      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application.
            The current board has the following context: ${JSON.stringify(boardContext, null, 2)}
            
            Your task is to:
            1. Identify which task the user wants to improve based on their message
            2. Generate an improved title and description for that task
            3. Return the column index and task index of the identified task
            
            The response should be a valid JSON object with:
            - columnIndex: number (index of the column containing the task)
            - taskIndex: number (index of the task in its column)
            - title: string (improved title)
            - description: string (improved description)
            
            If the task cannot be clearly identified, return null for all fields.`,
          },
          {
            role: 'user',
            content: `User request: ${userPrompt}`,
          },
          ...chatContext,
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No content in AI response');
      }

      const result = JSON.parse(content);

      if (
        result.columnIndex === undefined ||
        result.taskIndex === undefined ||
        !result.title ||
        !result.description
      ) {
        throw new Error('Invalid response format from AI');
      }

      return {
        columnIndex: result.columnIndex,
        taskIndex: result.taskIndex,
        title: result.title,
        description: result.description,
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
   */
  async generateMultipleTasks(
    boardContext: BoardContext,
    columnName: string,
    prompt: string,
    chatContext: ChatContext
  ): Promise<MultiTaskGenerationResult> {
    try {
      const targetColumn = boardContext.columns.find(
        (col) => col.name === columnName
      );
      const columnTasks = targetColumn
        ? targetColumn.tasks.map((t) => t.title).join(', ')
        : 'No existing tasks';

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
            Your task is to generate multiple tasks that fit well with the existing column.
            The response should be a valid JSON object with a 'tasks' array.
            Each task should have a 'title', 'description', and 'priority' (low, medium, or high) fields.
            Tasks should be relevant to the column and board context.
            Add subtasks only if the task is very complex and requires breaking it down into smaller steps or the user requests it.
            `,
          },
          {
            role: 'user',
            content: prompt,
          },
          ...chatContext,
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
        status: 'Todo',
      }));

      return { tasks };
    } catch (error) {
      console.error('Error generating multiple tasks:', error);
      throw new Error('Failed to generate tasks');
    }
  }

  /**
   * Improve a subtask description based on user prompt
   * Optionally uses parent task and board context if provided
   */
  async improveSubtask(
    subtaskTitle: string,
    subtaskDescription: string,
    prompt: string,
    chatContext: ChatContext,
    parentTask?: TaskContext
  ): Promise<{ title: string; description: string }> {
    try {
      // Create context string if parent task is provided
      const contextString = parentTask
        ? `This subtask belongs to the parent task with the following details: ${JSON.stringify(
            {
              title: parentTask.title,
              description: parentTask.description,
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
            content: `Current Subtask Title: ${subtaskTitle}\nCurrent Subtask Description: ${subtaskDescription}\nUser Prompt: ${prompt}`,
          },
          ...chatContext,
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
    prompt: string,
    chatContext: ChatContext
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
            content: `Parent Task Title: ${taskTitle}\nParent Task Description: ${taskDescription}\nUser Prompt: ${prompt}`,
          },
          ...chatContext,
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
    userId: Types.ObjectId
  ): PreviewBoard {
    // Extract all tasks from all columns
    const allTasks: PreviewTask[] = [];

    // Process each column and collect all tasks
    (boardData.columns || []).forEach((column: RawAIColumnOutput) => {
      const columnTasks = (column.tasks || []).map((task: RawAITaskOutput) => ({
        title: task.title || 'Unnamed Task',
        description: task.description || '',
        subtasks: (task.subtasks || []).map((subtask) => ({
          title: subtask.title || 'Unnamed Subtask',
          description: subtask.description || '',
        })),
      }));

      allTasks.push(...columnTasks);
    });

    const defaultColumns = [
      { name: 'Backlog', tasks: allTasks },
      { name: 'To Do', tasks: [] },
      { name: 'In Progress', tasks: [] },
      { name: 'Done', tasks: [] },
    ];

    const columns =
      (boardData.columns || []).length > 0 &&
      boardData.columns!.some((col) => col.name?.trim())
        ? boardData.columns!.map((column) => ({
            name: column.name || 'Unnamed Column',
            tasks:
              column.name?.toLowerCase().includes('backlog') ||
              column.name?.toLowerCase().includes('todo')
                ? allTasks
                : [],
          }))
        : defaultColumns;

    return {
      name: boardData.name || 'AI Generated Board',
      description: boardData.description || 'Generated based on your request',
      columns,
      ownerId: userId,
    };
  }

  private formatSubtasksResponse(
    subtasksData: RawAISubtaskOutput[]
  ): PreviewSubtask[] {
    return subtasksData.map((subtask: RawAISubtaskOutput) => ({
      title: subtask.title || 'Unnamed Subtask',
      description: subtask.description || '',
    }));
  }

  /**
   * Generate a friendly and helpful response for general conversation
   * @param message - The user's message
   * @param chatContext - Optional array of previous messages for context
   * @returns A natural language response
   */
  async generateGeneralResponse(
    message: string,
    chatContext: ChatContext
  ): Promise<string> {
    try {
      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are the Flow Forge assistant, here to help users manage their projects and tasks. 
            
            Your primary capabilities include:
            - Creating and managing Kanban boards
            - Improving and refining task descriptions
            - Breaking down tasks into subtasks
            - Providing workflow and productivity guidance
            - Assisting with project planning and organization
            
            Your personality is:
            - Warm, encouraging, and professional
            - Concise in responses (1-3 sentences usually)
            - Proactive in suggesting next steps
            - Knowledgeable about project management best practices
            
            Guidelines:
            - Keep responses clear and focused on productivity
            - Use emojis occasionally but sparingly
            - Always maintain a helpful and professional tone
            - If unsure about something, ask for clarification`,
          },
          ...chatContext,
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.7,
        max_tokens: 150,
      });
      return (
        response.choices[0].message.content ||
        "I'm here to help! What would you like to work on today?"
      );
    } catch (error) {
      console.error('Error generating general response:', error);
      return "I'm having trouble thinking of a response right now. Could you try asking something else?";
    }
  }
}

export default new AIService();
