import { Types } from 'mongoose';
import OpenAI from 'openai';
import openaiConfig from '../../config/openai';
import { EntityMapperService } from './entity-mapper.service';
import { getBoardCreationPrompt } from './prompts/creation-prompts';

export class PlanningService {
  private openai: OpenAI;
  private entityMapperService: EntityMapperService;

  constructor() {
    this.openai = new OpenAI({
      apiKey: openaiConfig.apiKey,
      // Remove the organization parameter since it's causing authentication errors
    });
    this.entityMapperService = new EntityMapperService();
  }

  /**
   * Generate a project plan from user description
   * @param projectDescription - User's natural language description of the project
   * @param userId - User ID generating the plan
   * @returns Preview of the board to be created
   */
  async generateProjectPlan(
    projectDescription: string,
    userId: Types.ObjectId
  ) {
    try {
      // Create the prompt with project description
      const prompt = getBoardCreationPrompt(projectDescription);

      // Send the request to OpenAI
      const response = await this.openai.chat.completions.create({
        model: openaiConfig.model,
        messages: [
          {
            role: 'system',
            content: prompt,
          },
        ],
        temperature: openaiConfig.temperature,
        max_tokens: openaiConfig.maxTokens,
        response_format: { type: 'json_object' },
      });

      // Parse the response
      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Failed to generate project plan from AI');
      }

      const planData = JSON.parse(content);

      // Create a preview for the board
      return this.entityMapperService.createBoardPreviewFromPlan(
        planData.board,
        userId
      );
    } catch (error) {
      console.error('Error generating project plan:', error);
      throw error;
    }
  }

  /**
   * Apply an approved plan to create a new board with columns and tasks
   * @param previewId - ID of the approved preview
   * @returns Created board with columns and tasks
   */
  async applyProjectPlan(previewId: string | Types.ObjectId) {
    try {
      // This will be handled by the entityMapperService when the preview is approved
      return this.entityMapperService.applyPreview(previewId);
    } catch (error) {
      console.error('Error applying project plan:', error);
      throw error;
    }
  }
}
