import express from 'express';
import { signup, login, setupTotp, verifyTotp, getProfile, updateProfile } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/signup',      signup);
router.post('/login',       login);
router.post('/setup-totp',  setupTotp);
router.post('/verify-totp', verifyTotp);
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);

export default router;