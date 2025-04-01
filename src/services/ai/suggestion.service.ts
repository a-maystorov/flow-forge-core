import { Types } from 'mongoose';
import OpenAI from 'openai';
import openaiConfig from '../../config/openai';
import Board from '../../models/board.model';
import Task from '../../models/task.model';

export class SuggestionService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: openaiConfig.apiKey,
      // Remove the organization parameter since it's causing authentication errors
    });
  }

  /**
   * Get AI suggestions based on user query and optional board context
   * @param query - User's question or request for suggestions
   * @param boardId - Optional board ID for context
   * @returns Array of suggestion strings
   */
  async getSuggestions(query: string, boardId?: string | Types.ObjectId) {
    try {
      let context = '';

      // If boardId is provided, fetch board data for context
      if (boardId) {
        const board = await Board.findById(boardId).populate({
          path: 'columns',
          populate: {
            path: 'tasks',
            populate: {
              path: 'subtasks',
            },
          },
        });

        if (board) {
          context = `BOARD CONTEXT:\n${JSON.stringify(board.toObject(), null, 2)}\n\n`;
        }
      }

      const prompt = `
      You are an AI assistant helping with project management.
      
      ${context}
      
      USER QUERY:
      ${query}
      
      Based on the user's query${boardId ? ' and the board context' : ''}, provide helpful suggestions for project management.
      Consider:
      - Task organization and prioritization
      - Workflow improvements
      - Project structure recommendations
      - Best practices for task management
      
      Respond with a JSON array of suggestion strings. Each suggestion should be clear, actionable, and relevant to the user's query.
      Format your response as:
      {
        "suggestions": [
          "Suggestion 1 - with brief explanation",
          "Suggestion 2 - with brief explanation",
          "Suggestion 3 - with brief explanation"
        ]
      }
      
      Provide 3-5 high-quality suggestions.
      `;

      const response = await this.openai.chat.completions.create({
        model: openaiConfig.model,
        messages: [
          {
            role: 'system',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        return [
          "I couldn't generate suggestions at this time. Please try again with more details.",
        ];
      }

      const data = JSON.parse(content);
      return data.suggestions || [];
    } catch (error) {
      console.error('Error getting suggestions:', error);
      return [
        'I encountered an error while generating suggestions. Please try again later.',
      ];
    }
  }

  /**
   * Get task improvement suggestions
   * @param taskId - ID of the task to analyze
   * @returns Array of suggestion strings
   */
  async getTaskImprovementSuggestions(taskId: string | Types.ObjectId) {
    try {
      const task = await Task.findById(taskId).populate('subtasks');

      if (!task) {
        throw new Error('Task not found');
      }

      const prompt = `
      You are an AI assistant helping with project management.
      
      TASK:
      ${JSON.stringify(task.toObject(), null, 2)}
      
      Analyze this task and provide suggestions for improvement.
      Consider:
      - Clarity of title and description
      - Task breakdown and subtasks
      - Completeness of information
      - Status and priority appropriateness
      
      Respond with a JSON array of suggestion strings. Each suggestion should be clear, actionable, and specific to this task.
      Format your response as:
      {
        "suggestions": [
          "Suggestion 1 - with brief explanation",
          "Suggestion 2 - with brief explanation",
          "Suggestion 3 - with brief explanation"
        ]
      }
      
      Provide 3-5 high-quality suggestions.
      `;

      const response = await this.openai.chat.completions.create({
        model: openaiConfig.model,
        messages: [
          {
            role: 'system',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        return ["I couldn't generate suggestions for this task at this time."];
      }

      const data = JSON.parse(content);
      return data.suggestions || [];
    } catch (error) {
      console.error('Error getting task improvement suggestions:', error);
      return [
        'I encountered an error while analyzing this task. Please try again later.',
      ];
    }
  }

  /**
   * Get board organization suggestions
   * @param boardId - ID of the board to analyze
   * @returns Array of suggestion strings
   */
  async getBoardOrganizationSuggestions(boardId: string | Types.ObjectId) {
    try {
      const board = await Board.findById(boardId).populate({
        path: 'columns',
        populate: {
          path: 'tasks',
        },
      });

      if (!board) {
        throw new Error('Board not found');
      }

      const prompt = `
      You are an AI assistant helping with project management.
      
      BOARD:
      ${JSON.stringify(board.toObject(), null, 2)}
      
      Analyze this board and provide suggestions for better organization.
      Consider:
      - Column structure and naming
      - Task distribution across columns
      - Task prioritization
      - Workflow efficiency
      
      Respond with a JSON array of suggestion strings. Each suggestion should be clear, actionable, and specific to this board.
      Format your response as:
      {
        "suggestions": [
          "Suggestion 1 - with brief explanation",
          "Suggestion 2 - with brief explanation",
          "Suggestion 3 - with brief explanation"
        ]
      }
      
      Provide 3-5 high-quality suggestions.
      `;

      const response = await this.openai.chat.completions.create({
        model: openaiConfig.model,
        messages: [
          {
            role: 'system',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        return ["I couldn't generate suggestions for this board at this time."];
      }

      const data = JSON.parse(content);
      return data.suggestions || [];
    } catch (error) {
      console.error('Error getting board organization suggestions:', error);
      return [
        'I encountered an error while analyzing this board. Please try again later.',
      ];
    }
  }
}
