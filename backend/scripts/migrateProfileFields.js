import 'dotenv/config';
import db from '../db.js';
import { encryptWithRsa } from '../lib/security/crypto101RsaService.js';

async function migrate() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [users] = await conn.query(
      `SELECT user_id, address_encrypted, phone_encrypted
       FROM user FOR UPDATE`
    );

    for (const user of users) {
      const address = user.address_encrypted || await encryptWithRsa('');
      const phone = user.phone_encrypted || await encryptWithRsa('');
      await conn.query(
        `UPDATE user SET address_encrypted = ?, phone_encrypted = ? WHERE user_id = ?`,
        [address, phone, user.user_id]
      );
    }

    await conn.commit();
    console.log(`Profile field migration completed for ${users.length} user record(s).`);
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
    console.error('Profile field migration failed:', error);
    process.exit(1);
  });
