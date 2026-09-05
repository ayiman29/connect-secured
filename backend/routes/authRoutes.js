import express from 'express';
import { signup, login, setupTotp, verifyTotp } from '../controllers/authController.js';

const router = express.Router();

router.post('/signup',      signup);
router.post('/login',       login);
router.post('/setup-totp',  setupTotp);
router.post('/verify-totp', verifyTotp);

export default router;