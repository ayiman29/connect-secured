import pool from '../db.js';
import { createUser } from './userModel.js';
import { encryptCourseFields, encryptSectionFields } from '../lib/security/courseCryptoService.js';


export async function createRegistrar(registrarId, email, name, password, address, phone) {
  const user = await createUser(email, name, password, address, phone);

  await pool.query(
    `INSERT INTO registrar (registrar_id, user_id) VALUES (?, ?)`,
    [registrarId, user.user_id]
  );
  return { registrarId, email: user.email };
}

export async function addCourse(courseId, title, name, examSchedule, courseCredit, registrarId) {
  const encrypted = await encryptCourseFields({ title, name, examSchedule });
  await pool.query(
    `INSERT INTO course (course_id, title_encrypted, name_encrypted, exam_schedule_encrypted, course_credit, registrar_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title_encrypted = VALUES(title_encrypted),
       name_encrypted = VALUES(name_encrypted),
       exam_schedule_encrypted = VALUES(exam_schedule_encrypted),
       course_credit = VALUES(course_credit),
       registrar_id = VALUES(registrar_id)`,
    [courseId, encrypted.titleEncrypted, encrypted.nameEncrypted, encrypted.examScheduleEncrypted, courseCredit, registrarId]
  );
}


export async function deleteCourse(courseId) {
  await pool.query(
    `DELETE FROM course WHERE course_id = ?`,
    [courseId]
  );
}


export async function addSection(courseId, sectionId, schedule, seatAvailability = 40, faculty) {
  const encrypted = await encryptSectionFields({ schedule, faculty });
  await pool.query(
    `INSERT INTO section (course_id, section_id, schedule_encrypted, seat_availability, faculty_encrypted)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       schedule_encrypted = VALUES(schedule_encrypted),
       seat_availability = VALUES(seat_availability),
       faculty_encrypted = VALUES(faculty_encrypted)`,
    [courseId, sectionId, encrypted.scheduleEncrypted, seatAvailability, encrypted.facultyEncrypted]
  );
}


export async function deleteSection(courseId, sectionId) {
  await pool.query(
    `DELETE FROM section 
     WHERE course_id = ? AND section_id = ?`,
    [courseId, sectionId]
  );
}
