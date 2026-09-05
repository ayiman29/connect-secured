import 'dotenv/config';
import * as reportModel from '../models/reportModel.js';
import { encryptProblemReport, decryptProblemReport } from '../lib/security/crypto101RsaService.js';
import db from '../db.js';

async function test() {
  console.log('--- Testing Report End-to-End Flow ---');
  
  // Pick an existing student ID
  const [students] = await db.query('SELECT student_id FROM student LIMIT 1');
  if (!students.length) {
    throw new Error('No students found in DB to test');
  }
  const studentId = students[0].student_id;
  console.log('Using student ID:', studentId);

  const problemMessage = 'Exam schedule conflict on Sunday 8:00 AM. Please advise!';
  console.log('Plaintext message:', problemMessage);

  // 1. Encrypt with crypto101
  const ciphertext = await encryptProblemReport(problemMessage);
  console.log('Encrypted ciphertext snippet:', ciphertext.slice(0, 60));

  // 2. Save in database
  const created = await reportModel.createReport(studentId, ciphertext);
  console.log('Created report ID:', created.report_id);

  // 3. Fetch from database
  const allReports = await reportModel.getAllReports();
  const fetched = allReports.find(r => r.report_id === created.report_id);
  if (!fetched) throw new Error('Report not found in getAllReports()');
  console.log('Fetched report from DB. Student name:', fetched.student_name);

  // 4. Decrypt with crypto101
  const decrypted = await decryptProblemReport(fetched.encrypted_problem);
  console.log('Decrypted message:', decrypted);
  if (decrypted !== problemMessage) {
    throw new Error(`Decrypted message mismatch! Expected "${problemMessage}", got "${decrypted}"`);
  }
  console.log('✅ Decryption match verified!');

  // 5. Delete (Mark as done)
  const deleted = await reportModel.deleteReport(created.report_id);
  console.log('Deleted report:', deleted);
  const checkAgain = await reportModel.getReportById(created.report_id);
  if (checkAgain) throw new Error('Report was not deleted from DB');
  console.log('✅ Report deletion verified!');

  console.log('🎉 ALL END-TO-END TESTS PASSED!');
  process.exit(0);
}

test().catch(e => {
  console.error('❌ Test failed:', e);
  process.exit(1);
});

