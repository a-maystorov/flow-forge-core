import { Types } from 'mongoose';
import Preview, { EntityType } from '../models/preview.model';
import { EntityMapperService } from './ai/entity-mapper.service';

export class PreviewService {
  private previewExpirationHours: number = 24;
  private entityMapperService: EntityMapperService | null = null;

  constructor() {
    // Lazy initialize EntityMapperService to avoid circular dependency
    this.entityMapperService = null;
  }

  // Lazy getter for EntityMapperService to prevent circular dependencies
  private getEntityMapperService(): EntityMapperService {
    if (!this.entityMapperService) {
      this.entityMapperService = new EntityMapperService();
    }
    return this.entityMapperService;
  }

  /**
   * Create a new preview
   * @param userId User ID
   * @param operation Operation type (create, update, delete)
   * @param entityType Entity type (board, column, task, subtask)
   * @param proposedEntity The proposed entity
   * @param originalEntity The original entity (for updates and deletes)
   * @returns Created preview
   */
  async createPreview(
    userId: string | Types.ObjectId,
    operation: 'create' | 'update' | 'delete',
    entityType: 'board' | 'column' | 'task' | 'subtask',
    proposedEntity: EntityType,
    originalEntity?: EntityType
  ) {
    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.previewExpirationHours);

    // Create the preview
    const preview = new Preview({
      userId: new Types.ObjectId(userId),
      operation,
      entityType,
      proposedEntity,
      originalEntity,
      status: 'pending',
      expiresAt,
    });

    await preview.save();
    return preview;
  }

  /**
   * Get a preview by ID with user verification
   * @param previewId Preview ID
   * @param userId User ID for verification, or null for system operations
   * @returns Preview document or null if not found or unauthorized
   */
  async getPreviewById(
    previewId: string | Types.ObjectId,
    userId: string | Types.ObjectId | null
  ) {
    const preview = await Preview.findById(previewId);

    if (!preview) {
      return null;
    }

    // If userId is null, skip user validation (system operation)
    if (userId === null) {
      return preview;
    }

    // Otherwise, validate user ownership
    if (preview.userId.toString() !== userId.toString()) {
      return null;
    }

    return preview;
  }

  /**
   * Get all previews for a user
   * @param userId User ID
   * @returns Array of preview documents
   */
  async getUserPreviews(userId: string | Types.ObjectId) {
    return await Preview.find({
      userId: new Types.ObjectId(userId),
    }).sort({ createdAt: -1 });
  }

  /**
   * Get all pending previews for a user
   * @param userId User ID
   * @returns Array of pending preview documents
   */
  async getPendingPreviews(userId: string | Types.ObjectId) {
    return await Preview.find({
      userId: new Types.ObjectId(userId),
      status: 'pending',
    }).sort({ createdAt: -1 });
  }

  /**
   * Update a preview's status
   * @param previewId Preview ID
   * @param status New status
   * @returns Updated preview document
   */
  async updatePreviewStatus(
    previewId: string | Types.ObjectId,
    status: 'approved' | 'rejected'
  ) {
    const preview = await Preview.findByIdAndUpdate(
      previewId,
      { status },
      { new: true }
    );

    if (!preview) {
      throw new Error('Preview not found');
    }

    return preview;
  }

  /**
   * Update a preview's proposed entity
   * @param previewId Preview ID
   * @param proposedEntity Updated entity data
   * @returns Updated preview document
   */
  async updatePreviewProposedEntity(
    previewId: string | Types.ObjectId,
    proposedEntity: EntityType
  ) {
    const preview = await Preview.findByIdAndUpdate(
      previewId,
      {
        proposedEntity,
        status: 'pending', // Reset status to pending after changes
      },
      { new: true }
    );

    if (!preview) {
      throw new Error('Preview not found');
    }

    return preview;
  }

  /**
   * Delete a preview
   * @param previewId Preview ID
   * @returns Deletion result
   */
  async deletePreview(previewId: string | Types.ObjectId) {
    const result = await Preview.findByIdAndDelete(previewId);

    if (!result) {
      throw new Error('Preview not found');
    }

    return { success: true };
  }

  /**
   * Clean up expired previews
   * @returns Number of deleted previews
   */
  async cleanupExpiredPreviews() {
    const result = await Preview.deleteMany({
      expiresAt: { $lt: new Date() },
      status: 'pending',
    });

    return result.deletedCount;
  }
}
