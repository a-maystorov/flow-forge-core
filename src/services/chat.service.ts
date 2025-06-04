import mongoose from 'mongoose';
import { openai } from '../config/openai';
import Chat from '../models/chat.model';
import Message, { MessageRole } from '../models/message.model';
import { PreviewBoard, PreviewSubtask } from '../types/ai.types';
import AIService from './ai.service';

/**
 * Interface for message intent results
 */
interface MessageIntent {
  action:
    | 'generate_board'
    | 'improve_task'
    | 'break_down_task'
    | 'general_conversation';
  userId?: mongoose.Types.ObjectId;
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

      const chat = new Chat({
        userId: userObjectId,
        title: initialTitle,
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
   * @param userMessage - The message from the user
   * @returns The AI response message
   */
  async processUserMessage(
    chatId: string | mongoose.Types.ObjectId,
    userMessage: string
  ) {
    try {
      // Convert chatId to ObjectId if it's a string
      const chatObjectId =
        typeof chatId === 'string'
          ? new mongoose.Types.ObjectId(chatId)
          : chatId;

      // Step 1: Save the user message
      await this.addMessage(chatObjectId, MessageRole.USER, userMessage);

      // Step 2: Determine the intent of the user message
      const intent = await this.determineMessageIntent(userMessage);

      // Step 3: Generate an appropriate response based on the intent
      let responseContent = '';
      let actionResult:
        | PreviewBoard
        | { title: string; description: string }
        | PreviewSubtask[]
        | null = null;

      switch (intent.action) {
        case 'generate_board':
          // Generate a new board based on the user's request
          if (intent.userId) {
            const boardResult = await this.handleBoardGeneration(
              userMessage,
              intent.userId
            );
            actionResult = boardResult;
            responseContent = `I've created a board suggestion for "${boardResult.name}". It includes ${boardResult.columns.length} columns with tasks. Would you like me to modify anything about this board?`;
          } else {
            responseContent =
              'I need a user ID to create a board. Please try again.';
          }
          break;

        case 'improve_task':
          // Improve a task description
          if (intent.taskTitle && intent.taskDescription) {
            const taskResult = await this.handleTaskImprovement(
              intent.taskTitle,
              intent.taskDescription,
              userMessage
            );
            actionResult = taskResult;
            responseContent = `I've improved the task "${taskResult.title}". Is there anything else you'd like me to adjust about this task?`;
          } else {
            responseContent =
              "I'd be happy to improve a task for you. Could you please specify which task you'd like me to work on?";
          }
          break;

        case 'break_down_task':
          // Break down a task into subtasks
          if (intent.taskTitle && intent.taskDescription) {
            const subtasksResult = await this.handleTaskBreakdown(
              intent.taskTitle,
              intent.taskDescription,
              userMessage
            );
            actionResult = subtasksResult;
            responseContent = `I've broken down the task "${intent.taskTitle}" into ${subtasksResult.length} subtasks. Would you like me to explain any of these in more detail?`;
          } else {
            responseContent =
              'I can help break down a task into subtasks. Which task would you like me to break down?';
          }
          break;

        default:
          // General conversation
          responseContent =
            "I'm your Flow Forge assistant. I can help you create boards, improve tasks, break down tasks into subtasks, and more. What would you like help with today?";
      }

      // Step 4: Save the assistant's response
      const assistantMessage = await this.addMessage(
        chatObjectId,
        MessageRole.ASSISTANT,
        responseContent
      );

      return {
        message: assistantMessage,
        action: intent.action,
        result: actionResult,
      };
    } catch (error) {
      console.error('Error processing user message:', error);
      throw error;
    }
  }

  /**
   * Determine the intent of a user message using LLM classification
   * @param message - The user's message
   * @returns The detected intent and relevant context
   */
  private async determineMessageIntent(
    message: string
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
      };

      // Add any extracted context
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
      };
    }
  }

  /**
   * Handle the generation of a new board
   * @param userMessage - The user's message/prompt
   * @param userId - The ID of the user
   * @returns The generated board
   */
  private async handleBoardGeneration(
    userMessage: string,
    userId: mongoose.Types.ObjectId
  ) {
    return await AIService.generateBoardSuggestion(userMessage, userId);
  }

  /**
   * Handle improving a task description
   * @param taskTitle - The current title of the task
   * @param taskDescription - The current description of the task
   * @param userRequest - The user's request for improvement
   * @param boardContext - The board context for the task
   * @returns The improved task
   */
  private async handleTaskImprovement(
    taskTitle: string,
    taskDescription: string,
    userRequest: string
  ) {
    return await AIService.improveTaskDescription(
      taskTitle,
      taskDescription,
      userRequest
    );
  }

  /**
   * Handle breaking down a task into subtasks
   * @param taskTitle - The title of the task to break down
   * @param taskDescription - The description of the task
   * @param userRequest - The user's request for breaking down
   * @returns The generated subtasks
   */
  private async handleTaskBreakdown(
    taskTitle: string,
    taskDescription: string,
    userRequest: string
  ) {
    return await AIService.breakdownTaskIntoSubtasks(
      taskTitle,
      taskDescription,
      userRequest
    );
  }
}

export default new ChatService();
