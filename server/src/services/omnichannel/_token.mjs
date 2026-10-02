import fs from 'fs';
import pool from '../../config/db.js';
import { generateToken } from '../../middleware/auth.js';

const admin = await pool.query(
  `SELECT id, email, role FROM users WHERE role = 'admin' ORDER BY created_date ASC LIMIT 1`
);
if (!admin.rows[0]) process.exit(1);
fs.writeFileSync(new URL('./_token.txt', import.meta.url), generateToken(admin.rows[0]));
await pool.end();
