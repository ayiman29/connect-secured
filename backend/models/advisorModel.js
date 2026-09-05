import pool from '../db.js'
import { addCourse as studentAddCourse, dropCourse as studentDropCourse } from './studentModel.js';
import { createUser } from './userModel.js';
import { getEmailLookup } from '../lib/security/cryptoService.js';
import { decryptWithRsa } from '../lib/security/crypto101RsaService.js';
import { decryptCourseFields, decryptSectionFields } from '../lib/security/courseCryptoService.js';


export async function createAdvisor(advisorId, email, name, password) {
  const user = await createUser(email, name, password);

  await pool.query(
    `INSERT INTO advisor (advisor_id, user_id) VALUES (?, ?)`,
    [advisorId, user.user_id]
  );
  return { advisorId, email: user.email };
}


export async function getWaitingStudentsCourses() {
  const [rows] = await pool.query(
    `SELECT 
      st.student_id,
      u.name_encrypted AS student_name_encrypted,
      st.status,
      c.course_id,
      c.title_encrypted,
      c.name_encrypted AS course_name_encrypted,
      c.exam_schedule_encrypted,
      s.section_id,
      s.schedule_encrypted,
      s.faculty_encrypted
    FROM manages sc
    JOIN student st ON sc.student_id = st.student_id
    JOIN user u ON st.user_id = u.user_id
    JOIN course c ON sc.course_id = c.course_id
    JOIN section s ON sc.course_id = s.course_id AND sc.section_id = s.section_id
    WHERE st.status = 'waiting'
    ORDER BY st.student_id, c.course_id, s.section_id`
  );

  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.student_id]) {
      grouped[row.student_id] = {
        student_id: row.student_id,
        student_name: await decryptWithRsa(row.student_name_encrypted),
        status: row.status,
        courses: []
      };
    }
    grouped[row.student_id].courses.push({
      course_id: row.course_id,
      title: (await decryptCourseFields(row)).title,
      section_id: row.section_id,
      schedule: (await decryptSectionFields(row)).schedule,
      faculty: (await decryptSectionFields(row)).faculty
    });
  }

  return Object.values(grouped);
}



export async function approveAdvising(studentId, status) {
  await pool.query(
    `UPDATE student
     SET status = ?
     WHERE student_id = ?`,
    [status, studentId]
  );

  if (status === 'denied') {
    const [courses] = await pool.query(
      `SELECT course_id, section_id FROM manages WHERE student_id = ?`,
      [studentId]
    );

    for (const { course_id, section_id } of courses) {
      await pool.query(
        `UPDATE section
         SET seat_availability = seat_availability + 1
         WHERE course_id = ? AND section_id = ?`,
        [course_id, section_id]
      );
    }
  }
}


export async function advisorAddCourse(advisorId, studentId, courseId, sectionId) {
  return await studentAddCourse(studentId, courseId, sectionId, advisorId);
}


export async function advisorDropCourse(advisorId, studentId, courseId, sectionId) {
  return await studentDropCourse(studentId, courseId, sectionId, advisorId);
}

export async function getStudentCourses(studentId) {
  const [courses] = await pool.query(
    `SELECT 
        c.course_id,
        c.title_encrypted,
        c.name_encrypted AS course_name_encrypted,
        c.exam_schedule_encrypted,
        s.section_id,
        s.schedule_encrypted,
        s.faculty_encrypted,
        c.course_credit,
        s.seat_availability
  
     FROM manages m
     JOIN course c ON m.course_id = c.course_id
     JOIN section s ON m.course_id = s.course_id AND m.section_id = s.section_id
     WHERE m.student_id = ?`,
    [studentId]
  );
  return Promise.all(courses.map(async (course) => ({
    ...course,
    ...(await decryptCourseFields(course)),
    ...(await decryptSectionFields(course)),
  })));
}


export async function fetchUnselectedCourses(studentId) {
  const query = `
    SELECT 
      c.course_id,
        c.title_encrypted,
      c.name_encrypted AS course_name_encrypted,
      c.exam_schedule_encrypted,
      c.course_credit,
      s.section_id,
      s.schedule_encrypted,
      s.seat_availability,
      s.faculty_encrypted
    FROM course c
    JOIN section s 
      ON c.course_id = s.course_id
    /* Only return rows if the student exists */
    WHERE EXISTS (
      SELECT 1 
      FROM student st 
      WHERE st.student_id = ?
    )
    /* Exclude sections already selected by this student */
      AND NOT EXISTS (
        SELECT 1
        FROM manages m
        WHERE m.student_id = ?
          AND m.course_id  = c.course_id
          AND m.section_id = s.section_id
      )
    ORDER BY c.course_id, s.section_id
  `;

  const [rows] = await pool.query(query, [studentId, studentId]);

  const courseMap = new Map();
  
  for (const row of rows) {
    if (!courseMap.has(row.course_id)) {
      courseMap.set(row.course_id, {
        course_id: row.course_id,
        ...(await decryptCourseFields(row)),
        course_credit: row.course_credit,
        sections: []
      });
    }

    
    courseMap.get(row.course_id).sections.push({
      section_id: row.section_id,
      schedule: (await decryptSectionFields(row)).schedule,
      seat_availability: row.seat_availability,
      faculty: (await decryptSectionFields(row)).faculty
    });
  }

  return Array.from(courseMap.values());
}


export async function getCourseDetail(courseId) {
  const query = `
    SELECT 
      c.course_id,
      c.title_encrypted,
      c.name_encrypted AS course_name_encrypted,
      c.exam_schedule_encrypted,
      c.course_credit,
      s.section_id,
      s.schedule_encrypted,
      s.seat_availability,
      s.faculty_encrypted
    FROM course c
    JOIN section s ON c.course_id = s.course_id
    WHERE c.course_id = ?
    ORDER BY s.section_id
  `;

  const [rows] = await pool.query(query, [courseId]);

  if (rows.length === 0) return null;

  const course = {
    course_id: rows[0].course_id,
    ...(await decryptCourseFields(rows[0])),
    course_credit: rows[0].course_credit,
    sections: []
  };

  for (const row of rows) {
    course.sections.push({
      section_id: row.section_id,
      schedule: (await decryptSectionFields(row)).schedule,
      seat_availability: row.seat_availability,
      faculty: (await decryptSectionFields(row)).faculty
    });
  }

  return course;

}


export async function getAdvisorIdByEmail(email) {
  const emailLookup = getEmailLookup(email);

  const [rows] = await pool.query(
    `SELECT a.advisor_id, u.email_encrypted
     FROM advisor a
     JOIN user u ON a.user_id = u.user_id
     WHERE u.email_lookup = ?
     LIMIT 1`,
    [emailLookup]
  );
  if (rows.length === 0) return null;

  return {
    advisor_id: rows[0].advisor_id,
    email: await decryptWithRsa(rows[0].email_encrypted),
  };
}

export async function getAdvisorIdByUserId(userId) {
  const [rows] = await pool.query(
    `SELECT advisor_id FROM advisor WHERE user_id = ? LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

export default {
  getAdvisorIdByEmail,
};

