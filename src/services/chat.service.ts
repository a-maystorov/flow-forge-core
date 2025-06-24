import mongoose from 'mongoose';
import { openai } from '../config/openai';
import Chat from '../models/chat.model';
import Message, { MessageRole } from '../models/message.model';
import {
  BoardContext,
  ChatContext,
  PreviewBoard,
  PreviewSubtask,
  PreviewTask,
} from '../types/ai.types';
import AIService from './ai.service';
import BoardContextService from './board-context.service';

/**
 * Interface for message intent results
 */
export interface MessageIntent {
  action:
    | 'generate_board'
    | 'improve_task'
    | 'improve_subtask'
    | 'break_down_task'
    | 'generate_column'
    | 'generate_multiple_columns'
    | 'rename_column'
    | 'move_column'
    | 'move_task'
    | 'delete_column'
    | 'delete_task'
    | 'delete_subtask'
    | 'generate_task'
    | 'general_conversation';
  userId: mongoose.Types.ObjectId;
  taskTitle?: string;
  taskDescription?: string;
  columnName?: string;
  currentColumnName?: string;
}

/**
 * Service to handle chat conversations and AI interactions
 */
class ChatService {
  /**
   * Creates a new chat conversation
   * @param userId - The ID of the user creating the chat
   * @param initialTitle - Optional initial title for the chat
   * @param boardId - Optional ID of an existing board to populate context from
   * @returns The newly created chat
   */
  async createChat(
    userId: string | mongoose.Types.ObjectId,
    initialTitle: string = 'New Conversation',
    boardId?: string | mongoose.Types.ObjectId
  ) {
    try {
      const userObjectId =
        typeof userId === 'string'
          ? new mongoose.Types.ObjectId(userId)
          : userId;

      let boardContext = BoardContextService.getEmptyBoardContext();

      if (boardId) {
        try {
          boardContext =
            await BoardContextService.populateBoardContextFromBoard(boardId);
        } catch (boardError) {
          console.error('Error populating board context:', boardError);
        }
      }

      const chat = new Chat({
        userId: userObjectId,
        title: initialTitle,
        boardContext,
      });

      await chat.save();
      return chat;
    } catch (error) {
      console.error('Error creating chat:', error);
      throw error;
    }
  }

  /**
   * Adds a message to an existing chat
   * @param chatId - The ID of the chat
   * @param role - The role of the message sender (user, assistant, system)
   * @param content - The content of the message
   * @returns The newly created message
   */
  async addMessage(
    chatId: string | mongoose.Types.ObjectId,
    role: MessageRole,
    content: string
  ) {
    try {
      const chatObjectId =
        typeof chatId === 'string'
          ? new mongoose.Types.ObjectId(chatId)
          : chatId;

      const message = new Message({
        chatId: chatObjectId,
        role,
        content,
      });

      await message.save();

      await Chat.findByIdAndUpdate(chatObjectId, {
        lastMessageAt: new Date(),
      });

      return message;
    } catch (error) {
      console.error('Error adding message:', error);
      throw error;
    }
  }

  /**
   * Gets all messages for a specific chat
   * @param chatId - The ID of the chat
   * @returns Array of messages
   */
  async getChatMessages(chatId: string | mongoose.Types.ObjectId) {
    try {
      const chatObjectId =
        typeof chatId === 'string'
          ? new mongoose.Types.ObjectId(chatId)
          : chatId;

      const messages = await Message.find({ chatId: chatObjectId })
        .sort('createdAt')
        .exec();

      return messages;
    } catch (error) {
      console.error('Error getting chat messages:', error);
      throw error;
    }
  }

