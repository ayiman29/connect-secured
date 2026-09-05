import 'dotenv/config';
import db from '../db.js';
import { ensureServerKeys, encryptWithRsa } from '../lib/security/crypto101RsaService.js';

function asText(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? '');
}

async function migrate() {
  await ensureServerKeys();
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [courses] = await conn.query(
      `SELECT course_id, title, name, exam_schedule,
              title_encrypted, name_encrypted, exam_schedule_encrypted
       FROM course FOR UPDATE`
    );
    for (const course of courses) {
      const title = course.title_encrypted || await encryptWithRsa(asText(course.title));
      const name = course.name_encrypted || await encryptWithRsa(asText(course.name));
      const examSchedule = course.exam_schedule_encrypted
        || await encryptWithRsa(asText(course.exam_schedule));
      await conn.query(
        `UPDATE course
         SET title_encrypted = ?, name_encrypted = ?, exam_schedule_encrypted = ?
         WHERE course_id = ?`,
        [title, name, examSchedule, course.course_id]
      );
    }

    const [sections] = await conn.query(
      `SELECT course_id, section_id, schedule, faculty,
              schedule_encrypted, faculty_encrypted
       FROM section FOR UPDATE`
    );
    for (const section of sections) {
      const schedule = section.schedule_encrypted || await encryptWithRsa(asText(section.schedule));
      const faculty = section.faculty_encrypted || await encryptWithRsa(asText(section.faculty));
      await conn.query(
        `UPDATE section
         SET schedule_encrypted = ?, faculty_encrypted = ?
         WHERE course_id = ? AND section_id = ?`,
        [schedule, faculty, section.course_id, section.section_id]
      );
    }

    await conn.query(
      `ALTER TABLE course
       DROP COLUMN title,
       DROP COLUMN name,
       DROP COLUMN exam_schedule`
    );
    await conn.query(
      `ALTER TABLE section
       DROP COLUMN schedule,
       DROP COLUMN faculty`
    );

    await conn.commit();
    console.log(`RSA course migration completed: ${courses.length} course(s), ${sections.length} section(s).`);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Course RSA migration failed:', error);
    process.exit(1);
  });
