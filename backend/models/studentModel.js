import pool from '../db.js'
import { createUser } from './userModel.js';
import { getEmailLookup } from '../lib/security/cryptoService.js';
import { decryptWithRsa } from '../lib/security/crypto101RsaService.js';
import { decryptCourseFields, decryptSectionFields } from '../lib/security/courseCryptoService.js';


export async function createStudent(studentId, email, name, password, credit, address, phone) {
  const user = await createUser(email, name, password, address, phone);

  await pool.query(
    `INSERT INTO student (student_id, user_id, credit, status) VALUES (?, ?, ?, ?)`,
    [studentId, user.user_id, credit, null]
  );
  return { studentId, email: user.email };
}

export async function getStudentIdByEmail(email) {
  const emailLookup = getEmailLookup(email);

  const [rows] = await pool.query(
    `SELECT st.student_id, u.email_encrypted
     FROM student st
     JOIN user u ON st.user_id = u.user_id
     WHERE u.email_lookup = ?
     LIMIT 1`,
    [emailLookup]
  );

  if (rows.length === 0) return null;

  return {
    student_id: rows[0].student_id,
    email: await decryptWithRsa(rows[0].email_encrypted),
  };
}


export async function fetchCoursesWithSections(courseId = null) {
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
    ${courseId ? 'WHERE c.course_id = ?' : ''}
    ORDER BY c.course_id, s.section_id
  `;

  const [rows] = await pool.query(query, courseId ? [courseId] : []);


  const courseMap = new Map();

  for (const row of rows) {
    const courseFields = await decryptCourseFields(row);
    const sectionFields = await decryptSectionFields(row);
    if (!courseMap.has(row.course_id)) {
      courseMap.set(row.course_id, {
        course_id: row.course_id,
        ...courseFields,
        course_credit: row.course_credit,
        sections: []
      });
    }

    courseMap.get(row.course_id).sections.push({
      section_id: row.section_id,
      schedule: sectionFields.schedule,
      seat_availability: row.seat_availability,
      faculty: sectionFields.faculty
    });
  }

  return courseId ? courseMap.get(courseId) : Array.from(courseMap.values());
}



export async function getAllCourses() {
  return await fetchCoursesWithSections();
}


export async function getCourseDetail(courseId) {
  return await fetchCoursesWithSections(courseId);
}


export async function addCourse(studentId, courseId, sectionId, advisorId) {
  const normalizedAdvisorId = Number(advisorId);
  if (!Number.isInteger(normalizedAdvisorId) || normalizedAdvisorId <= 0) {
    throw new Error('Invalid advisorId');
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[advisorRow]] = await conn.query(
      `SELECT advisor_id FROM advisor WHERE advisor_id = ?`,
      [normalizedAdvisorId]
    );
    if (!advisorRow) throw new Error(`Advisor not found for advisorId ${normalizedAdvisorId}`);

    const [[courseRow]] = await conn.query(
      `SELECT course_credit FROM course WHERE course_id = ?`,
      [courseId]
    );
    if (!courseRow) throw new Error('Course not found');
    const newCourseCredit = courseRow.course_credit;


    const [[existingEntry]] = await conn.query(
      `SELECT section_id 
       FROM manages 
       WHERE student_id = ? AND course_id = ?`,
      [studentId, courseId]
    );


    const [rows] = await conn.query(
      `SELECT COALESCE(SUM(c.course_credit), 0) AS total_credit
       FROM manages m
       JOIN course c ON m.course_id = c.course_id
       WHERE m.student_id = ?`,
      [studentId]
    );
    let totalCredit = Number(rows[0]?.total_credit) || 0;

    if (existingEntry) totalCredit -= newCourseCredit;

    if (totalCredit + newCourseCredit > 15) {
      throw new Error('Credit limit exceeded (max 15 credits)');
    }


    const [[section]] = await conn.query(
      `SELECT schedule_encrypted, seat_availability 
       FROM section 
       WHERE course_id = ? AND section_id = ?`,
      [courseId, sectionId]
    );
    if (!section) throw new Error('Section not found');
    if (section.seat_availability <= 0) throw new Error('No seats available in this section');

    const newSchedule = await decryptWithRsa(section.schedule_encrypted);

 
    if (existingEntry) {
      if (existingEntry.section_id === sectionId) {
        throw new Error('Course already added with the same section.');
      }

      const [otherCourses] = await conn.query(
        `SELECT s.schedule_encrypted
         FROM manages m
         JOIN section s ON m.course_id = s.course_id AND m.section_id = s.section_id
         WHERE m.student_id = ? 
           AND NOT (m.course_id = ? AND m.section_id = ?)`,
        [studentId, courseId, existingEntry.section_id]
      );

      const otherSchedules = await Promise.all(otherCourses.map((row) => decryptWithRsa(row.schedule_encrypted)));
      const hasClash = otherSchedules.some(schedule => schedule === newSchedule);
      if (hasClash) throw new Error('Schedule clash detected. Section not changed.');


      await conn.query(
        `DELETE FROM manages WHERE student_id = ? AND course_id = ?`,
        [studentId, courseId]
      );


      await conn.query(
        `UPDATE section
         SET seat_availability = seat_availability + 1
         WHERE course_id = ? AND section_id = ?`,
        [courseId, existingEntry.section_id]
      );
    } else {
      const [existing] = await conn.query(
        `SELECT s.schedule_encrypted
         FROM manages m
         JOIN section s ON m.course_id = s.course_id AND m.section_id = s.section_id
         WHERE m.student_id = ?`,
        [studentId]
      );

      const existingSchedules = await Promise.all(existing.map((row) => decryptWithRsa(row.schedule_encrypted)));
      const hasClash = existingSchedules.some(schedule => schedule === newSchedule);
      if (hasClash) throw new Error('Schedule clash detected. Course not added.');
    }


    await conn.query(
      `INSERT INTO manages (course_id, section_id, student_id, advisor_id)
       VALUES (?, ?, ?, ?)`,
      [courseId, sectionId, studentId, normalizedAdvisorId]
    );


    await conn.query(
      `UPDATE section
       SET seat_availability = seat_availability - 1
       WHERE course_id = ? AND section_id = ?`,
      [courseId, sectionId]
    );

  
    if (!existingEntry) {
      await conn.query(
        `UPDATE student
         SET credit = credit + ?
         WHERE student_id = ?`,
        [newCourseCredit, studentId]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}




export async function dropCourse(studentId, courseId, sectionId) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[course]] = await conn.query(
      `SELECT course_credit FROM course WHERE course_id = ?`,
      [courseId]
    );
    const courseCredit = parseInt(course?.course_credit || 0);

    const [[advisorRow]] = await conn.query(
      `SELECT advisor_id 
       FROM manages 
       WHERE student_id = ? AND course_id = ? AND section_id = ?`,
      [studentId, courseId, sectionId]
    );

    if (!advisorRow) {
      throw new Error("No matching course found to drop.");
    }

    const advisorId = advisorRow.advisor_id;

    await conn.query(
      `DELETE FROM manages
       WHERE student_id = ? AND course_id = ? AND section_id = ? AND advisor_id = ?`,
      [studentId, courseId, sectionId, advisorId]
    );

    await conn.query(
      `UPDATE section
       SET seat_availability = seat_availability + 1
       WHERE course_id = ? AND section_id = ?`,
      [courseId, sectionId]
    );

    await conn.query(
      `UPDATE student
       SET credit = credit - ?
       WHERE student_id = ?`,
      [courseCredit, studentId]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}



export async function getMyCourses(studentId) {
  const [courses] = await pool.query(
    `SELECT 
        c.course_id,
        c.title_encrypted,
        c.name_encrypted AS course_name_encrypted,
        c.exam_schedule_encrypted,
        s.section_id,
        s.schedule_encrypted,
        s.faculty_encrypted
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



export async function getStudentInfo(studentId) {
  const [info] = await pool.query(
    `SELECT st.student_id, st.user_id, st.credit, st.status, u.email_encrypted, u.name_encrypted
     FROM student st
     JOIN user u ON st.user_id = u.user_id
     WHERE st.student_id = ?
     LIMIT 1`,
    [studentId]
  );

  if (info.length === 0) return null;

  return {
    student_id: info[0].student_id,
    credit: info[0].credit,
    status: info[0].status,
    email: await decryptWithRsa(info[0].email_encrypted),
    name: await decryptWithRsa(info[0].name_encrypted),
  };
}

export async function confirmAdvising(studentId) {
  const conn = await pool.getConnection();

  try {
    const [[row]] = await conn.query(
      `SELECT COALESCE(SUM(c.course_credit), 0) AS total_credit
       FROM manages m
       JOIN course c ON m.course_id = c.course_id
       WHERE m.student_id = ?`,
      [studentId]
    );

    const totalCredit = parseInt(row?.total_credit || 0);

    if (totalCredit < 3) {
      throw new Error("Advising cannot be confirmed. Minimum 3 credits required.");
    }


    await conn.query(
      `UPDATE student
       SET status = 'waiting'
       WHERE student_id = ?`,
      [studentId]
    );
  } finally {
    conn.release();
  }
}


// issue: seat availability not being checked (SOLVED)
// issue: when max_credit, can't swap course (SOLVED)
// issue: advisor email used but not needed, use some default? ( SOLVED;( )