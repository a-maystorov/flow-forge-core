import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import openaiConfig from '../../config/openai';

export class ChatGPTService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: openaiConfig.apiKey,
      // Remove the organization parameter since it's causing authentication errors
    });
  }

  /**
   * Analyze the intent of a user message
   * @param message - User's message
   * @returns Intent data
   */
  async analyzeIntent(message: string) {
    const prompt = `
    Analyze the following message and determine the user's intent. Respond with a JSON object.
    
    Message: ${message}
    
    Classify the message into one of these categories:
    1. create_board - User wants to create a new project board
    2. update_board - User wants to update an existing board
    3. create_task - User wants to create a new task
    4. update_task - User wants to update an existing task
    5. suggestion - User is asking for suggestions or advice
    6. general - General conversation that doesn't fit other categories
    
    Respond with a JSON object in this format:
    {
      "type": "intent_type",
      "details": "description of what the user wants",
      "boardId": "id of the board if mentioned",
      "taskId": "id of the task if mentioned"
    }
    
    Only include IDs if they are directly mentioned or clearly implied in the message.
    `;

    try {
      const response = await this.openai.chat.completions.create({
        model: openaiConfig.model,
        messages: [
          {
            role: 'system',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        console.log('No content returned from intent analysis');
        return { type: 'general' };
      }

      const intentData = JSON.parse(content);

      // Extract task IDs using regex as a fallback
      if (intentData.type === 'update_task' && !intentData.taskId) {
        const taskIdMatch =
          message.match(/task[:\s]+([a-f0-9]{24})/i) ||
          message.match(/([a-f0-9]{24})/);

        if (taskIdMatch) {
          intentData.taskId = taskIdMatch[1];
        }
      }

      return intentData;
    } catch (error) {
      console.error('Error analyzing intent:', error);

      // For create board intent detection, use simple keyword matching as a fallback
      if (
        message.toLowerCase().includes('project plan') ||
        (message.toLowerCase().includes('create') &&
          message.toLowerCase().includes('board'))
      ) {
        console.log('Fallback detected create_board intent');
        return {
          type: 'create_board',
          details: 'User wants to create a new project board',
        };
      }

      // Default to general conversation on error
      return { type: 'general' };
    }
  }

  /**
   * Get a general response from the AI for a user message
   * @param message - User's message
   * @returns AI response text
   */
  async getGeneralResponse(message: string): Promise<string> {
    const prompt = `
    You are an AI assistant for a project management app. Respond naturally to the user's query.
    
    If you cannot process the request due to API issues, provide a helpful error message.
    `;

    try {
      const response = await this.openai.chat.completions.create({
        model: openaiConfig.model,
        messages: [
          {
            role: 'system',
            content: prompt,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      return (
        response.choices[0]?.message?.content ||
        "I'm sorry, I couldn't process your request."
      );
    } catch (error) {
      console.error('Error getting response:', error);
      return "I'm having trouble connecting to my AI services right now. Your message has been saved, and I'll process it when services are restored. You can try again shortly or continue with other tasks.";
    }
  }

  /**
   * Send a message to OpenAI with context
   * @param messages - Array of message objects with role and content
   * @param temperature - Temperature setting for response creativity
   * @returns OpenAI response
   */
  async sendMessage(
    messages: ChatCompletionMessageParam[],
    temperature: number = 0.7
  ) {
    try {
      const response = await this.openai.chat.completions.create({
        model: openaiConfig.model,
        messages,
        temperature,
        max_tokens: openaiConfig.maxTokens,
      });

      return {
        content: response.choices[0]?.message?.content,
        usage: response.usage,
      };
    } catch (error) {
      console.error('Error in OpenAI API call:', error);
      throw new Error('Failed to get response from AI');
    }
  }
}
