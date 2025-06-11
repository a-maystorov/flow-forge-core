import mongoose from 'mongoose';
import { openai } from '../config/openai';
import Chat from '../models/chat.model';
import Message, { MessageRole } from '../models/message.model';
import { ChatContext, PreviewBoard, PreviewSubtask } from '../types/ai.types';
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
   * @param userId - The ID of the user
   * @param userMessage - The message from the user
   * @returns The AI response message
   */
  async processUserMessage(
    chatId: string | mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
    userMessage: string
  ) {
    try {
      // Convert chatId to ObjectId if it's a string
      const chatObjectId =
        typeof chatId === 'string'
          ? new mongoose.Types.ObjectId(chatId)
          : chatId;

      await this.addMessage(chatObjectId, MessageRole.USER, userMessage);

      const intent = await this.determineMessageIntent(userMessage, userId);

      let responseContent = '';
      let actionResult:
        | PreviewBoard
        | { title: string; description: string }
        | PreviewSubtask[]
        | null = null;

      switch (intent.action) {
        case 'generate_board':
          if (intent.userId) {
            const chatContext = await this.getChatContext(chatObjectId);
            const boardResult = await this.handleBoardGeneration(
              userMessage,
              intent.userId,
              chatContext
            );
            actionResult = boardResult;
            const taskCount = boardResult.columns.reduce(
              (total, col) => total + (col.tasks?.length || 0),
              0
            );
            responseContent = `✅ I've created a new board called "${boardResult.name}" with ${boardResult.columns.length} columns: ${boardResult.columns.map((c) => `"${c.name}"`).join(', ')}.\n\nThe board includes ${taskCount} tasks in total.\n\nWould you like me to:\n• Adjust any column names or workflows?\n• Add more tasks to a specific column?\n• Change the board's structure?`;
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
          if (intent.taskTitle && intent.taskDescription) {
            const chatContext = await this.getChatContext(chatObjectId);
            const taskResult = await this.handleTaskImprovement(
              intent.taskTitle,
              intent.taskDescription,
              userMessage,
              chatContext
            );
            actionResult = taskResult;
            responseContent = `✨ I've enhanced the task "${taskResult.title}". Here's what I've done:\n\n• **New Title**: ${taskResult.title}\n• **Updated Description**: ${taskResult.description}\n\nWould you like me to:\n• Make it more detailed?\n• Break it down into smaller steps?\n• Adjust the priority or add labels?`;
          } else {
            responseContent =
              "I'd be happy to improve a task for you. Could you please specify which task you'd like me to work on?";
          }
          break;

        case 'break_down_task':
          if (intent.taskTitle && intent.taskDescription) {
            const chatContext = await this.getChatContext(chatObjectId);
            const subtasksResult = await this.handleTaskBreakdown(
              intent.taskTitle,
              intent.taskDescription,
              userMessage,
              chatContext
            );
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

          // Add a friendly follow-up if the response doesn't end with a question or exclamation
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
   * Handle the generation of a new board
   * @param userMessage - The user's message/prompt
   * @param userId - The ID of the user
   * @param chatContext - The chat context for the user
   * @returns The generated board
   */
  private async handleBoardGeneration(
    userMessage: string,
    userId: mongoose.Types.ObjectId,
    chatContext: ChatContext
  ) {
    return await AIService.generateBoardSuggestion(
      userMessage,
      userId,
      chatContext
    );
  }

  /**
   * Handle improving a task description
   * @param taskTitle - The current title of the task
   * @param taskDescription - The current description of the task
   * @param userRequest - The user's request for improvement
   * @param chatContext - The chat context for the user
   * @returns The improved task
   */
  private async handleTaskImprovement(
    taskTitle: string,
    taskDescription: string,
    userRequest: string,
    chatContext: ChatContext
  ) {
    return await AIService.improveTaskDescription(
      taskTitle,
      taskDescription,
      userRequest,
      chatContext
    );
  }

  /**
   * Handle breaking down a task into subtasks
   * @param taskTitle - The title of the task to break down
   * @param taskDescription - The description of the task
   * @param userRequest - The user's request for breaking down
   * @param chatContext - The chat context for the user
   * @returns The generated subtasks
   */
  private async handleTaskBreakdown(
    taskTitle: string,
    taskDescription: string,
    userRequest: string,
    chatContext: ChatContext
  ) {
    return await AIService.breakdownTaskIntoSubtasks(
      taskTitle,
      taskDescription,
      userRequest,
      chatContext
    );
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
