import pool from '../db.js';
import bcrypt from 'bcrypt';
import { getEmailLookup, normalizeEmail } from '../lib/security/cryptoService.js';
import { encryptWithRsa, decryptWithRsa } from '../lib/security/crypto101RsaService.js';

export async function createUser(email, name, password, address = '', phone = '') {
  const normalizedEmail = normalizeEmail(email);
  const hashedPassword = await bcrypt.hash(password, 10);

  // Encrypt PII with RSA (crypto101) instead of AES.
  const encryptedEmail = await encryptWithRsa(normalizedEmail);
  const encryptedName  = await encryptWithRsa(name);
  const encryptedAddress = await encryptWithRsa(address);
  const encryptedPhone = await encryptWithRsa(phone);
  const emailLookup    = getEmailLookup(normalizedEmail);

  await pool.query(
    `INSERT INTO user
      (email_encrypted, email_lookup, name_encrypted, address_encrypted, phone_encrypted, password)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [encryptedEmail, emailLookup, encryptedName, encryptedAddress, encryptedPhone, hashedPassword]
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
    `SELECT user_id, email_encrypted, name_encrypted, address_encrypted, phone_encrypted, password, totp_secret, totp_enabled
     FROM user
     WHERE email_lookup = ?
     LIMIT 1`,
    [emailLookup]
  );

  if (rows.length === 0) return null;

  const user = rows[0];
  return {
    user_id: user.user_id,
    email: await decryptWithRsa(user.email_encrypted),
    name:  await decryptWithRsa(user.name_encrypted),
    address: await decryptWithRsa(user.address_encrypted),
    phone: await decryptWithRsa(user.phone_encrypted),
    password: user.password,
    totp_secret: user.totp_secret,
    totp_enabled: !!user.totp_enabled,
  };
}

export async function getUserById(userId) {
  const [rows] = await pool.query(
    `SELECT user_id, email_encrypted, name_encrypted, address_encrypted, phone_encrypted, totp_secret, totp_enabled
     FROM user
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );

  if (rows.length === 0) return null;

  const user = rows[0];
  return {
    user_id: user.user_id,
    email: await decryptWithRsa(user.email_encrypted),
    name:  await decryptWithRsa(user.name_encrypted),
    address: await decryptWithRsa(user.address_encrypted),
    phone: await decryptWithRsa(user.phone_encrypted),
    totp_secret: user.totp_secret,
    totp_enabled: !!user.totp_enabled,
  };
}

export async function updateUserProfile(userId, { name, email, address, phone }) {
  const normalizedEmail = normalizeEmail(email);
  const encryptedName = await encryptWithRsa(name);
  const encryptedEmail = await encryptWithRsa(normalizedEmail);
  const encryptedAddress = await encryptWithRsa(address || '');
  const encryptedPhone = await encryptWithRsa(phone || '');
  const emailLookup = getEmailLookup(normalizedEmail);

  await pool.query(
    `UPDATE user
     SET email_encrypted = ?, email_lookup = ?, name_encrypted = ?,
         address_encrypted = ?, phone_encrypted = ?
     WHERE user_id = ?`,
    [encryptedEmail, emailLookup, encryptedName, encryptedAddress, encryptedPhone, userId]
  );
}

export async function saveTotpSecret(userId, plaintextSecret) {
  // Encrypt the TOTP secret with the server's RSA public key (crypto101).
  const encryptedSecret = await encryptWithRsa(plaintextSecret);
  await pool.query(
    `UPDATE user SET totp_secret = ?, totp_enabled = 0 WHERE user_id = ?`,
    [encryptedSecret, userId]
  );
}

export async function enableTotp(userId) {
  await pool.query(
    `UPDATE user SET totp_enabled = 1 WHERE user_id = ?`,
    [userId]
  );
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
