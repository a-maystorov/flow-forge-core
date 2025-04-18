import { ChatCompletion, ChatCompletionMessageParam } from 'openai/resources';
import openai from '../../config/openai';

/**
 * Message role in a conversation
 */
export enum MessageRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
}

// Valid OpenAI roles - used for type checking
type OpenAIRole = 'system' | 'user' | 'assistant';

/**
 * Template variable definition
 */
export interface TemplateVariable {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

/**
 * Template section (message in a conversation)
 */
export interface TemplateSection {
  role: MessageRole;
  content: string;
  variables?: TemplateVariable[];
}

/**
 * Complete prompt template
 */
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  sections: TemplateSection[];
}

/**
 * Template variable values for substitution
 */
export type TemplateVariables = Record<string, string>;

/**
 * Parse error
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly content: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * Service for interacting with OpenAI API
 * Includes template processing and response parsing
 */
export class OpenAIService {
  private defaultModel = 'gpt-4o';
  private templates = new Map<string, PromptTemplate>();

  /**
   * Register a prompt template
   */
  registerTemplate(template: PromptTemplate): void {
    if (this.templates.has(template.id)) {
      throw new Error(`Template with ID '${template.id}' already exists`);
    }
    this.templates.set(template.id, template);
  }

  /**
   * Get a registered template
   */
  getTemplate(id: string): PromptTemplate {
    const template = this.templates.get(id);
    if (!template) {
      throw new Error(`Template with ID '${id}' not found`);
    }
    return template;
  }

  /**
   * Process a template by substituting variables
   */
  processTemplate(
    templateId: string,
    variables: TemplateVariables = {}
  ): ChatCompletionMessageParam[] {
    const template = this.getTemplate(templateId);

    return template.sections.map((section) => {
      let content = section.content;

      // Process variables
      if (section.variables && section.variables.length > 0) {
        for (const variable of section.variables) {
          const value = variables[variable.name] || variable.defaultValue;

          // Check if required variable is missing
          if (variable.required && value === undefined) {
            throw new Error(
              `Required variable '${variable.name}' is missing in template '${template.id}'`
            );
          }

          // Replace variable in content
          if (value !== undefined) {
            const regex = new RegExp(`{{\\s*${variable.name}\\s*}}`, 'g');
            content = content.replace(regex, value);
          }
        }
      }

      // Create message
      const roleValue = section.role.toLowerCase();

      // Ensure we only use valid OpenAI roles
      // If the role is not valid, default to 'user'
      const role =
        roleValue === 'system' ||
        roleValue === 'user' ||
        roleValue === 'assistant'
          ? (roleValue as OpenAIRole)
          : 'user';

      return {
        role,
        content,
      };
    });
  }

  /**
   * Generate a completion using a template
   *
   * @param templateId ID of the template to use
   * @param variables Variable values to substitute
   * @param options Options for the completion
   * @param parseOptions Options for parsing the response
   * @returns Parsed response of the specified type
   */
  async generateFromTemplate<T>(
    templateId: string,
    variables: TemplateVariables = {},
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {},
    parseOptions: { extractFromMarkdown?: boolean } = {}
  ): Promise<T> {
    const messages = this.processTemplate(templateId, variables);
    const completion = await this.generateChatCompletion(messages, options);
    return this.parseJSON<T>(completion, parseOptions);
  }

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

  /**
   * Parse JSON from a completion
   *
   * @param completion The completion to parse
   * @param options Options for parsing
   * @returns Parsed JSON of the specified type
   */
  parseJSON<T>(
    completion: ChatCompletion,
    options: { extractFromMarkdown?: boolean } = {}
  ): T {
    const content = this.extractContent(completion);
    const { extractFromMarkdown = true } = options;

    if (!content) {
      throw new ParseError('No content in completion', '');
    }

    // Extract from markdown code blocks if needed
    let processedContent = content.trim();
    if (extractFromMarkdown) {
      const jsonBlockRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/;
      const match = processedContent.match(jsonBlockRegex);
      if (match && match[1]) {
        processedContent = match[1].trim();
      }
    }

    // Extract JSON object if present
    const objectStartIndex = processedContent.indexOf('{');
    const objectEndIndex = processedContent.lastIndexOf('}');

    if (
      objectStartIndex !== -1 &&
      objectEndIndex !== -1 &&
      objectEndIndex > objectStartIndex
    ) {
      processedContent = processedContent.substring(
        objectStartIndex,
        objectEndIndex + 1
      );
    }

    // Parse JSON
    try {
      return JSON.parse(processedContent) as T;
    } catch (error) {
      throw new ParseError(
        `Failed to parse JSON: ${(error as Error).message}`,
        content,
        error as Error
      );
    }
  }
}

export const openAIService = new OpenAIService();
