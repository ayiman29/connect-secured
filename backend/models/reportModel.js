import pool from '../db.js';
import { decryptWithRsa } from '../lib/security/crypto101RsaService.js';

export async function createReport(studentId, encryptedProblem) {
  const [result] = await pool.query(
    `INSERT INTO report (student_id, encrypted_problem, created_at)
     VALUES (?, ?, NOW())`,
    [studentId, encryptedProblem]
  );
  return {
    report_id: result.insertId,
    student_id: studentId,
  };
}

export async function getAllReports() {
  const [rows] = await pool.query(
    `SELECT 
       r.report_id,
       r.student_id,
       r.encrypted_problem,
       r.created_at,
       u.name_encrypted
     FROM report r
     LEFT JOIN student s ON r.student_id = s.student_id
     LEFT JOIN user u ON s.user_id = u.user_id
     ORDER BY r.created_at DESC`
  );

  return Promise.all(rows.map(async (row) => {
    let studentName = `Student ${row.student_id}`;
    if (row.name_encrypted) {
      try {
        studentName = await decryptWithRsa(row.name_encrypted);
      } catch {}
    }
    return {
      report_id: row.report_id,
      student_id: row.student_id,
      student_name: studentName,
      encrypted_problem: row.encrypted_problem,
      created_at: row.created_at,
    };
  }));
}

export async function getReportById(reportId) {
  const [rows] = await pool.query(
    `SELECT report_id, student_id, encrypted_problem, created_at
     FROM report
     WHERE report_id = ?
     LIMIT 1`,
    [reportId]
  );
  return rows[0] || null;
}

export async function deleteReport(reportId) {
  const [result] = await pool.query(
    `DELETE FROM report WHERE report_id = ?`,
    [reportId]
  );
  return result.affectedRows > 0;
}

