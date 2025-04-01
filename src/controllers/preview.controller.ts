import { Request, Response } from 'express';
import { EntityMapperService } from '../services/ai/entity-mapper.service';
import { PreviewService } from '../services/preview.service';

export class PreviewController {
  private previewService: PreviewService;
  private entityMapperService: EntityMapperService;

  constructor() {
    this.previewService = new PreviewService();
    this.entityMapperService = new EntityMapperService();
  }

  /**
   * Get a preview by ID
   */
  async getPreviewById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const preview = await this.previewService.getPreviewById(id, userId);

      if (!preview) {
        return res.status(404).json({ error: 'Preview not found' });
      }

      res.json({ preview });
    } catch (error) {
      console.error('Error getting preview:', error);
      res.status(500).json({ error: 'Failed to get preview' });
    }
  }

  /**
   * Get all previews for a user
   */
  async getUserPreviews(req: Request, res: Response) {
    try {
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const previews = await this.previewService.getUserPreviews(userId);

      res.json({ previews });
    } catch (error) {
      console.error('Error getting user previews:', error);
      res.status(500).json({ error: 'Failed to get user previews' });
    }
  }

  /**
   * Approve a preview and apply changes
   */
  async approvePreview(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const preview = await this.previewService.getPreviewById(id, userId);

      if (!preview) {
        return res.status(404).json({ error: 'Preview not found' });
      }

      // Apply the preview changes
      const result = await this.entityMapperService.applyPreview(id);

      // Update preview status to approved
      await this.previewService.updatePreviewStatus(id, 'approved');

      res.json({
        message: 'Preview approved successfully',
        result,
      });
    } catch (error) {
      console.error('Error approving preview:', error);
      res.status(500).json({ error: 'Failed to approve preview' });
    }
  }

  /**
   * Reject a preview
   */
  async rejectPreview(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const preview = await this.previewService.getPreviewById(id, userId);

      if (!preview) {
        return res.status(404).json({ error: 'Preview not found' });
      }

      // Update preview status to rejected
      await this.previewService.updatePreviewStatus(id, 'rejected');

      res.json({ message: 'Preview rejected successfully' });
    } catch (error) {
      console.error('Error rejecting preview:', error);
      res.status(500).json({ error: 'Failed to reject preview' });
    }
  }

  /**
   * Update a preview's proposed entity
   */
  async updatePreview(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { proposedEntity } = req.body;
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!proposedEntity) {
        return res.status(400).json({ error: 'Proposed entity is required' });
      }

      const preview = await this.previewService.getPreviewById(id, userId);

      if (!preview) {
        return res.status(404).json({ error: 'Preview not found' });
      }

      // Update the preview with modified data
      const updatedPreview =
        await this.previewService.updatePreviewProposedEntity(
          id,
          proposedEntity
        );

      res.json({
        message: 'Preview updated successfully',
        preview: updatedPreview,
      });
    } catch (error) {
      console.error('Error updating preview:', error);
      res.status(500).json({ error: 'Failed to update preview' });
    }
  }

  /**
   * Delete a preview
   */
  async deletePreview(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const preview = await this.previewService.getPreviewById(id, userId);

      if (!preview) {
        return res.status(404).json({ error: 'Preview not found' });
      }

      await this.previewService.deletePreview(id);

      res.json({ message: 'Preview deleted successfully' });
    } catch (error) {
      console.error('Error deleting preview:', error);
      res.status(500).json({ error: 'Failed to delete preview' });
    }
  }
}
