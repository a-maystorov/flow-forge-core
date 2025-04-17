import { Types } from 'mongoose';
import {
  ChatCompletionAssistantMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/chat';
import { socketService } from '../../config/socket';
import {
  BaseSubtask,
  BaseTask,
  BoardSuggestion,
  TaskBreakdownSuggestion,
  TaskImprovementSuggestion,
} from '../../models/suggestion.model';
import {
  BoardSuggestion as AIBoardSuggestion,
  SubtaskSuggestion as AISubtaskSuggestion,
  TaskImprovementSuggestion as AITaskImprovementSuggestion,
  AssistantService,
} from '../ai/assistant.service';
import { openAIService } from '../ai/openai.service';
import { suggestionService } from '../suggestion/suggestion.service';
import { chatService } from './chat.service';
import { ChatIntent, intentService } from './intent.service';

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
  private assistantService: AssistantService;

  constructor() {
    this.assistantService = new AssistantService();
  }

  /**
   * Transform AI-generated board suggestion to the database model format
   * @param aiBoardSuggestion The AI-generated board suggestion
   * @returns Transformed board suggestion matching the database model
   */
  private transformBoardSuggestion(
    aiBoardSuggestion: AIBoardSuggestion
  ): BoardSuggestion {
    return {
      boardName: aiBoardSuggestion.boardName,
      columns: aiBoardSuggestion.columns.map((column) => ({
        name: column.name,
        position: column.position,
        tasks: column.tasks.map((task) => ({
          title: task.title,
          description: task.description,
          position: task.position,
        })) as BaseTask[],
      })),
    };
  }

  /**
   * Transform AI-generated task breakdown suggestion to the database model format
   * @param aiTaskBreakdown The AI-generated task breakdown suggestion
   * @returns Transformed task breakdown suggestion matching the database model
   */
  private transformTaskBreakdownSuggestion(aiTaskBreakdown: {
    taskTitle: string;
    taskDescription: string;
    subtasks: AISubtaskSuggestion[];
  }): TaskBreakdownSuggestion {
    return {
      taskTitle: aiTaskBreakdown.taskTitle,
      taskDescription: aiTaskBreakdown.taskDescription,
      subtasks: aiTaskBreakdown.subtasks.map((subtask) => ({
        title: subtask.title,
        description: subtask.description,
        completed: subtask.completed,
      })) as BaseSubtask[],
    };
  }

  /**
   * Transform AI-generated task improvement suggestion to the database model format
   * @param aiImprovement The AI-generated task improvement suggestion
   * @returns Transformed task improvement suggestion matching the database model
   */
  private transformTaskImprovementSuggestion(
    aiImprovement: AITaskImprovementSuggestion
  ): TaskImprovementSuggestion {
    return aiImprovement;
  }

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
    socketService.emitToChatSession(
      sessionId.toString(),
      'new_message',
      userMessage
    );

    // Emit typing indicator
    socketService.emitToChatSession(sessionId.toString(), 'assistant_typing', {
      isTyping: true,
    });

    // Detect intent from the message with conversation context
    const intentResult = await intentService.detectIntent(
      message,
      conversationContext
    );
    const { intent, confidence, extractedEntities } = intentResult;

    // Initialize result
    const result: ProcessMessageResult = {
      responseMessage: { content: '' },
      detectedIntent: intent,
      suggestions: {},
      confidence,
    };

    try {
      // First generate a conversational response based on the intent
      let conversationalResponse = '';

      // Handle different intents and generate appropriate suggestions
      switch (intent) {
        case 'board_suggestion':
          if (extractedEntities.projectDescription) {
            // Emit processing update
            socketService.emitToChatSession(
              sessionId.toString(),
              'processing_update',
              { status: 'Generating board suggestion...' }
            );

            const aiSuggestion =
              await this.assistantService.generateBoardSuggestion(
                extractedEntities.projectDescription
              );

            if (aiSuggestion) {
              // Get the chat session to access its userId
              const chatSession = await chatService.getChatSession(sessionId);

              if (!chatSession) {
                throw new Error('Chat session not found');
              }

              // Transform the AI board suggestion to the format expected by the database
              const transformedBoardSuggestion =
                this.transformBoardSuggestion(aiSuggestion);

              // Store the suggestion in the database
              const storedSuggestion =
                await suggestionService.createBoardSuggestion(
                  chatSession.userId,
                  sessionId,
                  transformedBoardSuggestion,
                  message
                );

              // Properly handle Mongoose ObjectId
              const suggestionId = (
                storedSuggestion._id as Types.ObjectId
              ).toString();
              result.suggestionId = suggestionId;
              result.suggestions.boardSuggestion = transformedBoardSuggestion;

              conversationalResponse = this.formatBoardSuggestionResponse(
                transformedBoardSuggestion,
                suggestionId
              );
            } else {
              conversationalResponse =
                "I'm sorry, I wasn't able to generate a board suggestion. Could you provide more details about your project?";
            }
          } else {
            conversationalResponse =
              "I'd be happy to suggest a board layout for your project. Could you provide more details about what you're working on?";
          }
          break;

        case 'task_breakdown':
          if (extractedEntities.taskDescription) {
            // Emit processing update
            socketService.emitToChatSession(
              sessionId.toString(),
              'processing_update',
              { status: 'Breaking down task...' }
            );

            const taskBreakdown =
              await this.assistantService.generateTaskBreakdown(
                extractedEntities.taskDescription
              );

            if (taskBreakdown) {
              // Get the chat session to access its userId
              const chatSession = await chatService.getChatSession(sessionId);

              if (!chatSession) {
                throw new Error('Chat session not found');
              }

              // Transform AI result to database model format
              const transformedTaskBreakdown =
                this.transformTaskBreakdownSuggestion(taskBreakdown);

              // Store the suggestion in the database
              const storedSuggestion =
                await suggestionService.createTaskBreakdownSuggestion(
                  chatSession.userId,
                  sessionId,
                  transformedTaskBreakdown,
                  message
                );

              // Properly handle Mongoose ObjectId
              const suggestionId = (
                storedSuggestion._id as Types.ObjectId
              ).toString();
              result.suggestionId = suggestionId;
              result.suggestions.taskBreakdown = transformedTaskBreakdown;

              conversationalResponse = this.formatTaskBreakdownResponse(
                transformedTaskBreakdown,
                suggestionId
              );
            } else {
              conversationalResponse =
                "I'm sorry, I wasn't able to break down that task. Could you provide more details?";
            }
          } else {
            conversationalResponse =
              'I can help break down a task into smaller subtasks. What task would you like me to break down?';
          }
          break;
        case 'task_improvement':
          // Check if we're improving a specific task from a previous board suggestion
          let relatedSuggestionId: string | undefined;
          let taskId: string | undefined;
          let originalTask: { title: string; description: string } | null =
            null;
          let columnName: string | null = null;

          // If the user specified a task ID or referenced a task by title
          if (extractedEntities.taskId) {
            taskId = extractedEntities.taskId;

            // Find the board suggestion containing this task
            const boardSuggestion =
              await suggestionService.findBoardSuggestionByTaskId(
                sessionId,
                taskId
              );

            if (boardSuggestion) {
              // Safely convert Mongoose ObjectId to string
              const boardSuggestionId = (
                boardSuggestion._id as Types.ObjectId
              ).toString();
              relatedSuggestionId = boardSuggestionId;
              const { task, columnName: colName } =
                suggestionService.findTaskInBoardSuggestion(
                  boardSuggestion.content as BoardSuggestion,
                  taskId
                );
              originalTask = task;
              columnName = colName;
            }
          } else if (
            extractedEntities.taskTitle &&
            !extractedEntities.taskDescription
          ) {
            // Try to find a task by title in recent board suggestions
            const sessionSuggestions =
              await suggestionService.getSuggestionsBySession(sessionId);

            for (const suggestion of sessionSuggestions) {
              if (suggestion.type === 'board') {
                const boardContent = suggestion.content as BoardSuggestion;
                for (const column of boardContent.columns) {
                  const matchingTask = column.tasks.find((t) =>
                    t.title
                      .toLowerCase()
                      .includes(extractedEntities.taskTitle!.toLowerCase())
                  );

                  if (matchingTask) {
                    originalTask = matchingTask;
                    columnName = column.name;
                    // Safely convert Mongoose ObjectId to string
                    const suggestionId = (
                      suggestion._id as Types.ObjectId
                    ).toString();
                    relatedSuggestionId = suggestionId;
                    taskId = matchingTask.id;
                    break;
                  }
                }
                if (originalTask) break;
              }
            }
          }

          // Now process the task improvement
          if (originalTask) {
            // We found a specific task to improve
            // Emit processing update
            socketService.emitToChatSession(
              sessionId.toString(),
              'processing_update',
              { status: 'Improving specific task...' }
            );

            const taskImprovement =
              await this.assistantService.improveTaskDescription(
                originalTask.title,
                originalTask.description
              );

            if (taskImprovement) {
              // Get the chat session to access its userId
              const chatSession = await chatService.getChatSession(sessionId);

              if (!chatSession) {
                throw new Error('Chat session not found');
              }

              // Transform AI result to database model format
              const transformedImprovement =
                this.transformTaskImprovementSuggestion(taskImprovement);

              // Store the suggestion in the database with reference to the original
              const storedSuggestion =
                await suggestionService.createTaskImprovementSuggestion(
                  chatSession.userId,
                  sessionId,
                  transformedImprovement,
                  message,
                  relatedSuggestionId,
                  { taskId }
                );

              // Properly handle Mongoose ObjectId
              const suggestionId = (
                storedSuggestion._id as Types.ObjectId
              ).toString();
              result.suggestionId = suggestionId;
              result.suggestions.taskImprovement = transformedImprovement;

              conversationalResponse =
                this.formatSpecificTaskImprovementResponse(
                  originalTask.title,
                  originalTask.description,
                  transformedImprovement,
                  columnName || 'a column',
                  suggestionId
                );
            } else {
              conversationalResponse = `I'm sorry, I wasn't able to improve the task "${originalTask.title}". Would you like to try again with more details?`;
            }
          } else if (extractedEntities.taskTitle) {
            // General task improvement without reference to a specific previous suggestion
            // Emit processing update
            socketService.emitToChatSession(
              sessionId.toString(),
              'processing_update',
              { status: 'Improving task...' }
            );

            const taskImprovement =
              await this.assistantService.improveTaskDescription(
                extractedEntities.taskTitle,
                extractedEntities.taskDescription || ''
              );

            if (taskImprovement) {
              // Get the chat session to access its userId
              const chatSession = await chatService.getChatSession(sessionId);

              if (!chatSession) {
                throw new Error('Chat session not found');
              }

              // Transform AI result to database model format
              const transformedImprovement =
                this.transformTaskImprovementSuggestion(taskImprovement);

              // Store the suggestion in the database
              const storedSuggestion =
                await suggestionService.createTaskImprovementSuggestion(
                  chatSession.userId,
                  sessionId,
                  transformedImprovement,
                  message
                );

              // Properly handle Mongoose ObjectId
              const suggestionId = (
                storedSuggestion._id as Types.ObjectId
              ).toString();
              result.suggestionId = suggestionId;
              result.suggestions.taskImprovement = transformedImprovement;

              conversationalResponse = this.formatTaskImprovementResponse(
                extractedEntities.taskTitle,
                extractedEntities.taskDescription || '',
                transformedImprovement,
                suggestionId
              );
            } else {
              conversationalResponse =
                "I'm sorry, I wasn't able to improve that task. Could you provide more details?";
            }
          } else {
            conversationalResponse =
              'I can help improve your task title and description. What task would you like me to enhance?';
          }
          break;

        case 'general_question':
          // For general questions, generate a more conversational response using OpenAI
          const enhancedResponse = await this.generateConversationalResponse(
            message,
            conversationContext
          );
          conversationalResponse = enhancedResponse;
          break;

        default:
          // For unknown intents, also use conversational approach
          const fallbackResponse = await this.generateConversationalResponse(
            message,
            conversationContext
          );
          conversationalResponse = fallbackResponse;
          break;
      }

      // Set the final response content
      result.responseMessage.content = conversationalResponse;

      // Stop typing indicator
      socketService.emitToChatSession(
        sessionId.toString(),
        'assistant_typing',
        {
          isTyping: false,
        }
      );

      // Add the assistant response to the chat session
      const assistantMessage = await chatService.addMessage({
        sessionId,
        role: 'assistant',
        content: conversationalResponse,
        metadata: result.suggestionId
          ? {
              // The metadata must match the expected fields in IChatMessage
              suggestedBoardId: result.suggestions.boardSuggestion
                ? result.suggestionId
                : undefined,
              suggestedTaskId:
                result.suggestions.taskBreakdown ||
                result.suggestions.taskImprovement
                  ? result.suggestionId
                  : undefined,
              confidence: result.confidence,
            }
          : undefined,
      });

      // Emit event for real-time updates
      socketService.emitToChatSession(
        sessionId.toString(),
        'new_message',
        assistantMessage
      );

      return result;
    } catch (error) {
      console.error('Error processing message:', error);

      // Stop typing indicator
      socketService.emitToChatSession(
        sessionId.toString(),
        'assistant_typing',
        {
          isTyping: false,
        }
      );

      // Add error message to chat session
      const errorMessage = await chatService.addMessage({
        sessionId,
        role: 'assistant',
        content:
          "I'm sorry, I encountered an error while processing your request. Please try again.",
      });

      // Emit event for real-time updates
      socketService.emitToChatSession(
        sessionId.toString(),
        'new_message',
        errorMessage
      );

      // Return error result
      result.responseMessage.content =
        "I'm sorry, I encountered an error while processing your request. Please try again.";
      return result;
    }
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
    response += `**Improved Title:**\n${improvement.title}\n\n`;

    if (originalDescription) {
      response += `**Original Description:**\n${originalDescription}\n\n`;
    }

    response += `**Improved Description:**\n${improvement.description}\n\n`;

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
    response += `**Improved Title:**\n${improvement.title}\n\n`;

    if (originalDescription) {
      response += `**Original Description:**\n${originalDescription}\n\n`;
    }

    response += `**Improved Description:**\n${improvement.description}\n\n`;

    response += 'Would you like to use these improvements?';
    response += `\n\n[Accept Suggestion](/api/suggestions/${suggestionId}/accept) | [Reject Suggestion](/api/suggestions/${suggestionId}/reject)`;

    return response;
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
Respond conversationally to the user's messages while maintaining context from the conversation history.
You can help with:
- Suggesting project board structures
- Breaking down tasks into subtasks
- Improving task descriptions
- Answering questions about project management
- Following up on previous suggestions

When appropriate, explain your reasoning. If you previously gave a suggestion like a board layout or task breakdown,
refer to it specifically if the user is asking for more details or clarification about it.

Keep responses helpful, clear, and concise.`,
      } as ChatCompletionSystemMessageParam;

      // Format conversation context for OpenAI
      const formattedContext = conversationContext.map((msg) => {
        switch (msg.role) {
          case 'user':
            return {
              role: 'user',
              content: msg.content,
            } as ChatCompletionUserMessageParam;
          case 'assistant':
            return {
              role: 'assistant',
              content: msg.content,
            } as ChatCompletionAssistantMessageParam;
          case 'system':
            return {
              role: 'system',
              content: msg.content,
            } as ChatCompletionSystemMessageParam;
          default:
            return {
              role: 'user',
              content: msg.content,
            } as ChatCompletionUserMessageParam;
        }
      });

      // Current user message
      const userMessage = {
        role: 'user',
        content: message,
      } as ChatCompletionUserMessageParam;

      // Combine all messages
      const messages = [systemPrompt, ...formattedContext, userMessage];

      // Generate response from OpenAI
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

      return "I apologize, but I'm having trouble processing your request right now.";
    } catch (error) {
      console.error('Error generating conversational response:', error);
      return 'I encountered an error while generating a response. Please try again.';
    }
  }
}

export const chatAssistantService = new ChatAssistantService();
