import pool from '../db.js';
import { decryptWithRsa, encryptWithRsa } from '../lib/security/crypto101RsaService.js';

export async function deleteExpiredComments() {
  await pool.query('DELETE FROM comment WHERE expires_at <= NOW()');
}

export async function getComments() {
  await deleteExpiredComments();
  const [rows] = await pool.query(
    `SELECT c.comment_id, c.user_id, c.content_encrypted, c.created_at, c.expires_at,
            u.name_encrypted
     FROM comment c
     JOIN user u ON c.user_id = u.user_id
     WHERE c.expires_at > NOW()
     ORDER BY c.created_at DESC`
  );

  return Promise.all(rows.map(async (row) => ({
    comment_id: row.comment_id,
    user_id: row.user_id,
    author_name: await decryptWithRsa(row.name_encrypted),
    content: await decryptWithRsa(row.content_encrypted),
    created_at: row.created_at,
    expires_at: row.expires_at,
  })));
}

export async function createComment(userId, content) {
  const encryptedContent = await encryptWithRsa(content);
  const [result] = await pool.query(
    `INSERT INTO comment (user_id, content_encrypted, created_at, expires_at)
     VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
    [userId, encryptedContent]
  );
  return result.insertId;
}

export async function updateComment(commentId, userId, content) {
  const encryptedContent = await encryptWithRsa(content);
  const [result] = await pool.query(
    `UPDATE comment
     SET content_encrypted = ?
     WHERE comment_id = ? AND user_id = ? AND expires_at > NOW()`,
    [encryptedContent, commentId, userId]
  );
  return result.affectedRows > 0;
}

export async function deleteComment(commentId, userId, isRegistrar) {
  const query = isRegistrar
    ? 'DELETE FROM comment WHERE comment_id = ?'
    : 'DELETE FROM comment WHERE comment_id = ? AND user_id = ?';
  const params = isRegistrar ? [commentId] : [commentId, userId];
  const [result] = await pool.query(query, params);
  return result.affectedRows > 0;
}