  /**
   * Process a user message and generate an AI response
   * @param chatId - The ID of the chat
   * @param userId - The ID of the user
   * @param userMessage - The message from the user
   * @param boardId - Optional ID of a board to update context from
   * @returns The AI response message
   */
  async processUserMessage(
    chatId: string | mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
    userMessage: string,
    boardId?: string | mongoose.Types.ObjectId
  ) {
    const chatObjectId =
      typeof chatId === 'string' ? new mongoose.Types.ObjectId(chatId) : chatId;

    if (boardId) {
      const chat = await Chat.findById(chatObjectId)
        .select('boardContext')
        .lean();

      if (!chat?.boardContext?.name || !chat?.boardContext?.columns?.length) {
        try {
          const boardContext =
            await BoardContextService.populateBoardContextFromBoard(boardId);
          await BoardContextService.updateBoardContext(
            chatObjectId,
            boardContext
          );
        } catch (boardError) {
          console.error('Error updating board context:', boardError);
        }
      }
    }

    try {
      await this.addMessage(chatObjectId, MessageRole.USER, userMessage);

      let boardContext =
        await BoardContextService.getBoardContext(chatObjectId);

      const chatContext = await this.getChatContext(chatObjectId);

      const intent = await this.determineMessageIntent(
        userMessage,
        userId,
        chatContext,
        boardContext
      );

      let responseContent = '';
      let actionResult:
        | PreviewBoard
        | { title: string; description: string }
        | PreviewSubtask[]
        | { name: string }
        | { newPosition: number }
        | { columns: Array<{ name: string; tasks: PreviewTask[] }> }
        | PreviewTask
        | {
            taskTitle: string;
            sourceColumnName: string;
            targetColumnName: string;
          }
        | null = null;

      let isBoardContextUpdated = false;

      const updateBoardContext = async (updates: Partial<BoardContext>) => {
        boardContext = { ...boardContext, ...updates };
        isBoardContextUpdated = true;
        return BoardContextService.updateBoardContext(chatObjectId, updates);
      };

      switch (intent.action) {
        case 'generate_board': {
          const existingContext =
            await BoardContextService.getBoardContext(chatObjectId);
          let shouldReset = true;

          if (
            existingContext?.name ||
            (existingContext?.columns && existingContext.columns.length > 0)
          ) {
            const freshBoardKeywords = [
              'new board',
              'fresh board',
              'from scratch',
              'empty board',
              'start over',
              'brand new',
            ];

            const lowerCaseMessage = userMessage.toLowerCase();
            const explicitlyWantsFresh = freshBoardKeywords.some((keyword) =>
              lowerCaseMessage.includes(keyword.toLowerCase())
            );

            if (!explicitlyWantsFresh) {
              shouldReset = false;

              await this.addMessage(
                chatObjectId,
                MessageRole.SYSTEM,
                'Using existing board as reference for generating improvements.'
              );
            }
          }

          if (shouldReset) {
            boardContext =
              await BoardContextService.resetBoardContext(chatObjectId);
          }

          if (intent.userId) {
            const newBoard = await AIService.generateBoard(
              userMessage,
              intent.userId,
              chatContext
            );

            const updatedBoardContext = {
              name: newBoard.name,
              description: newBoard.description || '',
              columns: newBoard.columns.map((col) => ({
                name: col.name,
                tasks: (col.tasks || []).map((task) => ({
                  title: task.title,
                  description: task.description || '',
                  subtasks: (task.subtasks || []).map((subtask) => ({
                    title: subtask.title,
                    description: subtask.description || '',
                  })),
                })),
              })),
            };

            await updateBoardContext(updatedBoardContext);
            boardContext = { ...boardContext, ...updatedBoardContext };

            actionResult = newBoard;
            const taskCount = newBoard.columns.reduce(
              (total, col) => total + (col.tasks?.length || 0),
              0
            );
            responseContent = `✅ I've created a new board called "${newBoard.name}" with ${newBoard.columns.length} columns: ${newBoard.columns.map((c) => `"${c.name}"`).join(', ')}.
            The board includes ${taskCount} tasks in total.
            Would you like me to:
            • Adjust any column names or workflows?
            • Add more tasks to a specific column?
            • Change the board's structure?`;
          } else {
            responseContent =
              '🔍 Oops! I need to know which user this board belongs to. Could you please sign in or provide your user ID? This helps me save and organize your boards properly.';
          }

          if (responseContent === '') {
            responseContent = `🤔 I want to make sure I understand you correctly. Could you help me by:
            1. Being more specific about what you'd like to achieve
            2. Using action words like "create," "update," or "suggest"
            3. Including any relevant details or constraints

            For example:
            • "Create a project management board for my mobile app"
            • "Help me improve this task description: [your task]"
            • "Break down this feature into smaller tasks: [feature]"`;
          }
          break;
        }

        case 'improve_task':
          try {
            const improvementResult = await AIService.improveTask(
              userMessage,
              boardContext,
              chatContext
            );

            const updatedColumns = JSON.parse(
              JSON.stringify(boardContext.columns)
            );
            updatedColumns[improvementResult.columnIndex].tasks[
              improvementResult.taskIndex
            ] = {
              ...updatedColumns[improvementResult.columnIndex].tasks[
                improvementResult.taskIndex
              ],
              title: improvementResult.title,
              description: improvementResult.description,
            };

            await updateBoardContext({ columns: updatedColumns });
            boardContext = { ...boardContext, columns: updatedColumns };

            actionResult = {
              title: improvementResult.title,
              description: improvementResult.description,
            };
            responseContent = `I've improved the task "${improvementResult.title}" based on your request.`;
          } catch (error) {
            console.error('Error improving task:', error);
            responseContent =
              'I had trouble improving the task. Could you please provide more details about which task you want to improve?';
          }
          break;

        case 'break_down_task':
          if (intent.taskTitle && intent.taskDescription) {
            const subtasksResult = await AIService.breakdownTaskIntoSubtasks(
              userMessage,
              boardContext,
              chatContext
            );

            if (boardContext.columns && boardContext.columns.length > 0) {
              const updatedColumns = boardContext.columns.map((column) => ({
                ...column,
                tasks: column.tasks.map((task) =>
                  task.title === intent.taskTitle
                    ? {
                        ...task,
                        subtasks: subtasksResult.map((st) => ({
                          title: st.title,
                          description: st.description || '',
                        })),
                      }
                    : task
                ),
              }));

              await updateBoardContext({ columns: updatedColumns });
            }

            actionResult = subtasksResult;
            responseContent = `🔨 I've broken down "${intent.taskTitle}" into ${subtasksResult.length} clear steps:\n\n${subtasksResult.map((st, i) => `${i + 1}. ${st.title}`).join('\n')}\n\nWould you like me to:\n• Add more details to any subtask?\n• Set priorities or assignees?\n• Adjust the order of these steps?`;
          } else {
            responseContent =
              'I can help break down a task into subtasks. Which task would you like me to break down?';
          }
          break;

        case 'generate_column':
          try {
            const columnResult = await AIService.generateColumn(
              boardContext,
              userMessage,
              chatContext,
              {
                analyzeExistingPatterns: true,
                position: 'end',
              }
            );

            const newColumn = {
              name: columnResult.name,
              position: boardContext.columns.length,
              tasks: [],
            };

            const updatedColumns = [...boardContext.columns, newColumn];
            await updateBoardContext({ columns: updatedColumns });
            boardContext = { ...boardContext, columns: updatedColumns };

            actionResult = columnResult;
            responseContent = `✅ I've created a new column: "${columnResult.name}". What would you like to do next?\n• Add tasks to this column\n• Create another column\n• Rename this column`;
          } catch (error) {
            console.error('Error generating column:', error);
            responseContent =
              'I had trouble creating a new column. Could you please try again with more details?';
          }
          break;

        case 'generate_multiple_columns':
          try {
            const columns = await AIService.generateMultipleColumns(
              boardContext,
              userMessage,
              chatContext
            );

            if (!columns || columns.length === 0) {
              throw new Error('No columns were generated');
            }

            const updatedColumns = [
              ...boardContext.columns,
              ...columns.map((column) => ({
                name: column.name,
                position: boardContext.columns.length + columns.indexOf(column),
                tasks: [],
              })),
            ];

            await updateBoardContext({ columns: updatedColumns });
            boardContext = { ...boardContext, columns: updatedColumns };

            actionResult = {
              columns: columns.map((col) => ({
                name: col.name,
                tasks: [],
              })),
            };
            const columnNames = columns.map((c) => `"${c.name}"`).join(', ');
            responseContent = `✅ I've added ${columns.length} new columns to your board: ${columnNames}.`;
          } catch (error) {
            console.error('Error generating multiple columns:', error);
            responseContent =
              'I had trouble adding multiple columns. Could you please try again with more specific details?';
          }
          break;

        case 'rename_column':
          try {
            if (!intent.currentColumnName) {
              responseContent = 'Which column would you like to rename?';
              break;
            }

            const columnToRename = boardContext.columns.find(
              (col) =>
                col.name.toLowerCase() ===
                intent.currentColumnName!.toLowerCase()
            );

            if (!columnToRename) {
              responseContent = `I couldn't find a column named "${intent.currentColumnName}". Please check the name and try again.`;
              break;
            }

            const renameResult = await AIService.renameColumn(
              boardContext,
              columnToRename.name,
              userMessage
            );

            const updatedColumns = boardContext.columns.map((col) =>
              col.name === columnToRename.name
                ? { ...col, name: renameResult.name }
                : col
            );

            await updateBoardContext({ columns: updatedColumns });
            boardContext = { ...boardContext, columns: updatedColumns };

            actionResult = renameResult;
            responseContent = `✅ I've renamed the column from "${columnToRename.name}" to "${renameResult.name}".`;
          } catch (error) {
            console.error('Error renaming column:', error);
            responseContent =
              'I had trouble renaming the column. Could you please try again with more details?';
          }
          break;

        case 'move_column':
          try {
            if (!intent.currentColumnName) {
              responseContent = 'Which column would you like to move?';
              break;
            }

            const columnToMove = boardContext.columns.find(
              (col) =>
                col.name.toLowerCase() ===
                intent.currentColumnName!.toLowerCase()
            );

            if (!columnToMove) {
              responseContent = `I couldn't find a column named "${intent.currentColumnName}". Please check the name and try again.`;
              break;
            }

            const moveResult = await AIService.moveColumn(
              boardContext,
              columnToMove.name,
              userMessage
            );

            const currentPos = boardContext.columns.findIndex(
              (col) =>
                col.name.toLowerCase() === columnToMove.name.toLowerCase()
            );

            if (currentPos === -1) {
              throw new Error(
                `Column "${columnToMove.name}" not found in board context`
              );
            }

            const newPos = moveResult.newPosition;

            if (currentPos === newPos) {
              responseContent = `The "${columnToMove.name}" column is already at position ${newPos + 1}.`;
              break;
            }

            const updatedColumns = [...boardContext.columns];
            const [movedColumn] = updatedColumns.splice(currentPos, 1);
            updatedColumns.splice(newPos, 0, movedColumn);
            const columnsWithUpdatedPositions = updatedColumns.map(
              (col, index) => ({
                ...col,
                position: index,
              })
            );

            await updateBoardContext({ columns: columnsWithUpdatedPositions });
            boardContext = {
              ...boardContext,
              columns: columnsWithUpdatedPositions,
            };

            actionResult = { newPosition: newPos };
            responseContent = `✅ I've moved the "${columnToMove.name}" column to position ${newPos + 1}. What would you like to do next?`;
          } catch (error) {
            console.error('Error moving column:', error);
            responseContent =
              'I had trouble moving the column. Could you please try again with more details?';
          }
          break;

        case 'delete_column':
          try {
            if (!intent.currentColumnName) {
              responseContent = 'Which column would you like to delete?';
              break;
            }

            const columnToDelete = boardContext.columns.find(
              (col) =>
                col.name.toLowerCase() ===
                intent.currentColumnName!.toLowerCase()
            );

            if (!columnToDelete) {
              responseContent = `I couldn't find a column named "${intent.currentColumnName}". Please check the name and try again.`;
              break;
            }

            const deleteCheck = await AIService.deleteColumn(
              boardContext,
              columnToDelete.name
            );

            if (!deleteCheck.canDelete) {
              responseContent = `❌ ${deleteCheck.reason || `Cannot delete the "${columnToDelete.name}" column.`}`;
              break;
            }

            const updatedColumns = boardContext.columns
              .filter(
                (col) =>
                  col.name.toLowerCase() !== columnToDelete.name.toLowerCase()
              )
              .map((col, index) => ({
                ...col,
                position: index,
              }));

            await updateBoardContext({ columns: updatedColumns });
            boardContext = {
              ...boardContext,
              columns: updatedColumns,
            };

            responseContent = `✅ I've deleted the "${columnToDelete.name}" column. What would you like to do next?`;
          } catch (error) {
            console.error('Error deleting column:', error);
            responseContent =
              'I had trouble deleting the column. Could you please try again with more details?';
          }
          break;

        case 'delete_subtask':
          try {
            const { columnIndex, taskIndex, subtaskIndex } =
              await AIService.deleteSubtask(
                userMessage,
                boardContext,
                chatContext
              );

            const updatedColumns = [...boardContext.columns];
            const task = updatedColumns[columnIndex].tasks[taskIndex];

            if (task.subtasks && task.subtasks.length > subtaskIndex) {
              task.subtasks.splice(subtaskIndex, 1);

              await updateBoardContext({ columns: updatedColumns });
              boardContext = { ...boardContext, columns: updatedColumns };

              responseContent = `✅ I've deleted the subtask. What would you like to do next?`;
            } else {
              throw new Error('Subtask not found');
            }
          } catch (error) {
            console.error('Error deleting subtask:', error);
            responseContent =
              'I had trouble finding the subtask to delete. Could you please be more specific about which subtask you want to remove?';
          }
          break;

        case 'improve_subtask':
          try {
            const { columnIndex, taskIndex, subtaskIndex, title, description } =
              await AIService.improveSubtask(
                boardContext,
                userMessage,
                chatContext
              );

            const updatedColumns = [...boardContext.columns];
            const task = updatedColumns[columnIndex].tasks[taskIndex];

            if (!task.subtasks) {
              task.subtasks = [];
            }

            task.subtasks[subtaskIndex] = {
              ...task.subtasks[subtaskIndex],
              title,
              description,
            };

            await updateBoardContext({ columns: updatedColumns });
            boardContext = { ...boardContext, columns: updatedColumns };

            responseContent = `✅ I've updated the subtask "${title}" with your improvements. What would you like to do next?`;
          } catch (error) {
            console.error('Error improving subtask:', error);
            responseContent =
              "I had trouble improving the subtask. Could you please provide more details about what you'd like to change?";
          }
          break;

        case 'delete_task':
          try {
            const { columnIndex, taskIndex } = await AIService.deleteTask(
              userMessage,
              boardContext,
              chatContext
            );

            const taskToDelete =
              boardContext.columns[columnIndex].tasks[taskIndex];

            const updatedColumns = [...boardContext.columns];

            updatedColumns[columnIndex].tasks = updatedColumns[
              columnIndex
            ].tasks.filter((_, index) => index !== taskIndex);

            await updateBoardContext({ columns: updatedColumns });
            boardContext = { ...boardContext, columns: updatedColumns };

            responseContent = `✅ I've deleted the task "${taskToDelete.title}" from the "${updatedColumns[columnIndex].name}" column. What would you like to do next?`;
          } catch (error) {
            console.error('Error deleting task:', error);
            responseContent =
              'I had trouble identifying or deleting the task. Could you please be more specific about which task you want to delete?';
          }
          break;

        case 'generate_task':
          try {
            const newTask = await AIService.generateTask(
              boardContext,
              userMessage,
              chatContext
            );

            let targetColumn = boardContext.columns.find((col) =>
              col.name.trim().toUpperCase().includes('BACKLOG')
            );

            if (!targetColumn) {
              targetColumn = boardContext.columns.find((col) =>
                col.name.trim().toUpperCase().includes('TODO')
              );
            }

            if (!targetColumn && boardContext.columns.length > 0) {
              targetColumn = boardContext.columns[0];
            }

            if (!targetColumn) {
              throw new Error('No columns available to add the task');
            }

            const updatedColumns = boardContext.columns.map((col) => {
              if (col.name === targetColumn!.name) {
                return {
                  ...col,
                  tasks: [...(col.tasks || []), newTask],
                };
              }
              return col;
            });

            await updateBoardContext({ columns: updatedColumns });
            boardContext = { ...boardContext, columns: updatedColumns };

            actionResult = newTask;
            responseContent = `✅ I've created a new task: "${newTask.title}" in the "${targetColumn.name}" column.`;
          } catch (error) {
            console.error('Error generating task:', error);
            responseContent =
              'I had trouble creating a new task. Could you please try again with more details?';
          }
          break;

        case 'move_task':
          try {
            if (!intent.taskTitle) {
              responseContent = 'Which task would you like to move?';
              break;
            }

            if (!intent.columnName) {
              responseContent =
                'Which column would you like to move the task to?';
              break;
            }

            let sourceColumn:
              | { name: string; tasks: PreviewTask[] }
              | undefined;
            let taskToMove: PreviewTask | undefined;

            for (const column of boardContext.columns) {
              const task = column.tasks.find(
                (t) => t.title.toLowerCase() === intent.taskTitle!.toLowerCase()
              );
              if (task) {
                sourceColumn = column;
                taskToMove = task;
                break;
              }
            }

            if (!sourceColumn || !taskToMove) {
              responseContent = `I couldn't find a task named "${intent.taskTitle}" in any column.`;
              break;
            }

            const targetColumn = boardContext.columns.find(
              (col) =>
                col.name.toLowerCase() === intent.columnName!.toLowerCase()
            );

            if (!targetColumn) {
              responseContent = `I couldn't find a column named "${intent.columnName}".`;
              break;
            }

            if (sourceColumn.name === targetColumn.name) {
              responseContent = `The task "${taskToMove.title}" is already in the "${targetColumn.name}" column.`;
              break;
            }
            const taskToMoveDefined = taskToMove!;

            const moveResult = await AIService.moveTask(
              boardContext,
              taskToMoveDefined.title,
              targetColumn.name,
              userMessage
            );

            const updatedColumns = boardContext.columns.map((col) => {
              if (col.name === sourceColumn!.name) {
                return {
                  ...col,
                  tasks: col.tasks.filter(
                    (t) => t.title !== taskToMoveDefined.title
                  ),
                };
              }

              if (col.name === targetColumn.name) {
                return {
                  ...col,
                  tasks: [...col.tasks, taskToMoveDefined],
                };
              }
              return col;
            });

            await updateBoardContext({ columns: updatedColumns });
            boardContext = { ...boardContext, columns: updatedColumns };

            actionResult = moveResult;

            responseContent = `✅ I've moved the task "${moveResult.taskTitle}" from "${moveResult.sourceColumnName}" to "${moveResult.targetColumnName}".`;
          } catch (error) {
            console.error('Error moving task:', error);
            responseContent =
              error instanceof Error
                ? `I couldn't move that task: ${error.message}`
                : 'An error occurred while trying to move the task. Please try again.';
          }
          break;

        default: {
          const chatContext = await this.getChatContext(chatObjectId);

          responseContent = await AIService.generateGeneralResponse(
            userMessage,
            chatContext,
            boardContext
          );

          if (
            !['?', '!'].some((char) => responseContent.trim().endsWith(char))
          ) {
            responseContent += ' What would you like to do next?';
          }
          break;
        }
      }

      const assistantMessage = await this.addMessage(
        chatObjectId,
        MessageRole.ASSISTANT,
        responseContent
      );

      if (isBoardContextUpdated) {
        boardContext = await BoardContextService.getBoardContext(chatObjectId);
      }

      return {
        message: assistantMessage,
        action: intent.action,
        result: actionResult,
        boardContext: isBoardContextUpdated ? boardContext : undefined,
      };
    } catch (error) {
      console.error('Error processing user message:', error);
      throw error;
    }
  }

