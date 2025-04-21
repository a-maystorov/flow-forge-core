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

    // Show AI typing indicator
    await chatService.setAITypingStatus(sessionId, true);

    // Get session ID as string for socket events
    const sessionIdStr =
      typeof sessionId === 'string' ? sessionId : sessionId.toString();

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
            // Send typing indicator for suggestion generation
            socketService.emitToChatSession(
              sessionIdStr,
              'suggestion_generating',
              {
                type: 'board',
                progress: 'started',
              }
            );

            // Extract project description from message
            const projectDescription = message;
            // Generate board suggestion using AI
            const boardSuggestion =
              await this.generateBoardSuggestion(projectDescription);

            if (boardSuggestion) {
              // Send preview of the suggestion being generated
              const previewSuggestion =
                boardAdapter.toSuggestionModel(boardSuggestion);

              // Store the suggestion in the database
              const storedSuggestion =
                await suggestionService.createBoardSuggestion(
                  chatSession.userId,
                  sessionId,
                  previewSuggestion,
                  message
                );

              // Properly handle Mongoose ObjectId
              const suggestionId = (
                storedSuggestion._id as Types.ObjectId
              ).toString();
              result.suggestionId = suggestionId;
              result.suggestions.boardSuggestion = previewSuggestion;

              // Emit the suggestion preview via WebSocket
              socketService.emitSuggestionPreview(
                sessionIdStr,
                suggestionId,
                'board' as const,
                previewSuggestion
              );

              const formattedResponse = this.formatBoardSuggestionResponse(
                previewSuggestion,
                suggestionId
              );

              // Add the assistant response to the chat session
              const assistantMessage = await chatService.addMessage({
                sessionId,
                role: 'assistant',
                content: formattedResponse,
                metadata: {
                  intent: CHAT_INTENTS.CREATE_BOARD,
                  confidence: intentResult.confidence,
                  suggestedBoardId: storedSuggestion._id,
                },
              });

              result.responseMessage = assistantMessage;
            } else {
              conversationalResponse =
                "I'm sorry, I wasn't able to generate a board suggestion. Could you provide more details about your project?";

              // Add the assistant response to the chat session
              const assistantMessage = await chatService.addMessage({
                sessionId,
                role: 'assistant',
                content: conversationalResponse,
              });

              result.responseMessage = assistantMessage;
            }
          } else {
            // Low confidence - use conversational fallback
            conversationalResponse = await this.generateConversationalResponse(
              message,
              conversationContext
            );

            // Add the assistant response to the chat session
            const assistantMessage = await chatService.addMessage({
              sessionId,
              role: 'assistant',
              content: conversationalResponse,
              metadata: {
                intent: CHAT_INTENTS.GENERAL_CONVERSATION,
                confidence: intentResult.confidence,
              },
            });

            result.responseMessage = assistantMessage;
          }
          break;

        case CHAT_INTENTS.BREAKDOWN_TASK:
          if (intentResult.confidence >= 0.6) {
            // Send typing indicator for suggestion generation
            socketService.emitToChatSession(
              sessionIdStr,
              'suggestion_generating',
              {
                type: 'task-breakdown',
                progress: 'started',
              }
            );

            // Generate task breakdown using AI
            const taskBreakdown = await this.generateTaskBreakdown(message);

            if (taskBreakdown) {
              // Send preview of the suggestion being generated
              const previewSuggestion =
                taskBreakdownAdapter.toSuggestionModel(taskBreakdown);

              // Store the suggestion in the database
              const storedSuggestion =
                await suggestionService.createTaskBreakdownSuggestion(
                  chatSession.userId,
                  sessionId,
                  previewSuggestion,
                  message
                );

              // Properly handle Mongoose ObjectId
              const suggestionId = (
                storedSuggestion._id as Types.ObjectId
              ).toString();
              result.suggestionId = suggestionId;
              result.suggestions.taskBreakdown = previewSuggestion;

              // Emit the suggestion preview via WebSocket
              socketService.emitSuggestionPreview(
                sessionIdStr,
                suggestionId,
                'task-breakdown' as const,
                previewSuggestion
              );

              const formattedResponse = this.formatTaskBreakdownResponse(
                previewSuggestion,
                suggestionId
              );

              // Add the assistant response to the chat session
              const assistantMessage = await chatService.addMessage({
                sessionId,
                role: 'assistant',
                content: formattedResponse,
                metadata: {
                  intent: CHAT_INTENTS.BREAKDOWN_TASK,
                  confidence: intentResult.confidence,
                  suggestedTaskBreakdownId: storedSuggestion._id,
                },
              });

              result.responseMessage = assistantMessage;
            } else {
              conversationalResponse =
                "I'm sorry, I wasn't able to break down that task. Could you provide more details about what the task involves?";

              // Add the assistant response to the chat session
              const assistantMessage = await chatService.addMessage({
                sessionId,
                role: 'assistant',
                content: conversationalResponse,
              });

              result.responseMessage = assistantMessage;
            }
          } else {
            // Low confidence - use conversational fallback
            conversationalResponse = await this.generateConversationalResponse(
              message,
              conversationContext
            );

            // Add the assistant response to the chat session
            const assistantMessage = await chatService.addMessage({
              sessionId,
              role: 'assistant',
              content: conversationalResponse,
              metadata: {
                intent: CHAT_INTENTS.GENERAL_CONVERSATION,
                confidence: intentResult.confidence,
              },
            });

            result.responseMessage = assistantMessage;
          }
          break;

        case CHAT_INTENTS.IMPROVE_TASK:
          if (intentResult.confidence >= 0.6) {
            // Send typing indicator for suggestion generation
            socketService.emitToChatSession(
              sessionIdStr,
              'suggestion_generating',
              {
                type: 'task-improvement',
                progress: 'started',
              }
            );

            // Extract task title and description (if any)
            const taskTitle = message;
            const taskDescription = '';

            // Generate task improvement using AI
            const taskImprovement = await this.improveTaskDescription(
              taskTitle,
              taskDescription
            );

            if (taskImprovement) {
              // Send preview of the suggestion being generated
              const previewSuggestion =
                taskImprovementAdapter.toSuggestionModel(
                  taskImprovement,
                  taskTitle,
                  taskDescription
                );

              // Store the suggestion in the database
              const storedSuggestion =
                await suggestionService.createTaskImprovementSuggestion(
                  chatSession.userId,
                  sessionId,
                  previewSuggestion,
                  message
                );

              // Properly handle Mongoose ObjectId
              const suggestionId = (
                storedSuggestion._id as Types.ObjectId
              ).toString();
              result.suggestionId = suggestionId;
              result.suggestions.taskImprovement = previewSuggestion;

              // Emit the suggestion preview via WebSocket
              socketService.emitSuggestionPreview(
                sessionIdStr,
                suggestionId,
                'task-improvement' as const,
                previewSuggestion
              );

              const formattedResponse = this.formatTaskImprovementResponse(
                taskTitle,
                taskDescription,
                previewSuggestion,
                suggestionId
              );

              // Add the assistant response to the chat session
              const assistantMessage = await chatService.addMessage({
                sessionId,
                role: 'assistant',
                content: formattedResponse,
                metadata: {
                  intent: CHAT_INTENTS.IMPROVE_TASK,
                  confidence: intentResult.confidence,
                  suggestedTaskImprovementId: storedSuggestion._id,
                },
              });

              result.responseMessage = assistantMessage;
            } else {
              conversationalResponse =
                "I'm sorry, I wasn't able to improve that task. Could you provide more details?";

              // Add the assistant response to the chat session
              const assistantMessage = await chatService.addMessage({
                sessionId,
                role: 'assistant',
                content: conversationalResponse,
              });

              result.responseMessage = assistantMessage;
            }
          } else {
            // Low confidence - use conversational fallback
            conversationalResponse = await this.generateConversationalResponse(
              message,
              conversationContext
            );

            // Add the assistant response to the chat session
            const assistantMessage = await chatService.addMessage({
              sessionId,
              role: 'assistant',
              content: conversationalResponse,
              metadata: {
                intent: CHAT_INTENTS.GENERAL_CONVERSATION,
                confidence: intentResult.confidence,
              },
            });

            result.responseMessage = assistantMessage;
          }
          break;

        default:
          // General conversation
          conversationalResponse = await this.generateConversationalResponse(
            message,
            conversationContext
          );

          // Add the assistant response to the chat session
          const assistantMessage = await chatService.addMessage({
            sessionId,
            role: 'assistant',
            content: conversationalResponse,
            metadata: {
              intent: CHAT_INTENTS.GENERAL_CONVERSATION,
              confidence: intentResult.confidence,
            },
          });

          result.responseMessage = assistantMessage;
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
      conversationalResponse =
        "I'm sorry, I encountered an error while processing your message. Please try again.";

      // Add the error response to the chat session
      const assistantMessage = await chatService.addMessage({
        sessionId,
        role: 'assistant',
        content: conversationalResponse,
      });

      result.responseMessage = assistantMessage;
    } finally {
      // Hide AI typing indicator when response is complete
      await chatService.setAITypingStatus(sessionId, false);
    }

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
   * Format a task breakdown suggestion into a user-friendly response
   * @param suggestion Task breakdown suggestion
   * @param suggestionId Suggestion ID
   * @returns Formatted response
   */
  private formatTaskBreakdownResponse(
    suggestion: TaskBreakdownSuggestion,
    suggestionId: string
  ): string {
    let response = `Here's a breakdown of your task into smaller, actionable subtasks:\n\n`;

    // Add each subtask
    suggestion.subtasks.forEach((subtask, index) => {
      response += `${index + 1}. **${subtask.title}**\n`;
      if (subtask.description) {
        response += `   ${subtask.description}\n`;
      }
      response += '\n';
    });

    response +=
      'Would you like to use these subtasks or make some changes? You can accept or reject this suggestion.';
    response += `\n\n[Accept Suggestion](/api/suggestions/${suggestionId}/accept) | [Reject Suggestion](/api/suggestions/${suggestionId}/reject)`;

    return response;
  }

  /**
   * Format a task improvement suggestion into a user-friendly response
   * @param originalTaskTitle Original task title
   * @param originalTaskDescription Original task description (can be empty)
   * @param suggestion Task improvement suggestion
   * @param suggestionId Suggestion ID
   * @returns Formatted response
   */
  private formatTaskImprovementResponse(
    originalTaskTitle: string,
    originalTaskDescription: string,
    suggestion: TaskImprovementSuggestion,
    suggestionId: string
  ): string {
    let response = `I've analyzed your task and have some improvements to suggest:\n\n`;

    // Show original task title
    response += `**Original Title:** ${originalTaskTitle}\n`;
    response += `**Improved Title:** ${suggestion.improvedTask.title}\n\n`;

    // Show original and improved description if available
    if (originalTaskDescription || suggestion.improvedTask.description) {
      if (originalTaskDescription) {
        response += `**Original Description:**\n${originalTaskDescription}\n\n`;
      }
      response += `**Improved Description:**\n${suggestion.improvedTask.description}\n\n`;
    }

    // Add reasoning if available
    if (suggestion.reasoning) {
      response += `**Reasoning:**\n${suggestion.reasoning}\n\n`;
    }

    response +=
      'Would you like to use these improvements or keep your original task? You can accept or reject this suggestion.';
    response += `\n\n[Accept Suggestion](/api/suggestions/${suggestionId}/accept) | [Reject Suggestion](/api/suggestions/${suggestionId}/reject)`;

    return response;
  }

  /**
   * Format a task improvement for a specific task from a board suggestion
   * @param originalTaskTitle Original task title
   * @param originalTaskDescription Original task description (can be empty)
   * @param suggestion Task improvement suggestion
   * @param columnName Column name where the task exists
   * @param suggestionId Suggestion ID
   * @returns Formatted response
   */
  private formatSpecificTaskImprovementResponse(
    originalTaskTitle: string,
    originalTaskDescription: string,
    suggestion: TaskImprovementSuggestion,
    columnName: string,
    suggestionId: string
  ): string {
    let response = `I've improved the task "${originalTaskTitle}" from the ${columnName} column:\n\n`;

    response += `**Original Title:** ${originalTaskTitle}\n`;
    response += `**Improved Title:** ${suggestion.improvedTask.title}\n\n`;

    if (originalTaskDescription || suggestion.improvedTask.description) {
      if (originalTaskDescription) {
        response += `**Original Description:**\n${originalTaskDescription}\n\n`;
      }
      response += `**Improved Description:**\n${suggestion.improvedTask.description}\n\n`;
    }

    // Add reasoning if available
    if (suggestion.reasoning) {
      response += `**Reasoning:**\n${suggestion.reasoning}\n\n`;
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
