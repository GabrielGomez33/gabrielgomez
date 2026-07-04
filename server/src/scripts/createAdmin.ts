import '../env';
import bcrypt from 'bcryptjs';
import pool, { execute, query } from '../db/pool';
import { type RowDataPacket } from 'mysql2/promise';

// =============================================================================
// Seed / update the first admin account from env (ADMIN_USERNAME, ADMIN_EMAIL,
// ADMIN_PASSWORD). Idempotent: updates the password if the username exists.
// Run with: npm run create-admin
// =============================================================================

async function main(): Promise<void> {
  const username = process.env.ADMIN_USERNAME || 'gabriel';
  const email = process.env.ADMIN_EMAIL || '';
  const password = process.env.ADMIN_PASSWORD || '';

  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before running create-admin.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const existing = await query<RowDataPacket[]>('SELECT id FROM admin_users WHERE username = ?', [username]);

  if (existing.length > 0) {
    await execute('UPDATE admin_users SET email = ?, password_hash = ?, is_active = 1 WHERE username = ?', [
      email,
      hash,
      username,
    ]);
    console.log(`Updated admin "${username}".`);
  } else {
    await execute('INSERT INTO admin_users (username, email, password_hash) VALUES (?, ?, ?)', [
      username,
      email,
      hash,
    ]);
    console.log(`Created admin "${username}".`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('create-admin failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
