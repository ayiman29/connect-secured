import pool from '../db.js';
import { createUser } from './userModel.js';


export async function createRegistrar(registrarId, email, name, password) {
  const user = await createUser(email, name, password);

  await pool.query(
    `INSERT INTO registrar (registrar_id, user_id) VALUES (?, ?)`,
    [registrarId, user.user_id]
  );
  return { registrarId, email: user.email };
}

export async function addCourse(courseId, title, name, examSchedule, courseCredit, registrarId) {
  await pool.query(
    `INSERT INTO course (course_id, title, name, exam_schedule, course_credit, registrar_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       name = VALUES(name),
       exam_schedule = VALUES(exam_schedule),
       course_credit = VALUES(course_credit),
       registrar_id = VALUES(registrar_id)`,
    [courseId, title, name, examSchedule, courseCredit, registrarId]
  );
}


export async function deleteCourse(courseId) {
  await pool.query(
    `DELETE FROM course WHERE course_id = ?`,
    [courseId]
  );
}


export async function addSection(courseId, sectionId, schedule, seatAvailability = 40, faculty) {
  await pool.query(
    `INSERT INTO section (course_id, section_id, schedule, seat_availability, faculty)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       schedule = VALUES(schedule),
       seat_availability = VALUES(seat_availability),
       faculty = VALUES(faculty)`,
    [courseId, sectionId, schedule, seatAvailability, faculty]
  );
}


export async function deleteSection(courseId, sectionId) {
  await pool.query(
    `DELETE FROM section 
     WHERE course_id = ? AND section_id = ?`,
    [courseId, sectionId]
  );
}
