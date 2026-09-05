import pool from '../db.js';
import * as chatModel from '../models/chatModel.js';
import {
  createSessionKeys,
  decryptSessionKey,
  encryptMessage,
  decryptMessage,
  createChatMac,
  verifyChatMac,
} from '../lib/security/chatCryptoService.js';
import { decryptWithRsa } from '../lib/security/crypto101RsaService.js';

const DEFAULT_ADVISOR_ID = 10000501;

async function getStudentIdForUser(userId) {
  const [rows] = await pool.query('SELECT student_id FROM student WHERE user_id = ?', [userId]);
  return rows[0]?.student_id || null;
}

async function getAdvisorIdForUser(userId) {
  const [rows] = await pool.query('SELECT advisor_id FROM advisor WHERE user_id = ?', [userId]);
  return rows[0]?.advisor_id || null;
}

async function getUserIdForStudent(studentId) {
  const [rows] = await pool.query('SELECT user_id FROM student WHERE student_id = ?', [studentId]);
  return rows[0]?.user_id || null;
}

async function getUserIdForAdvisor(advisorId) {
  const [rows] = await pool.query('SELECT user_id FROM advisor WHERE advisor_id = ?', [advisorId]);
  return rows[0]?.user_id || null;
}

async function getAdvisorInfo(advisorId) {
  const [rows] = await pool.query(
    `SELECT a.advisor_id, u.name_encrypted
     FROM advisor a
     JOIN user u ON a.user_id = u.user_id
     WHERE a.advisor_id = ?`,
    [advisorId]
  );
  if (!rows.length) return { advisor_id: advisorId, name: 'Advisor' };
  let name = 'Advisor';
  try {
    name = await decryptWithRsa(rows[0].name_encrypted);
  } catch {}
  return { advisor_id: advisorId, name };
}

async function getStudentInfo(studentId) {
  const [rows] = await pool.query(
    `SELECT s.student_id, u.name_encrypted
     FROM student s
     JOIN user u ON s.user_id = u.user_id
     WHERE s.student_id = ?`,
    [studentId]
  );
  if (!rows.length) return { student_id: studentId, name: `Student ${studentId}` };
  let name = `Student ${studentId}`;
  try {
    name = await decryptWithRsa(rows[0].name_encrypted);
  } catch {}
  return { student_id: studentId, name };
}

/**
 * Get or initialize a chat session between student and advisor
 */
export async function getOrCreateSession(req, res) {
  try {
    const userRole = req.user.role;
    let studentId;
    let advisorId;

    if (userRole === 'student') {
      studentId = await getStudentIdForUser(req.user.userId);
      advisorId = req.query.advisorId ? Number(req.query.advisorId) : DEFAULT_ADVISOR_ID;
    } else if (userRole === 'advisor') {
      advisorId = await getAdvisorIdForUser(req.user.userId);
      studentId = req.query.studentId ? Number(req.query.studentId) : null;
      if (!studentId) {
        return res.status(400).json({ error: 'studentId is required for advisor to start chat' });
      }
    } else {
      return res.status(403).json({ error: 'Only students and advisors can chat' });
    }

    if (!studentId || !advisorId) {
      return res.status(400).json({ error: 'Missing studentId or advisorId' });
    }

    let session = await chatModel.getSession(studentId, advisorId);

    if (!session) {
      const studentUserId = await getUserIdForStudent(studentId);
      const advisorUserId = await getUserIdForAdvisor(advisorId);

      if (!studentUserId || !advisorUserId) {
        return res.status(404).json({ error: 'Student or Advisor user not found' });
      }

      // 1. Fetch or generate ECC key pairs from crypto101
      const studentKeys = await chatModel.getOrCreateUserEccKeys(studentUserId);
      const advisorKeys = await chatModel.getOrCreateUserEccKeys(advisorUserId);

      // 2. Encrypt AES session key with crypto101/ecc.py
      const sessionKeys = await createSessionKeys(studentKeys.publicKey, advisorKeys.publicKey);

      // 3. Save session in DB
      session = await chatModel.createSession(
        studentId,
        advisorId,
        sessionKeys.studentEncryptedKey,
        sessionKeys.advisorEncryptedKey
      );
    }

    const advisorMeta = await getAdvisorInfo(advisorId);
    const studentMeta = await getStudentInfo(studentId);

    return res.status(200).json({
      session_id: session.session_id,
      student_id: studentId,
      advisor_id: advisorId,
      partner_name: userRole === 'student' ? advisorMeta.name : studentMeta.name,
      partner_role: userRole === 'student' ? 'advisor' : 'student',
    });
  } catch (err) {
    console.error('Error in getOrCreateSession:', err);
    return res.status(500).json({ error: err.message || 'Failed to get or create chat session' });
  }
}

/**
 * Get and decrypt all messages for a session
 */
