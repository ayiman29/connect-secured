import 'dotenv/config';
import db from '../db.js';
import { ensureServerKeys } from '../lib/security/crypto101RsaService.js';
import { encryptWithManagedKey } from '../lib/security/keyManagementService.js';

async function migrate() {
  await ensureServerKeys();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT user_id, private_key, private_key_encrypted
       FROM user_ecc_key FOR UPDATE`
    );

    for (const row of rows) {
      if (!row.private_key_encrypted && row.private_key) {
        const encrypted = await encryptWithManagedKey(row.private_key);
        await conn.query(
          `UPDATE user_ecc_key SET private_key_encrypted = ? WHERE user_id = ?`,
          [encrypted, row.user_id]
        );
      }
    }

    await conn.query('ALTER TABLE user_ecc_key DROP COLUMN private_key');
    await conn.query('ALTER TABLE user_ecc_key MODIFY private_key_encrypted TEXT NOT NULL');
    await conn.commit();
    console.log(`ECC private-key migration completed for ${rows.length} user record(s).`);
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
    console.error('ECC private-key migration failed:', error);
    process.exit(1);
  });
