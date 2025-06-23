import { Types } from 'mongoose';
import { openai } from '../config/openai';
import {
  BoardContext,
  ChatContext,
  PreviewBoard,
  // PreviewColumn,
  PreviewSubtask,
  PreviewTask,
  RawAIBoardOutput,
  RawAIColumnOutput,
  // RawAISubtaskBreakdownOutput,
  RawAISubtaskOutput,
  RawAITaskOutput,
  // TaskContext,
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
              - 'description': A detailed description of the task in Markdown format
              - 'subtasks': An array of 2-5 subtasks for each task
            - Each subtask should have:
              - 'title': A clear action item
              - 'description': Additional details in Markdown format

            MARKDOWN FORMATTING:
            - Use Markdown syntax for all descriptions
            - Use headers (## or ###) for section titles
            - Use **bold** for emphasis
            - Use bullet points (- or *) for lists
            - Use checkboxes (- [ ]) for actionable items
            - Use code blocks with backticks for technical content
            
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
   * Suggest a new name for an existing column
   * @param boardContext Complete context of the existing board
   * @param currentColumnName The current name of the column to rename
   * @param userPrompt Optional user input about the desired name change
   * @returns The suggested new column name
   */
  async renameColumn(
    boardContext: BoardContext,
    currentColumnName: string,
    userPrompt?: string
  ): Promise<{ name: string }> {
    try {
      const existingColumns = boardContext.columns
        .filter(
          (col) => col.name.toLowerCase() !== currentColumnName.toLowerCase()
        )
        .map((col) => col.name);

      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant for a Kanban board application.
            Your task is to suggest a new name for a column based on the user's request and existing column names.
            
            Guidelines for column names:
            1. Keep it short and descriptive (1-3 words)
            2. Use title case (e.g., "In Progress")
            3. Be consistent with existing column naming patterns
            4. Avoid duplicating existing column names
            5. Make it clear what stage of the workflow it represents
            
            Current column name: ${currentColumnName}
            Existing columns: ${existingColumns.join(', ') || 'None'}
            ${userPrompt ? `User's request: ${userPrompt}` : ''}
            
            Respond with a JSON object containing:
            - name: string (required) - The suggested new column name`,
          },
          {
            role: 'user',
            content:
              userPrompt ||
              `Please suggest a better name for the column "${currentColumnName}"`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 50,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No content in AI response');
      }

      const columnData = JSON.parse(content) as { name: string };

      if (!columnData.name || typeof columnData.name !== 'string') {
        throw new Error(
          'Invalid response format from AI: missing or invalid name'
        );
      }

      // Ensure the new name is unique
      let newName = columnData.name.trim();
      const existingNames = new Set(
        existingColumns.map((name) => name.toLowerCase())
      );

      if (existingNames.has(newName.toLowerCase())) {
        let counter = 1;
        while (existingNames.has(`${newName} ${counter}`.toLowerCase())) {
          counter++;
        }
        newName = `${newName} ${counter}`;
      }

      return { name: newName };
    } catch (error) {
      console.error('Error renaming column:', error);
      throw new Error(
        error instanceof Error
          ? `Failed to rename column: ${error.message}`
          : 'An unknown error occurred while renaming the column'
      );
    }
  }

  /**
   * Suggest a new position for a column based on the board context
   * @param boardContext Complete context of the existing board
   * @param columnName The name of the column to move
   * @param userPrompt Optional user input about the desired position
   * @returns The suggested new position (0-based index)
   */
  async moveColumn(
    boardContext: BoardContext,
    columnName: string,
    userPrompt: string
  ): Promise<{ newPosition: number }> {
    try {
      const currentPosition = boardContext.columns.findIndex(
        (col) => col.name.toLowerCase() === columnName.toLowerCase()
      );

      if (currentPosition === -1) {
        throw new Error(`Column "${columnName}" not found`);
      }

      const columnNames = boardContext.columns.map((col) => col.name);

      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant for a Kanban board application.
            Your task is to determine the best new position for a column based on the user's request.
            
            Current board columns (0-based positions):
            ${columnNames.map((name, i) => `${i}. ${name}${i === currentPosition ? ' (current)' : ''}`).join('\n')}
            
            The column to move is: ${columnName} (currently at position ${currentPosition})
            
            Guidelines for column positioning:
            1. Typical workflow goes from left to right (e.g., "To Do" → "In Progress" → "Done")
            2. Related columns should be grouped together
            3. Consider the user's request: ${userPrompt}
            
            Respond with a JSON object containing:
            - newPosition: number (0-based index, must be between 0 and ${columnNames.length - 1})`,
          },
          {
            role: 'user',
            content:
              userPrompt || `Where should the "${columnName}" column be moved?`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 100,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No content in AI response');
      }

      const result = JSON.parse(content) as { newPosition: number };

      if (
        typeof result.newPosition !== 'number' ||
        !Number.isInteger(result.newPosition) ||
        result.newPosition < 0 ||
        result.newPosition >= columnNames.length
      ) {
        throw new Error(
          `Invalid position: ${result.newPosition}. Must be between 0 and ${columnNames.length - 1}`
        );
      }

      return { newPosition: result.newPosition };
    } catch (error) {
      console.error('Error determining column position:', error);
      throw new Error(
        error instanceof Error
          ? `Failed to determine column position: ${error.message}`
          : 'An unknown error occurred while determining column position'
      );
    }
  }

  /**
   * Checks if a column can be deleted (must be empty)
   * @param boardContext Complete context of the existing board
   * @param columnName Name of the column to check for deletion
   * @returns Object with canDelete flag and reason if not deletable
   */
  async deleteColumn(
    boardContext: BoardContext,
    columnName: string
  ): Promise<{ canDelete: boolean; reason?: string }> {
    try {
      const column = boardContext.columns.find(
        (col) => col.name.toLowerCase() === columnName.toLowerCase()
      );

      if (!column) {
        throw new Error(`Column "${columnName}" not found`);
      }

      if (column.tasks && column.tasks.length > 0) {
        return {
          canDelete: false,
          reason: `Cannot delete "${columnName}" because it contains ${column.tasks.length} task(s). Please move or delete the tasks first.`,
        };
      }

      return { canDelete: true };
    } catch (error) {
      console.error('Error checking column deletion:', error);
      throw new Error(
        error instanceof Error
          ? `Failed to check column deletion: ${error.message}`
          : 'An unknown error occurred while checking column deletion'
      );
    }
  }

  /**
   * Generate multiple columns for an existing board with enhanced context awareness
   * @param boardContext Complete context of the existing board
   * @param prompt User's request for what columns to generate
   * @param chatContext Conversation history for better context understanding
   * @param count Optional number of columns to generate (determined by AI if not specified)
   * @returns Promise with the generated columns
   */
  async generateMultipleColumns(
    boardContext: BoardContext,
    prompt: string,
    chatContext: ChatContext,
    count?: number
  ): Promise<{ name: string }[]> {
    try {
      const existingColumns = boardContext.columns.map((col) => ({
        name: col.name,
        position: col.position || 0,
        taskCount: col.tasks?.length || 0,
      }));

      existingColumns.sort((a, b) => a.position - b.position);

      const boardContextStr = `Board: ${boardContext.name || 'Untitled Board'}
        Description: ${boardContext.description || 'No description'}
        Existing columns (${existingColumns.length}):\n${
          existingColumns.length > 0
            ? existingColumns
                .map(
                  (col, idx) =>
                    `  ${idx + 1}. "${col.name}" (${col.taskCount} tasks)`
                )
                .join('\n')
            : '  No columns yet'
        }`;

      const systemPrompt = `You are an AI assistant for a Kanban board application called Flow Forge.
        Your task is to generate new columns based on the user's request and the existing board context.

        ${boardContextStr}

        Guidelines for generating columns:
        1. Generate columns that logically extend the existing workflow
        2. Use clear, concise names (2-3 words) in Title Case
        3. Avoid duplicating existing column names (case-insensitive)
        4. Consider the board's purpose when suggesting column names
        5. ${count ? `Generate exactly ${count} columns.` : 'Determine the appropriate number of columns based on the request.'}

        Respond with a JSON object containing an array of column objects, each with a 'name' property.`;

      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
          ...chatContext,
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content in AI response');
      }
      const parsedResponse = JSON.parse(content);
      if (!parsedResponse.columns || !Array.isArray(parsedResponse.columns)) {
        throw new Error(
          'Invalid response format: missing or invalid columns array'
        );
      }

      const existingNames = new Set(
        existingColumns.map((col) => col.name.toLowerCase())
      );

      const columns: Array<{ name: string }> = [];

      for (const columnData of parsedResponse.columns) {
        if (!columnData.name || typeof columnData.name !== 'string') {
          continue;
        }

        let columnName = columnData.name.trim();

        if (existingNames.has(columnName.toLowerCase())) {
          let counter = 1;
          while (existingNames.has(`${columnName} ${counter}`.toLowerCase())) {
            counter++;
          }
          columnName = `${columnName} ${counter}`;
        }

        existingNames.add(columnName.toLowerCase());
        columns.push({ name: columnName });
      }

      if (columns.length === 0) {
        throw new Error('No valid columns were generated');
      }

      return columns;
    } catch (error) {
      console.error('Error generating multiple columns:', error);
      throw new Error(
        error instanceof Error
          ? `Failed to generate columns: ${error.message}`
          : 'An unknown error occurred while generating columns'
      );
    }
  }

  /**
   * Generate a single task with automatic column selection
   * The task will be placed in the first available column in this priority: BACKLOG > TODO > First column
   */
  async generateTask(
    boardContext: BoardContext,
    prompt: string,
    chatContext: ChatContext
  ): Promise<PreviewTask> {
    try {
      const backlogCol = boardContext.columns.find((col) =>
        col.name.trim().toUpperCase().includes('BACKLOG')
      );

      const todoCol = boardContext.columns.find(
        (col) =>
          !col.name.trim().toUpperCase().includes('BACKLOG') &&
          col.name.trim().toUpperCase().includes('TODO')
      );

      const targetColumn = backlogCol || todoCol || boardContext.columns[0];

      if (!targetColumn) {
        throw new Error('No columns available in the board');
      }

      const columnContext = boardContext.columns.map((col) => ({
        name: col.name,
        taskCount: col.tasks?.length || 0,
        taskExamples: col.tasks?.slice(0, 3).map((t) => t.title) || [],
      }));

      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application called Flow Forge.
            
            ## Board Context ##
            - Board: ${boardContext.name || 'Untitled Board'}
            ${boardContext.description ? `- Description: ${boardContext.description}` : ''}
            
            ## Workflow Columns ##
            ${columnContext
              .map(
                (col) =>
                  `- ${col.name} (${col.taskCount} tasks)${
                    col.taskExamples.length > 0
                      ? `\n  Example tasks: ${col.taskExamples.join(', ')}`
                      : ''
                  }`
              )
              .join('\n')}
            
            ## Your Task ##
            Generate a single, well-defined task that fits naturally into the '${targetColumn.name}' column.
            
            ## Guidelines ##
          1. Task Title:
             - Clear and concise (5-10 words)
             - Start with a verb (e.g., "Implement", "Design", "Review")
             - Be specific and actionable
          
          2. Task Description:
             - Format the description in beautiful Markdown
             - Use headers (## or ###) for section titles
             - Use **bold** for emphasis and _italics_ for details
             - Use bullet points (- or *) for lists
             - Use checkboxes (- [ ]) for acceptance criteria
             - Include code blocks with backticks for technical content when relevant
             - Keep it concise but informative
            
            ## Response Format ##
            Return a JSON object with:
            {
              "title": "Task title here",
              "description": "Detailed description here"
            }`,
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
        description: this.ensureMarkdownFormat(taskData.description),
      };
    } catch (error) {
      console.error('Error generating task:', error);
      throw new Error('Failed to generate task');
    }
  }

  /**
   * Move a task from one column to another based on the user's request
   * @param boardContext Complete context of the existing board
   * @param taskTitle Title of the task to move
   * @param targetColumnName Name of the target column
   * @param userPrompt Optional user input about the desired move
   * @returns Object containing source and target column names and task title
   */
  async moveTask(
    boardContext: BoardContext,
    taskTitle: string,
    targetColumnName: string,
    userPrompt?: string
  ): Promise<{
    taskTitle: string;
    sourceColumnName: string;
    targetColumnName: string;
  }> {
    try {
      let sourceColumn: { name: string; tasks: PreviewTask[] } | undefined;
      let task: PreviewTask | undefined;

      for (const column of boardContext.columns) {
        const foundIndex = (column.tasks || []).findIndex(
          (t) => t.title.toLowerCase() === taskTitle.toLowerCase()
        );
        if (foundIndex !== -1) {
          sourceColumn = column;
          task = column.tasks[foundIndex];
          break;
        }
      }

      if (!task || !sourceColumn) {
        throw new Error(`Task "${taskTitle}" not found in any column`);
      }

      const targetColumn = boardContext.columns.find(
        (col) => col.name.toLowerCase() === targetColumnName.toLowerCase()
      );

      if (!targetColumn) {
        throw new Error(`Target column "${targetColumnName}" not found`);
      }

      if (sourceColumn.name === targetColumn.name) {
        throw new Error('Task is already in the target column');
      }

      if (userPrompt) {
        const response = await openai.client.chat.completions.create({
          model: openai.model,
          messages: [
            {
              role: 'system',
              content: `You are a helpful assistant for a Kanban board application.
                Your task is to determine if moving a task between columns makes sense based on the user's request.
                
                Current board columns:
                ${boardContext.columns.map((col) => `- ${col.name}`).join('\n')}
                
                Task to move: "${taskTitle}"
                Current column: "${sourceColumn.name}"
                Target column: "${targetColumn.name}"
                
                User's reasoning: ${userPrompt}
                
                Respond with a JSON object containing:
                - shouldMove: boolean (whether the move makes sense)
                - reason: string (brief explanation of your reasoning)`,
            },
            {
              role: 'user',
              content: `Should I move the task "${taskTitle}" from "${sourceColumn.name}" to "${targetColumn.name}"? ${userPrompt}`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        });

        const content = response.choices[0].message.content;
        if (content) {
          const result = JSON.parse(content) as {
            shouldMove: boolean;
            reason?: string;
          };

          if (!result.shouldMove) {
            throw new Error(
              result.reason ||
                'This move might not be appropriate based on the current workflow'
            );
          }
        }
      }

      return {
        taskTitle: task.title,
        sourceColumnName: sourceColumn.name,
        targetColumnName: targetColumn.name,
      };
    } catch (error) {
      console.error('Error moving task:', error);
      throw new Error(
        error instanceof Error
          ? `Failed to move task: ${error.message}`
          : 'An unknown error occurred while moving the task'
      );
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
        description: this.ensureMarkdownFormat(result.description),
      };
    } catch (error) {
      console.error('Error improving task description:', error);
      throw new Error('Failed to improve task description');
    }
  }

  /**
   * Identify which task to delete based on user prompt and board context
   * @param userPrompt - The user's message indicating which task to delete
   * @param boardContext - The current state of the board
   * @param chatContext - Previous conversation context for better understanding
   * @returns Object containing columnIndex and taskIndex of the task to delete
   */
  async deleteTask(
    userPrompt: string,
    boardContext: BoardContext,
    chatContext: ChatContext
  ): Promise<{ columnIndex: number; taskIndex: number }> {
    try {
      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application.
              The current board has the following context: ${JSON.stringify(boardContext, null, 2)}
              
              Your task is to:
              1. Identify which task the user wants to delete based on their message
              2. Return the column index and task index of the identified task
              
              The response should be a valid JSON object with:
              - columnIndex: number (index of the column containing the task)
              - taskIndex: number (index of the task in its column)
              
              If the task cannot be clearly identified, return null for both indices.`,
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

      if (result.columnIndex === undefined || result.taskIndex === undefined) {
        throw new Error(
          'Invalid response format from AI - missing required indices'
        );
      }

      // Validate the indices are within bounds
      if (
        result.columnIndex < 0 ||
        result.columnIndex >= boardContext.columns.length ||
        result.taskIndex < 0 ||
        result.taskIndex >=
          (boardContext.columns[result.columnIndex]?.tasks?.length || 0)
      ) {
        throw new Error('Task not found at the specified indices');
      }

      return {
        columnIndex: result.columnIndex,
        taskIndex: result.taskIndex,
      };
    } catch (error) {
      console.error('Error identifying task for deletion:', error);
      throw new Error('Failed to identify task for deletion');
    }
  }

  /**
   * Break down a task into subtasks based on user input and board context
   */
  async breakdownTaskIntoSubtasks(
    userPrompt: string,
    boardContext: BoardContext,
    chatContext: ChatContext
  ): Promise<PreviewSubtask[]> {
    try {
      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application.
          The current board has the following context: ${JSON.stringify(boardContext, null, 2)}

          Your task is to:
        1. Determine which task the user wants to break down
        2. Generate a list of meaningful subtasks for it
        3. Each subtask must include:
           - title (string): Clear and actionable title that starts with a verb
           - description (string): Detailed description using Markdown formatting
        
        For Markdown descriptions:
        - Use headers (## or ###) for section titles
        - Use **bold** for emphasis and _italic_ for details
        - Use bullet points (- or *) for lists
        - Use checkboxes (- [ ]) for actionable items
        - Include code blocks with backticks for technical content when relevant
          
          The response must be a valid JSON object like:
          {
            "columnIndex": number, // index of the column containing the parent task
            "taskIndex": number,   // index of the task in its column
            "subtasks": [
              {
                "title": string,
                "description": string,
              },
              ...
            ]
          }
          
          If the task is unclear, return null for all fields.`,
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
        throw new Error('OpenAI response content is null');
      }

      const result = JSON.parse(content);

      if (
        result.columnIndex === undefined ||
        result.taskIndex === undefined ||
        !Array.isArray(result.subtasks)
      ) {
        throw new Error('Invalid response format from AI');
      }

      return this.formatSubtasksResponse(result.subtasks);
    } catch (error) {
      console.error('Error breaking down task:', error);
      throw new Error('Failed to break down task into subtasks');
    }
  }
  /**
   * Improve a subtask description based on user prompt.
   * Uses full board, task, and subtask context to determine what to improve.
   * Only updates the subtask title if the user explicitly asks for it.
   */
  async improveSubtask(
    boardContext: BoardContext, // full board with columns, tasks, and subtasks
    prompt: string,
    chatContext: ChatContext
  ): Promise<{
    columnIndex: number;
    taskIndex: number;
    subtaskIndex: number;
    title: string;
    description: string;
  }> {
    try {
      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application.
              The current board has the following context:
              ${JSON.stringify(boardContext, null, 2)}

              Your task is to:
              1. Identify which subtask the user wants to improve based on their prompt.
              2. Improve the subtask description based on the user's intent.
              3. Only modify the title if the user explicitly mentions wanting a title change — otherwise, leave the title exactly as is.
              4. Return the indices of the column, task, and subtask along with the improved content.

              The response should be a valid JSON object with:
              - columnIndex: number
              - taskIndex: number
              - subtaskIndex: number
              - title: string (subtask title — only changed if clearly requested)
              - description: string (updated based on the user prompt)`,
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

      const result = JSON.parse(content) as {
        columnIndex: number;
        taskIndex: number;
        subtaskIndex: number;
        title?: string;
        description?: string;
      };

      const originalSubtask =
        boardContext.columns[result.columnIndex]?.tasks[result.taskIndex]
          ?.subtasks?.[result.subtaskIndex];

      if (!originalSubtask) {
        throw new Error('Subtask not found in provided context.');
      }

      return {
        columnIndex: result.columnIndex,
        taskIndex: result.taskIndex,
        subtaskIndex: result.subtaskIndex,
        title: result.title ?? originalSubtask.title,
        description: this.ensureMarkdownFormat(
          result.description ?? originalSubtask.description ?? ''
        ),
      };
    } catch (error) {
      console.error('Error improving subtask description:', error);
      throw new Error('Failed to improve subtask description');
    }
  }

  /**
   * Identify which subtask to delete based on user prompt and board context
   * @param userPrompt - The user's message indicating which subtask to delete
   * @param boardContext - The current state of the board
   * @param chatContext - Previous conversation context for better understanding
   * @returns Object containing columnIndex, taskIndex, and subtaskIndex of the subtask to delete
   */
  async deleteSubtask(
    userPrompt: string,
    boardContext: BoardContext,
    chatContext: ChatContext
  ): Promise<{ columnIndex: number; taskIndex: number; subtaskIndex: number }> {
    try {
      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a Kanban board application.
            The current board has the following context: ${JSON.stringify(boardContext, null, 2)}
            
            Your task is to:
            1. Identify which subtask the user wants to delete based on their message
            2. Return the column index, task index, and subtask index of the identified subtask
            
            The response should be a valid JSON object with:
            - columnIndex: number (index of the column containing the task)
            - taskIndex: number (index of the task in its column)
            - subtaskIndex: number (index of the subtask within the task)
            
            If the subtask cannot be clearly identified, return null for all indices.`,
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

      const { columnIndex, taskIndex, subtaskIndex } = result;

      if (
        columnIndex === undefined ||
        taskIndex === undefined ||
        subtaskIndex === undefined
      ) {
        throw new Error(
          'Invalid response format from AI - missing required indices'
        );
      }

      // Validate the indices are within bounds
      const column = boardContext.columns[columnIndex];
      const task = column?.tasks?.[taskIndex];
      const subtask = task?.subtasks?.[subtaskIndex];

      if (!column || !task || !subtask) {
        throw new Error('Subtask not found at the specified indices');
      }

      return {
        columnIndex,
        taskIndex,
        subtaskIndex,
      };
    } catch (error) {
      console.error('Error identifying subtask for deletion:', error);
      throw new Error('Failed to identify subtask for deletion');
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
        description: this.ensureMarkdownFormat(task.description),
        subtasks: (task.subtasks || []).map((subtask) => ({
          title: subtask.title || 'Unnamed Subtask',
          description: this.ensureMarkdownFormat(subtask.description),
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
      description: this.ensureMarkdownFormat(subtask.description),
    }));
  }

  /**
   * Ensures text is properly formatted in Markdown
   * If the text already contains Markdown elements, it will be returned as is
   * Otherwise, basic Markdown formatting will be applied
   */
  private ensureMarkdownFormat(text: string | undefined): string {
    if (!text) return '';

    // Simple check if text already contains markdown elements
    const hasMarkdownElements = /[#*`_\-\[\]]/g.test(text);

    if (hasMarkdownElements) {
      return text; // Already contains markdown elements
    }

    // Add basic markdown formatting to plain text
    // Split by paragraphs and format each
    const paragraphs = text.split('\n\n');
    return paragraphs
      .map((paragraph) => {
        // For short single-line paragraphs
        if (paragraph.length < 80 && !paragraph.includes('\n')) {
          return paragraph;
        }

        // For bullet point style text
        if (paragraph.includes(':\n') || paragraph.match(/\d+\.\s/)) {
          const [header, ...points] = paragraph.split('\n');
          return `### ${header}\n${points.map((p) => `- ${p.replace(/^\d+\.\s*/, '')}`).join('\n')}`;
        }

        return paragraph;
      })
      .join('\n\n');
  }

  /**
   * Generate a friendly and helpful response for general conversation
   * @param message - The user's message
   * @param chatContext - Array of previous messages for context
   * @param boardContext - Board context for additional context
   * @returns A natural language response
   */
  async generateGeneralResponse(
    message: string,
    chatContext: ChatContext,
    boardContext: BoardContext
  ): Promise<string> {
    try {
      const systemMessage = `You are the Flow Forge assistant, here to help users manage their Kanban boards and tasks.

        AVAILABLE CAPABILITIES:
        1. **Board Management**
        - Create new Kanban boards from scratch with structured columns and tasks
        - Generate new columns with intelligent positioning
        - Generate multiple columns at once based on project requirements
        - Rename, reorder, or delete columns based on workflow needs
        - Analyze and optimize board structure for better workflow

        2. **Task Management**
        - Create beautifully formatted tasks with Markdown descriptions
        - Move tasks between columns intelligently
        - Improve existing task titles and descriptions with enhanced formatting
        - Break down tasks into subtasks with clear action items
        - Improve subtask descriptions with Markdown formatting
        - Delete specific tasks or subtasks on request

        3. **Workflow Analysis**
        - Suggest workflow improvements based on current board state
        - Identify bottlenecks in the current setup
        - Recommend task prioritization strategies
        - Provide productivity tips and workflow optimizations

        GUIDELINES:
        - If no board context is available, do not treat this as an error.
        - If the user greets you or asks what you can do, respond warmly and mention your capabilities.
        - Gently encourage creating a board only if it makes sense in the conversation.
        - When referencing tasks or columns, use their exact names from the context.
        - Keep responses concise but helpful (2–4 sentences).
        - ALWAYS use markdown for readability and beautiful formatting:
          - **Bold** for emphasis and important concepts
          - *Italics* for supplementary information
          - \`code\` for board/column/task names
          - ### Headers for section titles
          - Bullet lists for multiple points
        - Ask clarifying questions if the user's intent is unclear.
        - Maintain a friendly, professional, and encouraging tone.
        - Use emojis sparingly for engagement (e.g. 👋, ✅, 🚀).

        CONTEXT:
        ${boardContext ? `Board context:\n${boardContext}` : 'Board context: (none)'}`;

      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          { role: 'system', content: systemMessage },
          ...chatContext,
          { role: 'user', content: message },
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
