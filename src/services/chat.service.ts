import mongoose from 'mongoose';
import { openai } from '../config/openai';
import Chat from '../models/chat.model';
import Message, { MessageRole } from '../models/message.model';
import {
  BoardContext,
  ChatContext,
  PreviewBoard,
  PreviewSubtask,
} from '../types/ai.types';
import AIService from './ai.service';
import BoardContextService from './board-context.service';

/**
 * Interface for message intent results
 */
interface MessageIntent {
  action:
    | 'generate_board'
    | 'improve_task'
    | 'break_down_task'
    | 'general_conversation';
  userId: mongoose.Types.ObjectId;
  taskTitle?: string;
  taskDescription?: string;
}

/**
 * Service to handle chat conversations and AI interactions
 */
class ChatService {
  /**
   * Creates a new chat conversation
   * @param userId - The ID of the user creating the chat
   * @param initialTitle - Optional initial title for the chat
   * @returns The newly created chat
   */
  async createChat(
    userId: string | mongoose.Types.ObjectId,
    initialTitle: string = 'New Conversation'
  ) {
    try {
      const userObjectId =
        typeof userId === 'string'
          ? new mongoose.Types.ObjectId(userId)
          : userId;

      // Initialize with empty board context
      const boardContext = BoardContextService.getEmptyBoardContext();

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
      // Convert chatId to ObjectId if it's a string
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

      // Update the lastMessageAt timestamp on the chat
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
      // Convert chatId to ObjectId if it's a string
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
   * @returns The AI response message
   */
  async processUserMessage(
    chatId: string | mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
    userMessage: string
  ) {
    // Convert chatId to ObjectId if it's a string
    const chatObjectId =
      typeof chatId === 'string' ? new mongoose.Types.ObjectId(chatId) : chatId;

    try {
      await this.addMessage(chatObjectId, MessageRole.USER, userMessage);

      let boardContext =
        await BoardContextService.getBoardContext(chatObjectId);

      const chatContext = await this.getChatContext(chatObjectId);

      const intent = await this.determineMessageIntent(userMessage, userId);

      let responseContent = '';
      let actionResult:
        | PreviewBoard
        | { title: string; description: string }
        | PreviewSubtask[]
        | null = null;

      let isBoardContextUpdated = false;

      const updateBoardContext = async (updates: Partial<BoardContext>) => {
        boardContext = { ...boardContext, ...updates };
        isBoardContextUpdated = true;
        return BoardContextService.updateBoardContext(chatObjectId, updates);
      };

      switch (intent.action) {
        case 'generate_board':
          if (intent.userId) {
            const newBoard = await AIService.generateBoardSuggestion(
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
            responseContent = `✅ I've created a new board called "${newBoard.name}" with ${newBoard.columns.length} columns: ${newBoard.columns.map((c) => `"${c.name}"`).join(', ')}.\n\nThe board includes ${taskCount} tasks in total.\n\nWould you like me to:\n• Adjust any column names or workflows?\n• Add more tasks to a specific column?\n• Change the board's structure?`;
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
              intent.taskTitle,
              intent.taskDescription,
              userMessage,
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

        default: {
          const chatContext = await this.getChatContext(chatObjectId);
          responseContent = await AIService.generateGeneralResponse(
            userMessage,
            chatContext
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
    userId: mongoose.Types.ObjectId
  ): Promise<MessageIntent> {
    try {
      const response = await openai.client.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an intent classifier for a Kanban board application called Flow Forge.
            Analyze the user's message and classify it into exactly one of these intents:
            1. generate_board - User wants to create a new board
            2. improve_task - User wants to improve a task description
            3. break_down_task - User wants to break down a task into subtasks
            4. general_conversation - General queries not matching above intents
            
            Also extract any relevant context like board name, task title, etc.
            
            Respond with a valid JSON object containing:
            {
              "intent": "one_of_the_above_intents",
              "taskTitle": "extracted task title if applicable",
              "taskDescription": "extracted task description if applicable",
              "boardName": "extracted board name if applicable" 
            }`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('OpenAI response content is null');
      }

      const classification = JSON.parse(content);

      // Map the classification to our MessageIntent interface
      const intent: MessageIntent = {
        action: (classification.intent || 'general_conversation') as
          | 'generate_board'
          | 'improve_task'
          | 'break_down_task'
          | 'general_conversation',
        userId,
      };

      if (classification.taskTitle) {
        intent.taskTitle = classification.taskTitle;
      }

      if (classification.taskDescription) {
        intent.taskDescription = classification.taskDescription;
      }

      return intent;
    } catch (error) {
      console.error('Error classifying intent with LLM:', error);
      // If LLM classification fails, return general conversation as default
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
