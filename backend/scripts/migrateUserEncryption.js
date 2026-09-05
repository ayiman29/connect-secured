import 'dotenv/config';
import bcrypt from 'bcrypt';
import db from '../db.js';
import {
  encryptValue,
  getEmailLookup,
  normalizeEmail,
  validateSecurityConfiguration,
} from '../lib/security/cryptoService.js';

const USER_TABLE = 'user';
const ROLE_TABLES = ['student', 'advisor', 'registrar'];

function isBcryptHash(value) {
  return typeof value === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

async function columnExists(conn, tableName, columnName) {
  const [rows] = await conn.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function indexExists(conn, tableName, indexName) {
  const [rows] = await conn.query(
    `SELECT 1
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
     LIMIT 1`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function uniqueIndexOnColumnExists(conn, tableName, columnName) {
  const [rows] = await conn.query(
    `SELECT 1
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
       AND non_unique = 0
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function getForeignKeysByColumn(conn, tableName, columnName) {
  const [rows] = await conn.query(
    `SELECT constraint_name AS constraintName
     FROM information_schema.key_column_usage
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
       AND referenced_table_name IS NOT NULL`,
    [tableName, columnName]
  );
  return rows.map((row) => row.constraintName).filter(Boolean);
}

async function getPrimaryKeyColumn(conn, tableName) {
  const [rows] = await conn.query(
    `SELECT column_name AS columnName
     FROM information_schema.key_column_usage
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND constraint_name = 'PRIMARY'
     ORDER BY ordinal_position
     LIMIT 1`,
    [tableName]
  );
  return rows[0]?.columnName ?? null;
}

async function addColumnIfMissing(conn, tableName, ddl) {
  const [columnName] = ddl.trim().split(/\s+/);
  const exists = await columnExists(conn, tableName, columnName.replace(/`/g, ''));
  if (!exists) {
    await conn.query(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`);
  }
}

async function migrateSchema() {
  validateSecurityConfiguration();

  const conn = await db.getConnection();
  try {
    await addColumnIfMissing(conn, USER_TABLE, '`user_id` INT NOT NULL AUTO_INCREMENT UNIQUE FIRST');
    await addColumnIfMissing(conn, USER_TABLE, '`email_encrypted` TEXT NULL');
    await addColumnIfMissing(conn, USER_TABLE, '`email_lookup` VARCHAR(80) NULL');
    await addColumnIfMissing(conn, USER_TABLE, '`name_encrypted` TEXT NULL');
    await addColumnIfMissing(conn, USER_TABLE, '`pii_key_version` VARCHAR(16) NULL DEFAULT \'v1\'');

    for (const table of ROLE_TABLES) {
      await addColumnIfMissing(conn, table, '`user_id` INT NULL');
    }

    for (const table of ROLE_TABLES) {
      const hasEmailColumn = await columnExists(conn, table, 'email');
      if (hasEmailColumn) {
        await conn.query(
          `UPDATE ${table} t
           JOIN user u ON t.email = u.email
           SET t.user_id = u.user_id
           WHERE t.user_id IS NULL`
        );
      }
    }

    const hasPlainEmail = await columnExists(conn, USER_TABLE, 'email');
    const hasPlainName = await columnExists(conn, USER_TABLE, 'name');

    if (hasPlainEmail && hasPlainName) {
      const [users] = await conn.query(
        `SELECT user_id, email, name, password FROM user`
      );

      for (const row of users) {
        const normalizedEmail = normalizeEmail(row.email);
        if (!normalizedEmail) {
          throw new Error(`User ${row.user_id} has invalid email value`);
        }

        const encryptedEmail = encryptValue(normalizedEmail);
        const encryptedName = encryptValue(row.name);
        const emailLookup = getEmailLookup(normalizedEmail);
        const safePassword = isBcryptHash(row.password)
          ? row.password
          : await bcrypt.hash(row.password, 10);

        await conn.query(
          `UPDATE user
           SET email_encrypted = ?,
               email_lookup = ?,
               name_encrypted = ?,
               password = ?,
               pii_key_version = ?
           WHERE user_id = ?`,
          [encryptedEmail, emailLookup, encryptedName, safePassword, 'v1', row.user_id]
        );
      }
    }

    for (const table of ROLE_TABLES) {
      const [missing] = await conn.query(
        `SELECT COUNT(*) AS missing_count FROM ${table} WHERE user_id IS NULL`
      );
      if (missing[0].missing_count > 0) {
        throw new Error(`Table ${table} has rows that could not be mapped to user_id`);
      }
    }

    if (!(await uniqueIndexOnColumnExists(conn, USER_TABLE, 'email_lookup'))) {
      await conn.query(
        `ALTER TABLE user ADD UNIQUE KEY uq_user_email_lookup (email_lookup)`
      );
    }

    for (const table of ROLE_TABLES) {
      const fks = await getForeignKeysByColumn(conn, table, 'email');
      for (const fkName of fks) {
        await conn.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${fkName}`);
      }
    }

    await conn.query(
      `ALTER TABLE user
       MODIFY email_encrypted TEXT NOT NULL,
       MODIFY email_lookup VARCHAR(80) NOT NULL,
       MODIFY name_encrypted TEXT NOT NULL,
       MODIFY pii_key_version VARCHAR(16) NOT NULL DEFAULT 'v1'`
    );

    for (const table of ROLE_TABLES) {
      await conn.query(`ALTER TABLE ${table} MODIFY user_id INT NOT NULL`);
    }

    if (!(await uniqueIndexOnColumnExists(conn, 'student', 'user_id'))) {
      await conn.query('ALTER TABLE student ADD UNIQUE KEY uq_student_user_id (user_id)');
    }
    if (!(await uniqueIndexOnColumnExists(conn, 'advisor', 'user_id'))) {
      await conn.query('ALTER TABLE advisor ADD UNIQUE KEY uq_advisor_user_id (user_id)');
    }
    if (!(await uniqueIndexOnColumnExists(conn, 'registrar', 'user_id'))) {
      await conn.query('ALTER TABLE registrar ADD UNIQUE KEY uq_registrar_user_id (user_id)');
    }

    const studentUserFks = await getForeignKeysByColumn(conn, 'student', 'user_id');
    if (studentUserFks.length === 0) {
      await conn.query(
        'ALTER TABLE student ADD CONSTRAINT fk_student_user FOREIGN KEY (user_id) REFERENCES user(user_id)'
      );
    }

    const advisorUserFks = await getForeignKeysByColumn(conn, 'advisor', 'user_id');
    if (advisorUserFks.length === 0) {
      await conn.query(
        'ALTER TABLE advisor ADD CONSTRAINT fk_advisor_user FOREIGN KEY (user_id) REFERENCES user(user_id)'
      );
    }

    const registrarUserFks = await getForeignKeysByColumn(conn, 'registrar', 'user_id');
    if (registrarUserFks.length === 0) {
      await conn.query(
        'ALTER TABLE registrar ADD CONSTRAINT fk_registrar_user FOREIGN KEY (user_id) REFERENCES user(user_id)'
      );
    }

    for (const table of ROLE_TABLES) {
      if (await columnExists(conn, table, 'email')) {
        await conn.query(`ALTER TABLE ${table} DROP COLUMN email`);
      }
    }

    const currentPrimaryKey = await getPrimaryKeyColumn(conn, USER_TABLE);
    if (currentPrimaryKey !== 'user_id') {
      await conn.query('ALTER TABLE user DROP PRIMARY KEY, ADD PRIMARY KEY (user_id)');
    }

    if (await columnExists(conn, USER_TABLE, 'email')) {
      await conn.query('ALTER TABLE user DROP COLUMN email');
    }

    if (await columnExists(conn, USER_TABLE, 'name')) {
      await conn.query('ALTER TABLE user DROP COLUMN name');
    }

    console.log('User encryption migration completed successfully.');
  } finally {
    conn.release();
  }
}

migrateSchema()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('User encryption migration failed:', error.message);
    process.exit(1);
  });
