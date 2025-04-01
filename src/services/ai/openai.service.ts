import { ChatCompletion, ChatCompletionMessageParam } from 'openai/resources';
import openai from '../../config/openai';

/**
 * Service for interacting with OpenAI API
 */
export class OpenAIService {
  private defaultModel = 'gpt-4o';

  /**
   * Generate a chat completion using OpenAI
   * @param messages Array of messages to send to OpenAI
   * @param options Additional options for the chat completion
   * @returns The chat completion response
   */
  async generateChatCompletion(
    messages: ChatCompletionMessageParam[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<ChatCompletion> {
    try {
      const {
        model = this.defaultModel,
        temperature = 0.7,
        maxTokens = 1000,
      } = options;

      const response = await openai.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      return response;
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      throw new Error('Failed to generate AI response');
    }
  }

  /**
   * Extract the text content from a chat completion
   * @param completion The chat completion from OpenAI
   * @returns The extracted text content or null if no content
   */
  extractContent(completion: ChatCompletion): string | null {
    if (completion.choices && completion.choices.length > 0) {
      return completion.choices[0].message.content;
    }
    return null;
  }
}

export const openAIService = new OpenAIService();
