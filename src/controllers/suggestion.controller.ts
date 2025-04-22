import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { SuggestionStatus, socketService } from '../config/socket';
import { suggestionService } from '../services/suggestion/suggestion.service';

/**
 * Suggestion controller for handling suggestion-related operations
 */
export class SuggestionController {
  /**
   * Get a suggestion by ID
   */
  async getSuggestion(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!Types.ObjectId.isValid(id)) {
        res.status(400).json({ error: 'Invalid suggestion ID' });
        return;
      }

      const suggestion = await suggestionService.getSuggestion(id);

      if (!suggestion) {
        res.status(404).json({ error: 'Suggestion not found' });
        return;
      }

      res.json(suggestion);
    } catch (error) {
      console.error('Error getting suggestion:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get all suggestions for a user
   */
  async getSuggestionsByUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId as string;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const suggestions = await suggestionService.getSuggestionsByUser(userId);
      res.json(suggestions);
    } catch (error) {
      console.error('Error getting suggestions by user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get all suggestions for a chat session
   */
  async getSuggestionsBySession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!Types.ObjectId.isValid(sessionId)) {
        res.status(400).json({ error: 'Invalid session ID' });
        return;
      }

      const suggestions =
        await suggestionService.getSuggestionsBySession(sessionId);
      res.json(suggestions);
    } catch (error) {
      console.error('Error getting suggestions by session:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Accept a suggestion
   */
  async acceptSuggestion(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { message } = req.body;

      if (!Types.ObjectId.isValid(id)) {
        res.status(400).json({ error: 'Invalid suggestion ID' });
        return;
      }

      const suggestion = await suggestionService.acceptSuggestion(id, message);

      if (!suggestion) {
        res.status(404).json({ error: 'Suggestion not found' });
        return;
      }

      // Emit event for real-time updates using the new method
      socketService.emitSuggestionStatusUpdate(
        suggestion.sessionId.toString(),
        suggestion._id.toString(),
        'accepted' as SuggestionStatus
      );

      res.json(suggestion);
    } catch (error) {
      console.error('Error accepting suggestion:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Reject a suggestion
   */
  async rejectSuggestion(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { message } = req.body; // Still extract message optionally for chat message

      if (!Types.ObjectId.isValid(id)) {
        res.status(400).json({ error: 'Invalid suggestion ID' });
        return;
      }

      // Pass message to service, but it's now optional
      const suggestion = await suggestionService.rejectSuggestion(id, message);

      if (!suggestion) {
        res.status(404).json({ error: 'Suggestion not found' });
        return;
      }

      // Emit event for real-time updates using the new method
      socketService.emitSuggestionStatusUpdate(
        suggestion.sessionId.toString(),
        suggestion._id.toString(),
        'rejected' as SuggestionStatus
      );

      res.json(suggestion);
    } catch (error) {
      console.error('Error rejecting suggestion:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Modify a suggestion
   */
  async modifySuggestion(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { content, message } = req.body;

      if (!Types.ObjectId.isValid(id)) {
        res.status(400).json({ error: 'Invalid suggestion ID' });
        return;
      }

      const suggestion = await suggestionService.modifySuggestion(
        id,
        content,
        message
      );

      if (!suggestion) {
        res.status(404).json({ error: 'Suggestion not found' });
        return;
      }

      // Emit event for real-time updates
      socketService.emitToChatSession(
        suggestion.sessionId.toString(),
        'suggestion_modified',
        {
          suggestionId: suggestion._id,
          type: suggestion.type,
          content: suggestion.content,
        }
      );

      res.json(suggestion);
    } catch (error) {
      console.error('Error modifying suggestion:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export const suggestionController = new SuggestionController();
