import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import {
  listComments,
  createComment,
  updateComment,
  deleteComment,
} from '../controllers/commentController.js';

const router = express.Router();

router.use(authenticateToken);
router.get('/', listComments);
router.post('/', createComment);
router.put('/:commentId', updateComment);
router.delete('/:commentId', deleteComment);

export default router;
