import express from 'express';
import { suggestionController } from '../controllers/suggestion.controller';
import auth from '../middleware/auth.middleware';
import validateObjectId from '../middleware/validateObjectId.middleware';

const router = express.Router();

router.get('/:id', auth, validateObjectId('id'), (req, res) =>
  suggestionController.getSuggestion(req, res)
);

router.get('/user/all', auth, validateObjectId('id'), (req, res) =>
  suggestionController.getSuggestionsByUser(req, res)
);
router.get(
  '/session/:sessionId',
  auth,
  validateObjectId('sessionId'),
  (req, res) => suggestionController.getSuggestionsBySession(req, res)
);

router.post('/:id/accept', auth, validateObjectId('id'), (req, res) =>
  suggestionController.acceptSuggestion(req, res)
);

router.post('/:id/reject', auth, validateObjectId('id'), (req, res) =>
  suggestionController.rejectSuggestion(req, res)
);

router.put('/:id', auth, validateObjectId('id'), (req, res) =>
  suggestionController.modifySuggestion(req, res)
);

export default router;
