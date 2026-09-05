import { decryptWithRsa, encryptWithRsa } from './crypto101RsaService.js';

export async function encryptCourseFields({ title, name, examSchedule }) {
  return {
    titleEncrypted: await encryptWithRsa(title),
    nameEncrypted: await encryptWithRsa(name),
    examScheduleEncrypted: await encryptWithRsa(examSchedule),
  };
}

export async function encryptSectionFields({ schedule, faculty }) {
  return {
    scheduleEncrypted: await encryptWithRsa(schedule),
    facultyEncrypted: await encryptWithRsa(faculty),
  };
}

export async function decryptCourseFields(row) {
  return {
    title: await decryptWithRsa(row.title_encrypted),
    course_name: await decryptWithRsa(row.course_name_encrypted || row.name_encrypted),
    exam_schedule: await decryptWithRsa(row.exam_schedule_encrypted),
  };
}

export async function decryptSectionFields(row) {
  return {
    schedule: await decryptWithRsa(row.schedule_encrypted),
    faculty: await decryptWithRsa(row.faculty_encrypted),
  };
}
