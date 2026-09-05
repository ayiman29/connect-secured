import 'dotenv/config';
import mysql from 'mysql2';


const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'MyNewPassword123!',
  database: process.env.DB_NAME || 'university5',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


const db = pool.promise();

export async function pingDB() {
  try {
    const [rows] = await db.query('SELECT DATABASE() AS db, NOW() AS now');
    console.log('✅ Connected to DB:', rows[0].db, 'at', rows[0].now);
  } catch (err) {
    console.error('❌ DB connection failed:', err.message);
  }
}

export default db;
