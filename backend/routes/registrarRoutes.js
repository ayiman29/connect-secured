import express from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware.js';
import {
  addCourse,
  deleteCourse,
  addSection,
  deleteSection
} from '../controllers/registrarController.js';

const router = express.Router();


router.use(authenticateToken, authorizeRole('registrar'));

router.post('/course', addCourse);
router.delete('/course/:courseId', deleteCourse);
router.post('/section', addSection);
router.delete('/section/:courseId/:sectionId', deleteSection);

export default router;