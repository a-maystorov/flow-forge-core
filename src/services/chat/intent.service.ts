import {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/chat';
import { openAIService } from '../ai/openai.service';

export type ChatIntent =
  | 'board_suggestion'
  | 'task_breakdown'
  | 'task_improvement'
  | 'general_question'
  | 'unknown';

interface IntentDetectionResult {
  intent: ChatIntent;
  confidence: number;
  extractedEntities: {
    projectDescription?: string;
    taskDescription?: string;
    taskTitle?: string;
    boardId?: string;
    taskId?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Service responsible for detecting user intent in messages
 * and extracting relevant entities for AI processing
 */
export class IntentService {
  /**
   * Detect the intent of a user message
   * @param message The user's message content
   * @param contextMessages Previous messages in the conversation (optional)
   * @returns The detected intent and extracted entities
   */
  async detectIntent(
    message: string,
    contextMessages: { role: string; content: string }[] = []
  ): Promise<IntentDetectionResult> {
    try {
      // Convert previous context into a format OpenAI can use
      const conversationContext: ChatCompletionMessageParam[] =
        contextMessages.map((msg) => {
          switch (msg.role) {
            case 'user':
              return {
                role: 'user',
                content: msg.content,
              } as ChatCompletionUserMessageParam;
            case 'system':
              return {
                role: 'system',
                content: msg.content,
              } as ChatCompletionSystemMessageParam;
            case 'assistant':
              return {
                role: 'assistant',
                content: msg.content,
              } as ChatCompletionAssistantMessageParam;
            default:
              // Fallback - treat as user message
              console.warn(
                `Unknown message role: ${msg.role}, treating as user`
              );
              return {
                role: 'user',
                content: msg.content,
              } as ChatCompletionUserMessageParam;
          }
        });

      // System prompt for the AI assistant
      const systemPrompt: ChatCompletionSystemMessageParam = {
        role: 'system',
        content: `You are an intelligent assistant for Flow Forge, a project management application.
You should maintain a conversational tone and remember the context of the conversation.

When analyzing user messages, try to determine their intent:
- board_suggestion: User wants suggestions for project board structure
- task_breakdown: User wants to break down a task into subtasks
- task_improvement: User wants suggestions to improve a task description
- general_question: General questions about the application or previous suggestions
- unknown: Cannot determine user intent

Also extract relevant entities from the message:
- projectDescription: Description of the project (for board_suggestion)
- taskTitle: Title of the task (for task_breakdown or task_improvement)
- taskDescription: Description of the task (for task_breakdown or task_improvement)
- boardId: ID of a specific board mentioned (if any)
- taskId: ID of a specific task mentioned (if any)

When responding, maintain context from previous messages. If the user is asking about previous suggestions,
refer to them appropriately. If the user is asking a follow-up question, connect it to the previous conversation.

Respond in JSON format only:
{
  "intent": "intent_name",
  "confidence": 0.x,
  "extractedEntities": {
    relevant fields based on intent
  }
}`,
      };

      // User message typed appropriately
      const userMessage: ChatCompletionUserMessageParam = {
        role: 'user',
        content: message,
      };

      // Combine context with current message
      const messages: ChatCompletionMessageParam[] = [
        systemPrompt,
        ...conversationContext,
        userMessage,
      ];

      // Call OpenAI for classification
      const completion = await openAIService.generateChatCompletion(messages, {
        temperature: 0.1, // Low temperature for more deterministic outputs
        maxTokens: 300,
      });

      // Parse the response
      if (completion.choices?.length > 0) {
        const content = completion.choices[0].message.content || '';
        try {
          // Extract JSON from the response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]) as IntentDetectionResult;

            // Validate the result
            if (!result.intent) {
              result.intent = 'unknown';
            }

            if (!result.confidence) {
              result.confidence = 0.5;
            }

            if (!result.extractedEntities) {
              result.extractedEntities = {};
            }

            return result;
          }
        } catch (error) {
          console.error('Error parsing intent detection response:', error);
        }
      }

      // Fallback if parsing fails
      return {
        intent: 'unknown',
        confidence: 0,
        extractedEntities: {},
      };
    } catch (error) {
      console.error('Error in intent detection:', error);
      return {
        intent: 'unknown',
        confidence: 0,
        extractedEntities: {},
      };
    }
  }

  /**
   * Check if the intent is related to generating a board
   * @param intent The detected intent
   * @returns Boolean indicating if this is a board suggestion intent
   */
  isBoardSuggestionIntent(intent: ChatIntent): boolean {
    return intent === 'board_suggestion';
  }

  /**
   * Check if the intent is related to breaking down a task
   * @param intent The detected intent
   * @returns Boolean indicating if this is a task breakdown intent
   */
  isTaskBreakdownIntent(intent: ChatIntent): boolean {
    return intent === 'task_breakdown';
  }

  /**
   * Check if the intent is related to improving a task
   * @param intent The detected intent
   * @returns Boolean indicating if this is a task improvement intent
   */
  isTaskImprovementIntent(intent: ChatIntent): boolean {
    return intent === 'task_improvement';
  }
}

export const intentService = new IntentService();
