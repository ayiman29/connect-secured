import express from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware.js';
import {
  addCourse,
  deleteCourse,
  addSection,
  deleteSection,
  getAllReports,
  decryptReport,
  deleteReport,
} from '../controllers/registrarController.js';

const router = express.Router();


router.use(authenticateToken, authorizeRole('registrar'));

router.post('/course', addCourse);
router.delete('/course/:courseId', deleteCourse);
router.post('/section', addSection);
router.delete('/section/:courseId/:sectionId', deleteSection);

// Student Problem Reports (RSA-encrypted)
router.get('/reports', getAllReports);
router.post('/reports/:reportId/decrypt', decryptReport);
router.delete('/reports/:reportId', deleteReport);

export default router;