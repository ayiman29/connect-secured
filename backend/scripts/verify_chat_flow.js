import 'dotenv/config';
import db from '../db.js';
import * as chatModel from '../models/chatModel.js';
import {
  createSessionKeys,
  decryptSessionKey,
  encryptMessage,
  decryptMessage,
} from '../lib/security/chatCryptoService.js';

async function testChat() {
  console.log('--- Testing ECC + AES Chat Flow ---');

  // Find a student and an advisor
  const [students] = await db.query('SELECT student_id, user_id FROM student LIMIT 1');
  const [advisors] = await db.query('SELECT advisor_id, user_id FROM advisor LIMIT 1');

  if (!students.length || !advisors.length) {
    throw new Error('Need at least 1 student and 1 advisor in DB to test');
  }

  const student = students[0];
  const advisor = advisors[0];

  console.log(`Student ID: ${student.student_id}, Advisor ID: ${advisor.advisor_id}`);

  // 1. Get or create ECC keys for both users
  console.log('Fetching/generating ECC keys from crypto101...');
  const sKeys = await chatModel.getOrCreateUserEccKeys(student.user_id);
  const aKeys = await chatModel.getOrCreateUserEccKeys(advisor.user_id);
  console.log('Student ECC public key x:', sKeys.publicKey.x.slice(0, 20) + '...');
  console.log('Advisor ECC public key x:', aKeys.publicKey.x.slice(0, 20) + '...');

  // 2. Check or create chat session
  let session = await chatModel.getSession(student.student_id, advisor.advisor_id);
  if (!session) {
    console.log('Creating new chat session with dual ECC-encrypted session keys...');
    const sessionKeys = await createSessionKeys(sKeys.publicKey, aKeys.publicKey);
    session = await chatModel.createSession(
      student.student_id,
      advisor.advisor_id,
      sessionKeys.studentEncryptedKey,
      sessionKeys.advisorEncryptedKey
    );
  }
  console.log('Session ID:', session.session_id);

  // 3. Both sides decrypt the session key using their respective ECC private keys
  const sEncKey = typeof session.student_encrypted_key === 'string'
    ? JSON.parse(session.student_encrypted_key)
    : session.student_encrypted_key;
  const aEncKey = typeof session.advisor_encrypted_key === 'string'
    ? JSON.parse(session.advisor_encrypted_key)
    : session.advisor_encrypted_key;

  const sAesKey = await decryptSessionKey(sKeys.privateKey, sEncKey);
  const aAesKey = await decryptSessionKey(aKeys.privateKey, aEncKey);

  if (sAesKey !== aAesKey) {
    throw new Error('AES key mismatch between student and advisor!');
  }
  console.log('✅ Student and Advisor independently recovered identical AES key:', sAesKey.slice(0, 16) + '...');

  // 4. Student sends an AES-encrypted message
  const msgFromStudent = 'Hello Advisor! Can you help me pick an elective?';
  const encFromStudent = encryptMessage(msgFromStudent, sAesKey);
  const savedMsg1 = await chatModel.saveMessage(
    session.session_id,
    'student',
    student.student_id,
    encFromStudent.ciphertext,
    encFromStudent.iv,
    encFromStudent.authTag
  );
  console.log('Saved student message ID:', savedMsg1.message_id);

  // 5. Advisor sends an AES-encrypted reply
  const msgFromAdvisor = 'Sure! CSE420 or CSE421 are great options this semester.';
  const encFromAdvisor = encryptMessage(msgFromAdvisor, aAesKey);
  const savedMsg2 = await chatModel.saveMessage(
    session.session_id,
    'advisor',
    advisor.advisor_id,
    encFromAdvisor.ciphertext,
    encFromAdvisor.iv,
    encFromAdvisor.authTag
  );
  console.log('Saved advisor message ID:', savedMsg2.message_id);

  // 6. Advisor reads student message
  const decMsg1 = decryptMessage(
    encFromStudent.ciphertext,
    encFromStudent.iv,
    encFromStudent.authTag,
    aAesKey
  );
  console.log('Advisor read student message:', decMsg1);
  if (decMsg1 !== msgFromStudent) throw new Error('Student message decryption failed');

  // 7. Student reads advisor message
  const decMsg2 = decryptMessage(
    encFromAdvisor.ciphertext,
    encFromAdvisor.iv,
    encFromAdvisor.authTag,
    sAesKey
  );
  console.log('Student read advisor message:', decMsg2);
  if (decMsg2 !== msgFromAdvisor) throw new Error('Advisor message decryption failed');

  console.log('🎉 ALL ECC+AES CHAT TESTS PASSED!');
  process.exit(0);
}

testChat().catch(err => {
  console.error('❌ Chat test failed:', err);
  process.exit(1);
});
