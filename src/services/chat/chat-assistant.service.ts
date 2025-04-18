import { Types } from 'mongoose';
import {
  ChatCompletionAssistantMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/chat';
import { socketService } from '../../config/socket';
import {
  BoardSuggestion,
  TaskBreakdownSuggestion,
  TaskImprovementSuggestion,
} from '../../models/suggestion.model';
import { boardAdapter } from '../ai/adapters/board.adapter';
import { taskBreakdownAdapter } from '../ai/adapters/task-breakdown.adapter';
import { taskImprovementAdapter } from '../ai/adapters/task-improvement.adapter';
import { assistantService } from '../ai/assistant.service';
import { openAIService } from '../ai/openai.service';
import { suggestionService } from '../suggestion/suggestion.service';
import { chatService } from './chat.service';
import { ChatIntent, intentService } from './intent.service';

// Constants for chat intents
const CHAT_INTENTS = {
  GENERAL_CONVERSATION: 'general_question' as ChatIntent,
  CREATE_BOARD: 'board_suggestion' as ChatIntent,
  BREAKDOWN_TASK: 'task_breakdown' as ChatIntent,
  IMPROVE_TASK: 'task_improvement' as ChatIntent,
  UNKNOWN: 'unknown' as ChatIntent,
};

interface ProcessMessageResult {
  responseMessage: {
    content: string;
  };
  detectedIntent: ChatIntent;
  suggestions: {
    boardSuggestion?: BoardSuggestion;
    taskBreakdown?: TaskBreakdownSuggestion;
    taskImprovement?: TaskImprovementSuggestion;
  };
  confidence: number;
  suggestionId?: string;
}

/**
 * Service to handle AI assistant chat functionality
 */
class ChatAssistantService {
  constructor() {}

  /**
   * Process a user message in a chat session
   * @param sessionId ID of the chat session
   * @param message User message content
   * @returns Response message and any suggestions generated
   */
  async processMessage(
    sessionId: Types.ObjectId | string,
    message: string
  ): Promise<ProcessMessageResult> {
    // Get conversation context
    const conversationContext =
      await chatService.getConversationContext(sessionId);

    // Add the user message to the chat session
    const userMessage = await chatService.addMessage({
      sessionId,
      role: 'user',
      content: message,
    });

    // Emit event for real-time updates
    if (typeof sessionId === 'string') {
      socketService.emitToChatSession(sessionId, 'messageAdded', userMessage);
    } else {
      socketService.emitToChatSession(
        sessionId.toString(),
        'messageAdded',
        userMessage
      );
    }

    // Get the chat session for user ID
    const chatSession = await chatService.getChatSession(sessionId);

    if (!chatSession) {
      throw new Error('Chat session not found');
    }

    // Default result structure
    const result: ProcessMessageResult = {
      responseMessage: {
        content: '',
      },
      detectedIntent: CHAT_INTENTS.GENERAL_CONVERSATION,
      suggestions: {},
      confidence: 0,
    };

    // Detect intent
    const intentResult = await intentService.detectIntent(message);
    result.detectedIntent = intentResult.intent;
    result.confidence = intentResult.confidence;

    // Generate a conversational response based on intent
    let conversationalResponse = '';

    try {
      // Handle intent
      switch (intentResult.intent) {
        case CHAT_INTENTS.CREATE_BOARD:
          if (intentResult.confidence >= 0.6) {
            // Extract project description from message
            const projectDescription = message;
            // Generate board suggestion using AI
            const boardSuggestion =
              await this.generateBoardSuggestion(projectDescription);

            if (boardSuggestion) {
              // Store the suggestion in the database
              const storedSuggestion =
                await suggestionService.createBoardSuggestion(
                  chatSession.userId,
                  sessionId,
                  boardAdapter.toSuggestionModel(boardSuggestion),
                  message
                );

              // Properly handle Mongoose ObjectId
              const suggestionId = (
                storedSuggestion._id as Types.ObjectId
              ).toString();
              result.suggestionId = suggestionId;
              result.suggestions.boardSuggestion =
                boardAdapter.toSuggestionModel(boardSuggestion);

              conversationalResponse = this.formatBoardSuggestionResponse(
                boardAdapter.toSuggestionModel(boardSuggestion),
                suggestionId
              );
            } else {
              conversationalResponse =
                "I'm sorry, I wasn't able to generate a board suggestion. Could you provide more details about your project?";
            }
          } else {
            conversationalResponse =
              "I'd be happy to suggest a board layout for your project. Could you tell me a bit more about what you're working on?";
          }
          break;

        case CHAT_INTENTS.BREAKDOWN_TASK:
          if (intentResult.confidence >= 0.6) {
            // Generate task breakdown using AI
            const taskBreakdown = await this.generateTaskBreakdown(message);

            if (taskBreakdown) {
              // Store the suggestion in the database
              const storedSuggestion =
                await suggestionService.createTaskBreakdownSuggestion(
                  chatSession.userId,
                  sessionId,
                  taskBreakdownAdapter.toSuggestionModel(taskBreakdown),
                  message
                );

              // Properly handle Mongoose ObjectId
              const suggestionId = (
                storedSuggestion._id as Types.ObjectId
              ).toString();
              result.suggestionId = suggestionId;
              result.suggestions.taskBreakdown =
                taskBreakdownAdapter.toSuggestionModel(taskBreakdown);

              conversationalResponse = this.formatTaskBreakdownResponse(
                taskBreakdownAdapter.toSuggestionModel(taskBreakdown),
                suggestionId
              );
            } else {
              conversationalResponse =
                "I'm sorry, I wasn't able to break down that task. Could you provide more details about what the task involves?";
            }
          } else {
            conversationalResponse =
              "I'd be happy to help break down a task into subtasks. Could you describe the task in more detail?";
          }
          break;

        case CHAT_INTENTS.IMPROVE_TASK:
          if (intentResult.confidence >= 0.6) {
            // Extract task title and description (if any)
            const taskTitle = message;
            const taskDescription = '';

            // Generate task improvement using AI
            const taskImprovement = await this.improveTaskDescription(
              taskTitle,
              taskDescription
            );

            if (taskImprovement) {
              // Store the suggestion in the database
              const storedSuggestion =
                await suggestionService.createTaskImprovementSuggestion(
                  chatSession.userId,
                  sessionId,
                  taskImprovementAdapter.toSuggestionModel(
                    taskImprovement,
                    taskTitle,
                    taskDescription
                  ),
                  message
                );

              // Properly handle Mongoose ObjectId
              const suggestionId = (
                storedSuggestion._id as Types.ObjectId
              ).toString();
              result.suggestionId = suggestionId;
              result.suggestions.taskImprovement =
                taskImprovementAdapter.toSuggestionModel(
                  taskImprovement,
                  taskTitle,
                  taskDescription
                );

              conversationalResponse = this.formatTaskImprovementResponse(
                taskTitle,
                taskDescription,
                taskImprovementAdapter.toSuggestionModel(
                  taskImprovement,
                  taskTitle,
                  taskDescription
                ),
                suggestionId
              );
            } else {
              conversationalResponse =
                "I'm sorry, I wasn't able to improve that task. Could you provide more details?";
            }
          } else {
            conversationalResponse =
              "I'd be happy to help improve that task description. Could you tell me more about what the task involves?";
          }
          break;

        default:
          // Generate a generic conversational response using OpenAI
          conversationalResponse = await this.generateConversationalResponse(
            message,
            conversationContext
          );
          break;
      }
    } catch (error) {
      console.error('Error processing message intent:', error);
      conversationalResponse =
        "I'm sorry, I encountered an error while processing your request. Please try again.";
    }

    // Add the assistant response to the chat session
    const assistantMessage = await chatService.addMessage({
      sessionId,
      role: 'assistant',
      content: conversationalResponse,
    });

    // Emit event for real-time updates
    if (typeof sessionId === 'string') {
      socketService.emitToChatSession(
        sessionId,
        'messageAdded',
        assistantMessage
      );
    } else {
      socketService.emitToChatSession(
        sessionId.toString(),
        'messageAdded',
        assistantMessage
      );
    }

    // Set the response message
    result.responseMessage = {
      content: conversationalResponse,
    };

    return result;
  }

  /**
   * Generate a conversational response using OpenAI
   * @param message User message
   * @param conversationContext Conversation context
   * @returns Conversational response
   */
  private async generateConversationalResponse(
    message: string,
    conversationContext: { role: string; content: string }[]
  ): Promise<string> {
    try {
      // Create a system prompt for conversational responses
      const systemPrompt = {
        role: 'system',
        content: `You are Flow Forge AI Assistant, a helpful AI for a project management application.
        
Respond to the user in a friendly, professional manner. Keep your responses concise and focused on project management topics when possible.

You can help with:
- Project and task management advice
- Workflow organization
- Productivity tips
- Explaining features
- Suggesting improvements for tasks and workflows

Remember that you're part of a project management tool, so try to be helpful and relevant.`,
      } as ChatCompletionSystemMessageParam;

      // Convert conversation context to compatible format
      const messages = [
        systemPrompt,
        ...conversationContext.map((msg) => {
          if (msg.role === 'user') {
            return {
              role: 'user',
              content: msg.content,
            } as ChatCompletionUserMessageParam;
          } else {
            return {
              role: 'assistant',
              content: msg.content,
            } as ChatCompletionAssistantMessageParam;
          }
        }),
      ];

      // Generate completion
      const completion = await openAIService.generateChatCompletion(messages, {
        temperature: 0.7, // Higher temperature for more creative responses
        maxTokens: 500,
      });

      // Extract response content
      if (completion.choices?.length > 0) {
        return (
          completion.choices[0].message.content ||
          "I'm sorry, I couldn't generate a helpful response at the moment."
        );
      }

      return 'I apologize, but I am having trouble processing your request right now.';
    } catch (error) {
      console.error('Error generating conversational response:', error);
      return 'I encountered an error while generating a response. Please try again.';
    }
  }

  private async generateBoardSuggestion(projectDescription: string) {
    return assistantService.generateBoardSuggestion(projectDescription);
  }

  private async generateTaskBreakdown(taskDescription: string) {
    return assistantService.generateTaskBreakdown(taskDescription);
  }

  private async improveTaskDescription(title: string, description: string) {
    return assistantService.improveTaskDescription(title, description);
  }

  /**
   * Format a board suggestion into a user-friendly response
   * @param suggestion Board suggestion
   * @param suggestionId Suggestion ID
   * @returns Formatted response
   */
  private formatBoardSuggestionResponse(
    suggestion: BoardSuggestion,
    suggestionId: string
  ): string {
    let response = `Here's a board layout for "${suggestion.boardName}":\n\n`;

    // Add each column
    suggestion.columns.forEach((column) => {
      response += `**${column.name}**\n`;
      if (column.tasks.length === 0) {
        response += 'No tasks yet\n';
      } else {
        column.tasks.forEach((task) => {
          response += `- ${task.title}\n`;
        });
      }
      response += '\n';
    });

    response +=
      '\nWould you like to use this board structure or make some changes to it? You can accept or reject this suggestion.';
    response += `\n\n[Accept Suggestion](/api/suggestions/${suggestionId}/accept) | [Reject Suggestion](/api/suggestions/${suggestionId}/reject)`;

    return response;
  }

  /**
   * Format a task breakdown into a user-friendly response
   * @param breakdown Task breakdown with subtasks
   * @param suggestionId Suggestion ID
   * @returns Formatted response
   */
  private formatTaskBreakdownResponse(
    breakdown: TaskBreakdownSuggestion,
    suggestionId: string
  ): string {
    let response = `I've broken down "${breakdown.taskTitle}" into subtasks:\n\n`;

    breakdown.subtasks.forEach((subtask, index) => {
      response += `${index + 1}. **${subtask.title}**\n`;
      response += `   ${subtask.description}\n\n`;
    });

    response += 'Would you like to use these subtasks or make some changes?';
    response += `\n\n[Accept Suggestion](/api/suggestions/${suggestionId}/accept) | [Reject Suggestion](/api/suggestions/${suggestionId}/reject)`;

    return response;
  }

  /**
   * Format a task improvement into a user-friendly response
   * @param originalTitle Original task title
   * @param originalDescription Original task description
   * @param improvement Task improvement suggestion
   * @param suggestionId Suggestion ID
   * @returns Formatted response
   */
  private formatTaskImprovementResponse(
    originalTitle: string,
    originalDescription: string,
    improvement: TaskImprovementSuggestion,
    suggestionId: string
  ): string {
    let response = `I've improved your task:\n\n`;

    response += `**Original Title:**\n${originalTitle}\n\n`;
    response += `**Improved Title:**\n${improvement.improvedTask.title}\n\n`;

    if (originalDescription) {
      response += `**Original Description:**\n${originalDescription}\n\n`;
    }

    response += `**Improved Description:**\n${improvement.improvedTask.description}\n\n`;

    if (improvement.reasoning) {
      response += `**Reasoning:**\n${improvement.reasoning}\n\n`;
    }

    response += 'Would you like to use these improvements?';
    response += `\n\n[Accept Suggestion](/api/suggestions/${suggestionId}/accept) | [Reject Suggestion](/api/suggestions/${suggestionId}/reject)`;

    return response;
  }

  /**
   * Format a task improvement for a specific task from a board suggestion
   * @param originalTitle Original task title
   * @param originalDescription Original task description
   * @param improvement Task improvement suggestion
   * @param columnName Column name where the task exists
   * @param suggestionId Suggestion ID
   * @returns Formatted response
   */
  private formatSpecificTaskImprovementResponse(
    originalTitle: string,
    originalDescription: string,
    improvement: TaskImprovementSuggestion,
    columnName: string,
    suggestionId: string
  ): string {
    let response = `I've improved the task "${originalTitle}" from the ${columnName} column:\n\n`;

    response += `**Original Title:**\n${originalTitle}\n\n`;
    response += `**Improved Title:**\n${improvement.improvedTask.title}\n\n`;

    if (originalDescription) {
      response += `**Original Description:**\n${originalDescription}\n\n`;
    }

    response += `**Improved Description:**\n${improvement.improvedTask.description}\n\n`;

    if (improvement.reasoning) {
      response += `**Reasoning:**\n${improvement.reasoning}\n\n`;
    }

    response += 'Would you like to use these improvements?';
    response += `\n\n[Accept Suggestion](/api/suggestions/${suggestionId}/accept) | [Reject Suggestion](/api/suggestions/${suggestionId}/reject)`;

    return response;
  }

  /**
   * Find a task in a board suggestion by task ID
   * @param boardSuggestion Board suggestion
   * @param taskId Task ID
   * @returns Task and column name if found, otherwise null
   */
  private findTaskInBoardSuggestion(
    boardSuggestion: BoardSuggestion,
    taskId: string
  ): {
    task: { title: string; description: string };
    columnName: string;
  } | null {
    for (const column of boardSuggestion.columns) {
      const task = column.tasks.find((t) => t.id === taskId);
      if (task) {
        return { task, columnName: column.name };
      }
    }
    return null;
  }
}

export const chatAssistantService = new ChatAssistantService();
