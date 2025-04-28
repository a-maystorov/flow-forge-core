import { Types } from 'mongoose';
import {
  ChatCompletionAssistantMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/chat';
import { socketService } from '../../config/socket';
import { ChatMessageMetadata } from '../../models/chat-message.model';
import {
  BoardSuggestion,
  TaskBreakdownSuggestion,
  TaskImprovementSuggestion,
} from '../../models/suggestion.model';
import Task from '../../models/task.model';
import { boardAdapter } from '../ai/adapters/board.adapter';
import { taskBreakdownAdapter } from '../ai/adapters/task-breakdown.adapter';
import { taskImprovementAdapter } from '../ai/adapters/task-improvement.adapter';
import { assistantService } from '../ai/assistant.service';
import { openAIService } from '../ai/openai.service';
import { suggestionService } from '../suggestion/suggestion.service';
import { chatService } from './chat.service';
import { ChatIntent, intentService } from './intent.service';
import { taskResolutionService } from './task-resolution.service';

// Constants for chat intents
export const CHAT_INTENTS = {
  GENERAL_CONVERSATION: 'general_question' as ChatIntent,
  CREATE_BOARD: 'board_suggestion' as ChatIntent,
  BREAKDOWN_TASK: 'task_breakdown' as ChatIntent,
  IMPROVE_TASK: 'task_improvement' as ChatIntent,
  UNKNOWN: 'unknown' as ChatIntent,
  CAPABILITY_QUESTION: 'capability_question' as ChatIntent, // For "What can you do?" type questions
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
  batchSuggestionIds?: string[];
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

    // Special case handling for capability questions
    if (message === 'What can you do?' || message === 'How can you help?') {
      const conversationalResponse = this.generateCapabilitiesResponse();

      // Add the assistant response to the chat session
      const assistantMessage = await chatService.addMessage({
        sessionId,
        role: 'assistant',
        content: conversationalResponse,
        metadata: {
          intent: CHAT_INTENTS.CAPABILITY_QUESTION,
          confidence: 0.9,
        },
      });

      // Hide AI typing indicator
      await chatService.setAITypingStatus(sessionId, false);

      // Emit message added event
      socketService.emitToChatSession(
        sessionIdStr,
        'messageAdded',
        assistantMessage
      );

      return {
        responseMessage: assistantMessage,
        detectedIntent: CHAT_INTENTS.CAPABILITY_QUESTION,
        confidence: 0.9,
        suggestions: {}, // Add empty suggestions object to satisfy the interface
      };
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

              // Debug log to verify thoughtProcess is present
              console.log(
                'Board thoughtProcess:',
                previewSuggestion.thoughtProcess
              );

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
                  // Guarantee that thoughtProcess exists with a fallback value
                  thoughtProcess:
                    previewSuggestion.thoughtProcess ||
                    'I analyzed your requirements and created a board structure with appropriate columns and initial tasks to help organize your project effectively.',
                  // Add board suggestion to maintain context in future conversations
                  boardContext: previewSuggestion,
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
                  thoughtProcess:
                    previewSuggestion.thoughtProcess ||
                    'I carefully analyzed this task and broke it down into manageable components that can be tracked individually, focusing on the most important steps needed for completion.',
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
            // Check if this is a multi-task request
            const isMultiTaskRequest =
              taskResolutionService.isMultiTaskRequest(message);

            // Send typing indicator for suggestion generation
            socketService.emitToChatSession(
              sessionIdStr,
              'suggestion_generating',
              {
                type: 'task-improvement',
                progress: 'started',
              }
            );

            if (isMultiTaskRequest) {
              // Handle multi-task improvement flow
              const taskIds =
                await taskResolutionService.resolveTasksFromMessage(
                  message,
                  sessionId
                );

              if (taskIds.length === 0) {
                // No tasks found - handle as generic improvement without context
                const taskTitle = message;
                const taskDescription = '';

                // Continue with standard single task flow
                const taskImprovement = await this.improveTaskDescription(
                  taskTitle,
                  taskDescription
                );

                if (taskImprovement) {
                  // Process as normal single improvement
                  const previewSuggestion =
                    taskImprovementAdapter.toSuggestionModel(
                      taskImprovement,
                      taskTitle,
                      taskDescription
                    );

                  // Rest of existing single task flow
                  const storedSuggestion =
                    await suggestionService.createTaskImprovementSuggestion(
                      chatSession.userId,
                      sessionId,
                      previewSuggestion,
                      message
                    );

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
                      thoughtProcess:
                        previewSuggestion.thoughtProcess ||
                        'I reviewed the original task and identified areas that could be clearer and more actionable.',
                    },
                  });

                  result.responseMessage = assistantMessage;
                }
              } else {
                // Found multiple tasks to improve
                // Gather task details
                const taskDetails = await Promise.all(
                  taskIds.map(async (id) => {
                    const task = await Task.findById(id);
                    return {
                      id: task?._id,
                      title: task?.title || '',
                      description: task?.description || '',
                    };
                  })
                );

                // Generate improvements for all tasks
                const improvements = await Promise.all(
                  taskDetails.map((task) =>
                    this.improveTaskDescription(task.title, task.description)
                  )
                );

                // Create batch suggestions data, filtering out any invalid tasks or improvements
                const improvementData = taskDetails
                  .map((task, index) => {
                    const improvement = improvements[index];
                    // Only include if both task.id and improvement are valid
                    if (task.id && improvement) {
                      // Transform to the expected suggestion format
                      const transformedContent: TaskImprovementSuggestion = {
                        originalTask: {
                          title: task.title,
                          description: task.description || '',
                        },
                        improvedTask: {
                          title: improvement.title,
                          description: improvement.description,
                        },
                        thoughtProcess: improvement.thoughtProcess,
                        reasoning: improvement.thoughtProcess,
                      };

                      return {
                        taskId: task.id,
                        content: transformedContent,
                      };
                    }
                    return null;
                  })
                  .filter(
                    (
                      item
                    ): item is {
                      taskId: Types.ObjectId;
                      content: TaskImprovementSuggestion;
                    } => item !== null
                  );

                // Only proceed if we have valid improvements
                if (improvementData.length > 0) {
                  const batchSuggestions =
                    await suggestionService.createBatchTaskImprovementSuggestions(
                      chatSession.userId,
                      sessionId,
                      improvementData,
                      message
                    );

                  // Update session context with multiple task IDs
                  await chatService.updateChatSession(sessionId, {
                    context: {
                      activeTaskIds: taskIds,
                      contextMode: 'multi',
                      lastAction: 'improvement',
                    },
                  });

                  // Format multi-task response
                  const formattedResponse =
                    this.formatMultipleTaskImprovementResponse(
                      taskDetails
                        .filter((task, index) => task.id && improvements[index])
                        .map((task) => ({
                          id: task.id!,
                          title: task.title,
                          description: task.description,
                        })),
                      improvementData
                        .filter((item) => item !== null)
                        .map((item) => item.content),
                      batchSuggestions.map((s) => s._id.toString())
                    );

                  // Add the assistant response to the chat session
                  const assistantMessage = await chatService.addMessage({
                    sessionId,
                    role: 'assistant',
                    content: formattedResponse,
                    metadata: {
                      intent: CHAT_INTENTS.IMPROVE_TASK,
                      confidence: intentResult.confidence,
                      batchSuggestionIds: batchSuggestions.map((s) => s._id),
                      isMultiTaskSuggestion: true,
                    },
                  });

                  result.responseMessage = assistantMessage;
                  result.suggestions = {
                    // Use only the first suggestion for consistency with the interface
                    taskImprovement: batchSuggestions[0]
                      .content as TaskImprovementSuggestion,
                  };
                  result.batchSuggestionIds = batchSuggestions.map((s) =>
                    s._id.toString()
                  );
                } else {
                  // No valid improvements could be generated
                  const conversationalResponse =
                    "I wasn't able to generate improvements for any of the tasks. " +
                    "Could you provide more specific details about what you'd like to improve?";

                  const assistantMessage = await chatService.addMessage({
                    sessionId,
                    role: 'assistant',
                    content: conversationalResponse,
                    metadata: {
                      intent: CHAT_INTENTS.IMPROVE_TASK,
                      confidence: intentResult.confidence,
                    },
                  });

                  result.responseMessage = assistantMessage;
                }
              }
            } else {
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

                // Check if there's an active task in the session context
                const taskId = chatSession.context?.taskId;
                let metadata = {};
                if (taskId) {
                  metadata = { taskId: taskId.toString() };
                }

                // Store the suggestion in the database
                const storedSuggestion =
                  await suggestionService.createTaskImprovementSuggestion(
                    chatSession.userId,
                    sessionId,
                    previewSuggestion,
                    message,
                    undefined, // No related suggestion
                    metadata // Include task ID if available
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
                    thoughtProcess:
                      previewSuggestion.thoughtProcess ||
                      'I reviewed the original task and identified areas that could be clearer and more actionable.',
                  },
                });

                result.responseMessage = assistantMessage;
              }
            }
          }
          break;

        default:
          // General conversation
          if (this.isAssistantCapabilitiesQuestion(message)) {
            // Provide a specific response about assistant capabilities
            conversationalResponse = this.generateCapabilitiesResponse();

            // Add the assistant response to the chat session with capability question intent
            const assistantMessage = await chatService.addMessage({
              sessionId,
              role: 'assistant',
              content: conversationalResponse,
              metadata: {
                intent: CHAT_INTENTS.CAPABILITY_QUESTION,
                confidence: intentResult.confidence,
              },
            });

            result.responseMessage = assistantMessage;
            result.detectedIntent = CHAT_INTENTS.CAPABILITY_QUESTION;
          } else {
            // Generate a regular conversational response
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
    conversationContext: {
      role: string;
      content: string;
      metadata?: ChatMessageMetadata;
    }[]
  ): Promise<string> {
    try {
      // Check for board context in previous messages
      let boardContextInfo = '';
      for (let i = conversationContext.length - 1; i >= 0; i--) {
        const msg = conversationContext[i];
        if (
          msg.role === 'assistant' &&
          msg.metadata?.boardContext &&
          msg.metadata?.intent === CHAT_INTENTS.CREATE_BOARD
        ) {
          const boardSuggestion = msg.metadata.boardContext as BoardSuggestion;
          boardContextInfo = `\nPreviously, I suggested a board named "${boardSuggestion.boardName}" with the following columns: ${boardSuggestion.columns.map((col) => `"${col.name}"`).join(', ')}. The board has ${boardSuggestion.columns.reduce((sum, col) => sum + col.tasks.length, 0)} tasks distributed across these columns. When responding to board-related queries, refer to this board suggestion and provide relevant advice or modifications based on the user's requests.`;
          break;
        }
      }

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

Remember that you're part of a project management tool, so try to be helpful and relevant.${boardContextInfo}`,
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

    // Add more conversational guidance to encourage interaction about the board
    response +=
      "I've designed this board based on your project description. What do you think about it?\n\n";
    response += 'You can:\n';
    response += '- Ask me to add more tasks or columns\n';
    response += '- Request changes to the existing structure\n';
    response += '- Get more details about any task\n';
    response += '- Or accept the board as-is\n\n';

    response +=
      'Would you like to use this board structure or make some changes to it?';
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
   * Format multiple task improvement suggestions into a user-friendly response
   * @param originalTasks Array of original task information
   * @param improvements Array of improvement suggestions
   * @param suggestionIds Array of suggestion IDs
   * @returns Formatted response string
   */
  private formatMultipleTaskImprovementResponse(
    originalTasks: Array<{
      id: Types.ObjectId;
      title: string;
      description: string;
    }>,
    improvements: TaskImprovementSuggestion[],
    suggestionIds: string[]
  ): string {
    let response = `I've improved ${originalTasks.length} tasks:\n\n`;

    originalTasks.forEach((task, index) => {
      const improvement = improvements[index];
      const suggestionId = suggestionIds[index];

      response += `### Task ${index + 1}: ${task.title}\n\n`;
      response += `**Original Title:** ${task.title}\n`;
      response += `**Improved Title:** ${improvement.improvedTask.title}\n\n`;

      if (task.description || improvement.improvedTask.description) {
        if (task.description) {
          response += `**Original Description:**\n${task.description}\n\n`;
        }
        response += `**Improved Description:**\n${improvement.improvedTask.description}\n\n`;
      }

      // Add reasoning if available
      if (improvement.reasoning) {
        response += `**Reasoning:**\n${improvement.reasoning}\n\n`;
      }

      // Add acceptance links for individual suggestion
      response += `[Accept This Improvement](/api/suggestions/${suggestionId}/accept) | [Reject This Improvement](/api/suggestions/${suggestionId}/reject)\n\n`;
    });

    // Add batch acceptance option if there are multiple suggestions
    if (suggestionIds.length > 1) {
      response += `\n[Accept All Improvements](/api/suggestions/batch/accept?ids=${suggestionIds.join(',')})`;
    }

    return response;
  }

  /**
   * Check if a message is asking about the assistant's capabilities
   * @param message User message
   * @returns Boolean indicating if it's a capabilities question
   */
  private isAssistantCapabilitiesQuestion(message: string): boolean {
    const lowercaseMessage = message.toLowerCase();

    const capabilityKeywords = [
      'what can you do',
      'what functionalities do you have',
      'what features',
      'how can you help',
      'what are you capable of',
      'what are your capabilities',
      'what services do you offer',
      'what do you do',
      'how do you work',
      'what can you help me with',
    ];

    // Add logging to help debug
    const isCapabilityQuestion = capabilityKeywords.some((keyword) =>
      lowercaseMessage.includes(keyword)
    );
    console.log(
      `Message: "${message}" is capability question: ${isCapabilityQuestion}`
    );
    return isCapabilityQuestion;
  }

  /**
   * Generate a response explaining the assistant's capabilities
   * @returns Formatted response about capabilities
   */
  private generateCapabilitiesResponse(): string {
    return `I'm your Flow Forge AI assistant, and I can help you with several project management tasks:

1. **Board Creation**: I can suggest a complete Kanban board structure based on your project description. I'll create appropriate columns and initial tasks to get you started.

2. **Task Breakdown**: I can help break down complex tasks into smaller, manageable subtasks.

3. **Task Improvement**: I can improve task descriptions to make them clearer and more actionable.

4. **General Guidance**: I can answer questions about project management, Kanban methodology, and how to use Flow Forge effectively.

Just describe what you're working on, and I'll adapt my suggestions to your technical level. For software development projects, I'll use industry-standard terminology and Agile/Scrum methodologies. For other types of projects, I'll suggest appropriate structures using more general terminology.

What would you like help with today?`;
  }
}

export const chatAssistantService = new ChatAssistantService();
