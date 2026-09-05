import pool from '../db.js';
import bcrypt from 'bcrypt';
import {
  decryptValue,
  encryptValue,
  getEmailLookup,
  normalizeEmail,
} from '../lib/security/cryptoService.js';

export async function createUser(email, name, password) {
  const normalizedEmail = normalizeEmail(email);
  const hashedPassword = await bcrypt.hash(password, 10);

  const encryptedEmail = encryptValue(normalizedEmail);
  const encryptedName = encryptValue(name);
  const emailLookup = getEmailLookup(normalizedEmail);

  await pool.query(
    `INSERT INTO user (email_encrypted, email_lookup, name_encrypted, password)
     VALUES (?, ?, ?, ?)`,
    [encryptedEmail, emailLookup, encryptedName, hashedPassword]
  );

  const [rows] = await pool.query(
    `SELECT user_id FROM user WHERE email_lookup = ? LIMIT 1`,
    [emailLookup]
  );

  return {
    user_id: rows[0]?.user_id,
    email: normalizedEmail,
    name,
  };
}

export async function findUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const emailLookup = getEmailLookup(normalizedEmail);

  const [rows] = await pool.query(
    `SELECT user_id, email_encrypted, name_encrypted, password
     FROM user
     WHERE email_lookup = ?
     LIMIT 1`,
    [emailLookup]
  );

  if (rows.length === 0) return null;

  const user = rows[0];
  return {
    user_id: user.user_id,
    email: decryptValue(user.email_encrypted),
    name: decryptValue(user.name_encrypted),
    password: user.password,
  };
}

export async function getUserRole(userId) {
  let [rows] = await pool.query(
    `SELECT student_id, credit, status FROM student WHERE user_id = ?`,
    [userId]
  );
  if (rows.length > 0) return { role: 'student', ...rows[0] };

  [rows] = await pool.query(
    `SELECT advisor_id FROM advisor WHERE user_id = ?`,
    [userId]
  );
  if (rows.length > 0) return { role: 'advisor', ...rows[0] };

  [rows] = await pool.query(
    `SELECT registrar_id FROM registrar WHERE user_id = ?`,
    [userId]
  );
  if (rows.length > 0) return { role: 'registrar', ...rows[0] };

  return null;
}