export async function getMessages(req, res) {
  try {
    const sessionId = parseInt(req.params.sessionId);
    if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });

    const session = await chatModel.getSessionById(sessionId);
    if (!session) return res.status(404).json({ error: 'Chat session not found' });

    // Validate access
    const userRole = req.user.role;
    let userEccKeys;
    let encryptedKeyData;

    if (userRole === 'student') {
      const studentId = await getStudentIdForUser(req.user.userId);
      if (session.student_id !== studentId) {
        return res.status(403).json({ error: 'Unauthorized to view this chat' });
      }
      userEccKeys = await chatModel.getOrCreateUserEccKeys(req.user.userId);
      encryptedKeyData = typeof session.student_encrypted_key === 'string'
        ? JSON.parse(session.student_encrypted_key)
        : session.student_encrypted_key;
    } else if (userRole === 'advisor') {
      const advisorId = await getAdvisorIdForUser(req.user.userId);
      if (session.advisor_id !== advisorId) {
        return res.status(403).json({ error: 'Unauthorized to view this chat' });
      }
      userEccKeys = await chatModel.getOrCreateUserEccKeys(req.user.userId);
      encryptedKeyData = typeof session.advisor_encrypted_key === 'string'
        ? JSON.parse(session.advisor_encrypted_key)
        : session.advisor_encrypted_key;
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Decrypt AES session key with user's ECC private key via crypto101
    const aesKeyHex = await decryptSessionKey(userEccKeys.privateKey, encryptedKeyData);

    // Fetch and decrypt messages using AES
    const rawMessages = await chatModel.getMessagesBySessionId(sessionId);
    const messages = [];

    for (const m of rawMessages) {
      try {
        if (m.mac && !verifyChatMac(m.mac, sessionId, m.sender_role, m.sender_id, m.ciphertext, m.iv, m.auth_tag, aesKeyHex)) {
          console.error('Rejected chat message with invalid MAC:', m.message_id);
          continue;
        }
        const text = decryptMessage(m.ciphertext, m.iv, m.auth_tag, aesKeyHex);
        messages.push({
          message_id: m.message_id,
          session_id: m.session_id,
          sender_role: m.sender_role,
          sender_id: m.sender_id,
          text,
          created_at: m.created_at,
        });
      } catch (decErr) {
        console.error('Failed to decrypt message ID:', m.message_id, decErr.message);
      }
    }

    return res.status(200).json(messages);
  } catch (err) {
    console.error('Error in getMessages:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch messages' });
  }
}

/**
 * Encrypt and send a chat message
 */
export async function sendMessage(req, res) {
  try {
    const { sessionId, text } = req.body;
    if (!sessionId || !text || !String(text).trim()) {
      return res.status(400).json({ error: 'sessionId and non-empty text are required' });
    }

    const session = await chatModel.getSessionById(sessionId);
    if (!session) return res.status(404).json({ error: 'Chat session not found' });

    const userRole = req.user.role;
    let senderId;
    let encryptedKeyData;

    if (userRole === 'student') {
      senderId = await getStudentIdForUser(req.user.userId);
      if (session.student_id !== senderId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      encryptedKeyData = typeof session.student_encrypted_key === 'string'
        ? JSON.parse(session.student_encrypted_key)
        : session.student_encrypted_key;
    } else if (userRole === 'advisor') {
      senderId = await getAdvisorIdForUser(req.user.userId);
      if (session.advisor_id !== senderId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      encryptedKeyData = typeof session.advisor_encrypted_key === 'string'
        ? JSON.parse(session.advisor_encrypted_key)
        : session.advisor_encrypted_key;
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const userEccKeys = await chatModel.getOrCreateUserEccKeys(req.user.userId);
    const aesKeyHex = await decryptSessionKey(userEccKeys.privateKey, encryptedKeyData);

    // Encrypt message text using AES-256-GCM
    const { ciphertext, iv, authTag } = encryptMessage(String(text).trim(), aesKeyHex);
    const mac = createChatMac(sessionId, userRole, senderId, ciphertext, iv, authTag, aesKeyHex);

    const saved = await chatModel.saveMessage(
      sessionId,
      userRole,
      senderId,
      ciphertext,
      iv,
      authTag,
      mac
    );

    return res.status(201).json({
      message_id: saved.message_id,
      session_id: sessionId,
      sender_role: userRole,
      sender_id: senderId,
      text: String(text).trim(),
      created_at: saved.created_at,
    });
  } catch (err) {
    console.error('Error in sendMessage:', err);
    return res.status(500).json({ error: err.message || 'Failed to send message' });
  }
}

/**
 * Get advisor's active student contacts for messaging
 */
export async function getAdvisorContacts(req, res) {
  try {
    if (req.user.role !== 'advisor') {
      return res.status(403).json({ error: 'Requires advisor role' });
    }
    const advisorId = await getAdvisorIdForUser(req.user.userId);
    if (!advisorId) return res.status(404).json({ error: 'Advisor not found' });

    const contacts = await chatModel.getAdvisorChatContacts(advisorId);
    return res.status(200).json(contacts);
  } catch (err) {
    console.error('Error in getAdvisorContacts:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch advisor contacts' });
  }
}

/**
 * List advisors a student can choose when starting a conversation.
 */
export async function getChatAdvisors(req, res) {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Requires student role' });
    }

    const studentId = await getStudentIdForUser(req.user.userId);
    if (!studentId) return res.status(404).json({ error: 'Student not found' });

    const advisors = await chatModel.getChatAdvisors();
    return res.status(200).json(advisors);
  } catch (err) {
    console.error('Error in getChatAdvisors:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch advisors' });
  }
}
