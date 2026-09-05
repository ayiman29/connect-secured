import 'dotenv/config';
import db from '../db.js';
import { decryptValue } from '../lib/security/cryptoService.js';
import { decryptWithRsa, encryptWithRsa, ensureServerKeys } from '../lib/security/crypto101RsaService.js';

function looksLikeRsaCiphertext(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  return value.split(':').every((part) => /^\d+$/.test(part));
}

async function convertValue(value, label) {
  if (!value) return value;
  if (looksLikeRsaCiphertext(value)) {
    await decryptWithRsa(value);
    return value;
  }

  const plaintext = decryptValue(value);
  const encrypted = await encryptWithRsa(plaintext);
  console.log(`Re-encrypted ${label}`);
  return encrypted;
}

async function migrate() {
  await ensureServerKeys();
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [users] = await conn.query(
      `SELECT user_id, email_encrypted, name_encrypted, totp_secret
       FROM user
       FOR UPDATE`
    );

    for (const user of users) {
      const emailEncrypted = await convertValue(user.email_encrypted, `user ${user.user_id} email`);
      const nameEncrypted = await convertValue(user.name_encrypted, `user ${user.user_id} name`);
      const totpEncrypted = user.totp_secret
        ? await convertValue(user.totp_secret, `user ${user.user_id} TOTP secret`)
        : null;

      await conn.query(
        `UPDATE user
         SET email_encrypted = ?, name_encrypted = ?, totp_secret = ?
         WHERE user_id = ?`,
        [emailEncrypted, nameEncrypted, totpEncrypted, user.user_id]
      );
    }

    await conn.commit();
    console.log(`RSA migration completed for ${users.length} user record(s).`);
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
    console.error('RSA migration failed:', error);
    process.exit(1);
  });
