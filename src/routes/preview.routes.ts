import express from 'express';
import { z } from 'zod';
import { auth, validateObjectId } from '../middleware';
import {
  BoardEntity,
  ColumnEntity,
  IPreview,
  SubtaskEntity,
  TaskEntity,
} from '../models/preview.model';
import { EntityMapperService } from '../services/ai/entity-mapper.service';
import { PreviewService } from '../services/preview.service';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError } from '../utils/errors';

const router = express.Router();

// Initialize services
const previewService = new PreviewService();
const entityMapperService = new EntityMapperService();

// Preview update schema
const previewUpdateSchema = z.object({
  proposedEntity: z
    .record(z.any())
    .refine((obj) => Object.keys(obj).length > 0, {
      message: 'Proposed entity must not be empty',
    }),
});

// Type for entity with type discriminator
type EntityWithTypeName = {
  entityType: IPreview['entityType'];
} & Partial<BoardEntity | ColumnEntity | TaskEntity | SubtaskEntity>;

// Function to validate EntityType
const validateEntityType = (data: EntityWithTypeName) => {
  const entityType = data.entityType;
  switch (entityType) {
    case 'board': {
      const boardData = data as Partial<BoardEntity>;
      return typeof boardData.name === 'string';
    }
    case 'column': {
      const columnData = data as Partial<ColumnEntity>;
      return (
        typeof columnData.name === 'string' && columnData.boardId !== undefined
      );
    }
    case 'task': {
      const taskData = data as Partial<TaskEntity>;
      return (
        typeof taskData.title === 'string' &&
        taskData.columnId !== undefined &&
        taskData.status !== undefined
      );
    }
    case 'subtask': {
      const subtaskData = data as Partial<SubtaskEntity>;
      return (
        typeof subtaskData.title === 'string' &&
        subtaskData.taskId !== undefined
      );
    }
    default:
      return false;
  }
};

// Get all previews for the current user
router.get(
  '/user',
  auth,
  asyncHandler(async (req, res) => {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const typedUserId = typeof userId === 'string' ? userId : userId.toString();

    const previews = await previewService.getUserPreviews(typedUserId);

    res.json({ previews });
  })
);

// Get a specific preview by ID
router.get(
  '/:id',
  auth,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const typedUserId = typeof userId === 'string' ? userId : userId.toString();

    const preview = await previewService.getPreviewById(id, typedUserId);

    if (!preview) {
      throw new NotFoundError('Preview not found');
    }

    res.json({ preview });
  })
);

// Approve a preview and apply changes
router.post(
  '/:id/approve',
  auth,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const typedUserId = typeof userId === 'string' ? userId : userId.toString();

    const preview = await previewService.getPreviewById(id, typedUserId);

    if (!preview) {
      throw new NotFoundError('Preview not found');
    }

    // Apply the preview changes
    const result = await entityMapperService.applyPreview(id);

    // Update preview status to approved
    await previewService.updatePreviewStatus(id, 'approved');

    res.json({
      message: 'Preview approved successfully',
      result,
    });
  })
);

// Reject a preview
router.post(
  '/:id/reject',
  auth,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const typedUserId = typeof userId === 'string' ? userId : userId.toString();

    const preview = await previewService.getPreviewById(id, typedUserId);

    if (!preview) {
      throw new NotFoundError('Preview not found');
    }

    // Update preview status to rejected
    await previewService.updatePreviewStatus(id, 'rejected');

    res.json({ message: 'Preview rejected successfully' });
  })
);

// Update a preview's proposed entity
router.patch(
  '/:id',
  auth,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { proposedEntity } = previewUpdateSchema.parse(req.body);
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const typedUserId = typeof userId === 'string' ? userId : userId.toString();

    const preview = await previewService.getPreviewById(id, typedUserId);

    if (!preview) {
      throw new NotFoundError('Preview not found');
    }

    // Check if the proposedEntity is valid for preview's entity type
    if (
      preview.entityType &&
      !validateEntityType({
        ...proposedEntity,
        entityType: preview.entityType,
      })
    ) {
      return res.status(400).json({
        error: `Invalid entity data for type: ${preview.entityType}`,
      });
    }

    // Cast proposedEntity to the correct EntityType based on preview.entityType
    let typedEntity;
    switch (preview.entityType) {
      case 'board':
        typedEntity = proposedEntity as BoardEntity;
        break;
      case 'column':
        typedEntity = proposedEntity as ColumnEntity;
        break;
      case 'task':
        typedEntity = proposedEntity as TaskEntity;
        break;
      case 'subtask':
        typedEntity = proposedEntity as SubtaskEntity;
        break;
      default:
        return res.status(400).json({
          error: `Unknown entity type: ${preview.entityType}`,
        });
    }

    // Update the preview with modified data
    const updatedPreview = await previewService.updatePreviewProposedEntity(
      id,
      typedEntity
    );

    res.json({
      message: 'Preview updated successfully',
      preview: updatedPreview,
    });
  })
);

// Delete a preview
router.delete(
  '/:id',
  auth,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const typedUserId = typeof userId === 'string' ? userId : userId.toString();

    const preview = await previewService.getPreviewById(id, typedUserId);

    if (!preview) {
      throw new NotFoundError('Preview not found');
    }

    await previewService.deletePreview(id);

    res.json({ message: 'Preview deleted successfully' });
  })
);

export default router;
