import { Types } from 'mongoose';
import { socketService } from '../../config/socket';
import {
  AssistantService,
  BoardSuggestion,
  TaskImprovementSuggestion,
} from '../ai/assistant.service';
import { chatService } from './chat.service';
import { ChatIntent, intentService } from './intent.service';
import { openAIService } from '../ai/openai.service';
import {
  ChatCompletionAssistantMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/chat';

interface ProcessMessageResult {
  responseMessage: {
    content: string;
  };
  detectedIntent: ChatIntent;
  suggestions: {
    boardSuggestion?: BoardSuggestion;
    taskBreakdown?: {
      taskTitle: string;
      taskDescription: string;
      subtasks: Array<{
        title: string;
        description: string;
        completed: boolean;
      }>;
    };
    taskImprovement?: TaskImprovementSuggestion;
  };
  confidence: number;
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

            const boardSuggestion =
              await this.assistantService.generateBoardSuggestion(
                extractedEntities.projectDescription
              );

            result.suggestions.boardSuggestion = boardSuggestion ?? undefined;
            conversationalResponse = this.formatBoardSuggestionResponse(
              boardSuggestion!
            );
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

            result.suggestions.taskBreakdown = taskBreakdown ?? undefined;
            conversationalResponse = this.formatTaskBreakdownResponse(
              taskBreakdown!
            );
          } else {
            conversationalResponse =
              'I can help break down a task into smaller subtasks. What task would you like me to break down?';
          }
          break;

        case 'task_improvement':
          if (extractedEntities.taskTitle) {
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

            result.suggestions.taskImprovement = taskImprovement ?? undefined;
            conversationalResponse = this.formatTaskImprovementResponse(
              extractedEntities.taskTitle,
              extractedEntities.taskDescription || '',
              taskImprovement!
            );
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
        { isTyping: false }
      );

      // Save assistant response
      const assistantMessage = await chatService.addMessage({
        sessionId,
        role: 'assistant',
        content: result.responseMessage.content,
        metadata: {
          suggestedBoardId: result.suggestions.boardSuggestion
            ? new Types.ObjectId()
            : undefined,
          suggestedTaskId: result.suggestions.taskBreakdown
            ? new Types.ObjectId()
            : undefined,
          intent,
          confidence,
        },
      });

      // Emit new message event
      socketService.emitToChatSession(
        sessionId.toString(),
        'new_message',
        assistantMessage
      );

      // If there are suggestions, emit them separately
      if (Object.keys(result.suggestions).length > 0) {
        socketService.emitToChatSession(
          sessionId.toString(),
          'suggestion_ready',
          result.suggestions
        );
      }

      // Update session with intent context
      await chatService.updateChatSession(sessionId, {
        context: {
          currentIntent: intent,
        },
      });

      return result;
    } catch (error) {
      console.error('Error processing message:', error);

      // Stop typing indicator
      socketService.emitToChatSession(
        sessionId.toString(),
        'assistant_typing',
        { isTyping: false }
      );

      // Save error response
      const errorResponse =
        "I'm having trouble processing your request right now. Please try again later.";

      const errorMessage = await chatService.addMessage({
        sessionId,
        role: 'assistant',
        content: errorResponse,
      });

      // Emit error message
      socketService.emitToChatSession(
        sessionId.toString(),
        'new_message',
        errorMessage
      );

      result.responseMessage.content = errorResponse;
      return result;
    }
  }

  /**
   * Format board suggestion response
   * @param suggestion The board suggestion
   * @returns Formatted message
   */
  private formatBoardSuggestionResponse(suggestion: BoardSuggestion): string {
    let response = `Here's a board layout for "${suggestion.boardName}":\n\n`;

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
      '\nWould you like to use this board structure or make some changes to it?';
    return response;
  }

  /**
   * Format task breakdown response
   * @param breakdown The task breakdown
   * @returns Formatted message
   */
  private formatTaskBreakdownResponse(breakdown: {
    taskTitle: string;
    taskDescription: string;
    subtasks: Array<{
      title: string;
      description: string;
      completed: boolean;
    }>;
  }): string {
    let response = `Here's how I'd break down "${breakdown.taskTitle}":\n\n`;

    breakdown.subtasks.forEach((subtask, index) => {
      response += `${index + 1}. **${subtask.title}**\n`;
      response += `   ${subtask.description}\n\n`;
    });

    response += '\nWould you like to use these subtasks or modify them?';
    return response;
  }

  /**
   * Format task improvement response
   * @param originalTitle Original task title
   * @param originalDescription Original task description
   * @param improvement Task improvement suggestion
   * @returns Formatted message
   */
  private formatTaskImprovementResponse(
    originalTitle: string,
    originalDescription: string,
    improvement: TaskImprovementSuggestion
  ): string {
    let response = "I've improved your task:\n\n";

    response += '**Original Title:**\n';
    response += `${originalTitle}\n\n`;

    response += '**Improved Title:**\n';
    response += `${improvement.title}\n\n`;

    if (originalDescription || improvement.description) {
      response += '**Original Description:**\n';
      response += `${originalDescription || '(None provided)'}\n\n`;

      response += '**Improved Description:**\n';
      response += `${improvement.description}\n\n`;
    }

    response += '\nWould you like to use these improvements?';
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
