import '../env';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

// =============================================================================
// Forward-only migration runner. Applies migrations/*.sql in filename order,
// tracking applied files in schema_migrations. Creates the database if missing.
// Run with: npm run migrate
// =============================================================================

const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sonsoul',
};

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

async function main(): Promise<void> {
  // 1. Ensure the database exists (connect without selecting one).
  const bootstrap = await mysql.createConnection({
    host: DB.host,
    port: DB.port,
    user: DB.user,
    password: DB.password,
    multipleStatements: true,
  });
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await bootstrap.end();

  // 2. Connect to the database with multi-statement support for schema files.
  const conn = await mysql.createConnection({ ...DB, multipleStatements: true });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [appliedRows] = await conn.query<mysql.RowDataPacket[]>('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedRows.map((r) => r.filename as string));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`Applying ${file} ... `);
    await conn.query(sql);
    await conn.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
    ran += 1;
    console.log('done');
  }

  await conn.end();
  console.log(ran === 0 ? 'No new migrations. Up to date.' : `Applied ${ran} migration(s).`);
}

main().catch((err) => {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