  /**
   * Determine the intent of a user message using LLM classification
   * @param message - The user's message
   * @param userId - The ID of the user
   * @returns The detected intent and relevant context
   */
  private async determineMessageIntent(
    message: string,
    userId: mongoose.Types.ObjectId,
    chatContext: ChatContext,
    boardContext: BoardContext
  ): Promise<MessageIntent> {
    try {
      const boardSummary = {
        columns: boardContext.columns.map((col) => ({
          name: col.name,
          taskCount: col.tasks.length,
        })),
      };

      const systemPrompt = {
        role: 'system' as const,
        content: `You are an intent classifier for a Kanban board application called Flow Forge.
        Current board state:
        ${JSON.stringify(boardSummary, null, 2)}

        Analyze the conversation and the user's latest message to determine the intent.
        
        Available intents:
        - generate_board: Create a new board
        - improve_task: Improve a task description
        - break_down_task: Break down a task into subtasks
        - generate_column: Add a new column
        - generate_multiple_columns: Add multiple columns
        - rename_column: Rename an existing column
        - move_column: Move a column to a different position
        - move_task: Move a task to a different column
        - delete_column: Delete a column
        - generate_task: Create a new task
        - delete_task: Delete a task
        - delete_subtask: Delete a subtask from a task
        - improve_subtask: Improve a subtask's title or description
        - general_conversation: General queries
        
        Pay attention to the conversation context to handle follow-up messages.
        For example, if the assistant just asked "Which task?" the next message is likely the task name.
        
        Respond with a JSON object containing:
        - intent: one of the intent names above
        - taskTitle: extracted task title if applicable
        - taskDescription: extracted task description if applicable
        - columnName: suggested column name if applicable
        - currentColumnName: name of the column to rename/move/delete if applicable`,
      };

      const messages = [
        systemPrompt,
        ...chatContext,
        { role: 'user' as const, content: message },
      ];

      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('OpenAI response content is null');
      }

      const classification = JSON.parse(content);

      // Map the classification to our MessageIntent interface
      // The LLM returns an intent type and optional context fields
      const intent: MessageIntent = {
        action: (classification.intent || 'general_conversation') as
          | 'generate_board'
          | 'improve_task'
          | 'break_down_task'
          | 'generate_column'
          | 'generate_multiple_columns'
          | 'rename_column'
          | 'move_column'
          | 'delete_column'
          | 'delete_task'
          | 'generate_task'
          | 'move_task'
          | 'improve_subtask'
          | 'delete_subtask'
          | 'general_conversation',
        userId,
      };

      // Extract optional context fields that the LLM might have identified
      // These fields provide additional details about the user's intent
      if (classification.taskTitle) {
        intent.taskTitle = classification.taskTitle; // e.g., "login form" in "Improve the login form"
      }

      if (classification.taskDescription) {
        intent.taskDescription = classification.taskDescription; // Detailed description of the task
      }

      if (classification.columnName) {
        intent.columnName = classification.columnName; // Target column for the action
      }

      if (classification.currentColumnName) {
        intent.currentColumnName = classification.currentColumnName; // Original column name for move/rename operations
      }

      return intent;
    } catch (error) {
      console.error('Error classifying intent with LLM:', error);
      return {
        action: 'general_conversation',
        userId,
      };
    }
  }

  /**
   * Gets the chat context for a conversation
   * @param chatId - The ID of the chat
   * @returns Array of message objects with role and content
   */
  private async getChatContext(
    chatId: string | mongoose.Types.ObjectId
  ): Promise<ChatContext> {
    const recentMessages = await this.getChatMessages(chatId);
    return recentMessages
      .slice(-10) // Get last 10 messages for context
      .map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
  }
}

export default new ChatService();
