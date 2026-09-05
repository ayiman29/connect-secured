import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import {
  getOrCreateSession,
  getMessages,
  sendMessage,
  getAdvisorContacts,
  getChatAdvisors,
} from '../controllers/chatController.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/session', getOrCreateSession);
router.get('/messages/:sessionId', getMessages);
router.post('/send', sendMessage);
router.get('/advisors', getChatAdvisors);
router.get('/advisor/contacts', getAdvisorContacts);

export default router;
