import express from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware.js';
import {
  getAllCourses,
  getCourseDetail,
  addCourse,
  dropCourse,
  getMyCourses,
  getStudentInfo,
  confirmAdvising,
  getStudentIdFromEmail,
} from '../controllers/studentController.js';

const router = express.Router();


router.use(authenticateToken, authorizeRole('student'));

router.get('/courses', getAllCourses);
router.get('/courses/:courseId', getCourseDetail);
router.post('/add-course', addCourse);
router.post('/drop-course', dropCourse);
router.get('/my-courses/:studentId', getMyCourses);
router.get('/info/:studentId', getStudentInfo);
router.put('/confirm-advising/:studentId', confirmAdvising);
router.get('/id-by-email/:email', getStudentIdFromEmail);

export default router;