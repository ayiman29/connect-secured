import * as studentModel from '../models/studentModel.js';
import * as reportModel from '../models/reportModel.js';
import { encryptProblemReport } from '../lib/security/crypto101RsaService.js';

export async function getAllCourses(req, res) {
  try {
    const courses = await studentModel.fetchCoursesWithSections();
    res.status(200).json(courses);
  } catch (err) {
    console.error("Error fetching courses:", err);
    res.status(500).json({ error: "Failed to fetch courses" });
  }
}
export async function getStudentIdFromEmail(req, res) {
  try {
    const email =
      req.params.email ??
      req.query.email ??
      req.body?.email ??
      null;

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    const row = await studentModel.getStudentIdByEmail(email);
    if (!row) {
      return res.status(404).json({ error: "student not found for provided email" });
    }

    return res.json({ student_id: row.student_id, email: row.email });
  } catch (err) {
    console.error("getStudentIdFromEmail error:", err);
    return res.status(500).json({ error: "internal server error" });
  }
}


export async function getCourseDetail(req, res) {
  const courseId = parseInt(req.params.courseId);

  if (isNaN(courseId)) {
    return res.status(400).json({ error: "Invalid course ID" });
  }

  try {
    const course = await studentModel.fetchCoursesWithSections(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }
    res.status(200).json(course);
  } catch (err) {
    console.error("Error fetching course detail:", err);
    res.status(500).json({ error: "Failed to fetch course details" });
  }
}

export async function addCourse(req, res) {
  const { studentId, courseId, sectionId, advisorId } = req.body;

  if (!studentId || !courseId || !sectionId || !advisorId) {
    return res.status(400).json({ error: "Missing required fields: studentId, courseId, sectionId, advisorId" });
  }

  try {
    await studentModel.addCourse(studentId, courseId, sectionId, advisorId);
    res.status(200).json({ message: "Course added successfully." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function dropCourse(req, res) {
  const { studentId, courseId, sectionId } = req.body;

  if (!studentId || !courseId || !sectionId) {
    return res.status(400).json({ error: "Missing required fields: studentId, courseId, sectionId" });
  }

  try {
    await studentModel.dropCourse(studentId, courseId, sectionId);
    res.status(200).json({ message: "Course dropped successfully." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getMyCourses(req, res) {
  const studentId = parseInt(req.params.studentId);

  if (isNaN(studentId)) {
    return res.status(400).json({ error: "Missing or invalid studentId in request parameters" });
  }

  try {
    const courses = await studentModel.getMyCourses(studentId);
    res.status(200).json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getStudentInfo(req, res) {
  const studentId = parseInt(req.params.studentId);

  if (isNaN(studentId)) {
    return res.status(400).json({ error: 'Missing or invalid studentId in request parameters' });
  }

  try {
    const student = await studentModel.getStudentInfo(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.status(200).json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function confirmAdvising(req, res) {
  const studentId = parseInt(req.params.studentId);

  if (isNaN(studentId)) {
    return res.status(400).json({ error: 'Missing or invalid studentId in request parameters' });
  }

  try {
    await studentModel.confirmAdvising(studentId);
    res.status(200).json({ message: 'Advising status updated to waiting.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function submitProblemReport(req, res) {
  try {
    const { problemText } = req.body;
    let studentId = req.body.studentId;

    if (!problemText || !String(problemText).trim()) {
      return res.status(400).json({ error: 'Problem description cannot be empty.' });
    }

    if (!studentId && req.user?.email) {
      const studentRow = await studentModel.getStudentIdByEmail(req.user.email);
      studentId = studentRow?.student_id;
    }

    if (!studentId) {
      return res.status(400).json({ error: 'Valid studentId is required.' });
    }

    // Encrypt problem with Registrar RSA public key using crypto101
    const encryptedProblem = await encryptProblemReport(String(problemText).trim());

    const result = await reportModel.createReport(Number(studentId), encryptedProblem);
    return res.status(201).json({
      message: 'Report submitted successfully.',
      report_id: result.report_id,
    });
  } catch (err) {
    console.error('Error submitting problem report:', err);
    return res.status(500).json({ error: err.message || 'Failed to submit problem report.' });
  }
}

