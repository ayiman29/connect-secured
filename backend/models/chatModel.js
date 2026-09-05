import pool from '../db.js';
import { generateEccKeypair } from '../lib/security/chatCryptoService.js';
import { decryptValue } from '../lib/security/cryptoService.js';

/**
 * Retrieve or automatically generate a user's ECC key pair using crypto101
 */
export async function getOrCreateUserEccKeys(userId) {
  const [rows] = await pool.query(
    `SELECT user_id, public_key_x, public_key_y, private_key
     FROM user_ecc_key
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );

  if (rows.length > 0) {
    return {
      privateKey: rows[0].private_key,
      publicKey: {
        x: rows[0].public_key_x,
        y: rows[0].public_key_y,
      },
    };
  }

  // Generate new ECC keypair from crypto101/ecc.py
  const keys = await generateEccKeypair();

  await pool.query(
    `INSERT INTO user_ecc_key (user_id, public_key_x, public_key_y, private_key)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       public_key_x = VALUES(public_key_x),
       public_key_y = VALUES(public_key_y),
       private_key = VALUES(private_key)`,
    [userId, keys.publicKey.x, keys.publicKey.y, keys.privateKey]
  );

  return keys;
}

/**
 * Get existing chat session by student and advisor IDs
 */
export async function getSession(studentId, advisorId) {
  const [rows] = await pool.query(
    `SELECT session_id, student_id, advisor_id, student_encrypted_key, advisor_encrypted_key, created_at
     FROM chat_session
     WHERE student_id = ? AND advisor_id = ?
     LIMIT 1`,
    [studentId, advisorId]
  );
  return rows[0] || null;
}

/**
 * Get chat session by session ID
 */
export async function getSessionById(sessionId) {
  const [rows] = await pool.query(
    `SELECT session_id, student_id, advisor_id, student_encrypted_key, advisor_encrypted_key, created_at
     FROM chat_session
     WHERE session_id = ?
     LIMIT 1`,
    [sessionId]
  );
  return rows[0] || null;
}

/**
 * Create a new chat session with dual ECC-encrypted session keys
 */
export async function createSession(studentId, advisorId, studentEncryptedKey, advisorEncryptedKey) {
  const [result] = await pool.query(
    `INSERT INTO chat_session (student_id, advisor_id, student_encrypted_key, advisor_encrypted_key, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [
      studentId,
      advisorId,
      JSON.stringify(studentEncryptedKey),
      JSON.stringify(advisorEncryptedKey),
    ]
  );

  return {
    session_id: result.insertId,
    student_id: studentId,
    advisor_id: advisorId,
    student_encrypted_key: JSON.stringify(studentEncryptedKey),
    advisor_encrypted_key: JSON.stringify(advisorEncryptedKey),
  };
}

/**
 * Insert an AES-encrypted chat message
 */
export async function saveMessage(sessionId, senderRole, senderId, ciphertext, iv, authTag) {
  const [result] = await pool.query(
    `INSERT INTO chat_message (session_id, sender_role, sender_id, ciphertext, iv, auth_tag, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [sessionId, senderRole, senderId, ciphertext, iv, authTag]
  );

  return {
    message_id: result.insertId,
    session_id: sessionId,
    sender_role: senderRole,
    sender_id: senderId,
    created_at: new Date(),
  };
}

/**
 * Retrieve all encrypted messages for a session ordered chronologically
 */
export async function getMessagesBySessionId(sessionId) {
  const [rows] = await pool.query(
    `SELECT message_id, session_id, sender_role, sender_id, ciphertext, iv, auth_tag, created_at
     FROM chat_message
     WHERE session_id = ?
     ORDER BY created_at ASC`,
    [sessionId]
  );
  return rows;
}

/**
 * Fetch list of students who have an active conversation with an advisor
 */
export async function getAdvisorChatContacts(advisorId) {
  const [rows] = await pool.query(
    `SELECT 
       cs.session_id,
       cs.student_id,
       u.name_encrypted,
       u.email_lookup,
       (SELECT created_at FROM chat_message WHERE session_id = cs.session_id ORDER BY created_at DESC LIMIT 1) AS last_message_at
     FROM chat_session cs
     JOIN student s ON cs.student_id = s.student_id
     JOIN user u ON s.user_id = u.user_id
     WHERE cs.advisor_id = ?
     ORDER BY last_message_at DESC, cs.session_id DESC`,
    [advisorId]
  );

  return rows.map((r) => {
    let studentName = `Student ${r.student_id}`;
    if (r.name_encrypted) {
      try {
        studentName = decryptValue(r.name_encrypted);
      } catch {}
    }
    return {
      session_id: r.session_id,
      student_id: r.student_id,
      student_name: studentName,
      last_message_at: r.last_message_at,
    };
  });
}

/**
 * Fetch every advisor available for a student's new conversation.
 */
export async function getChatAdvisors() {
  const [rows] = await pool.query(
    `SELECT a.advisor_id, u.name_encrypted
     FROM advisor a
     JOIN user u ON a.user_id = u.user_id
     ORDER BY a.advisor_id ASC`
  );

  return rows.map((row) => {
    let name = `Advisor ${row.advisor_id}`;
    try {
      name = decryptValue(row.name_encrypted);
    } catch {}

    return {
      advisor_id: row.advisor_id,
      name,
    };
  });
}
