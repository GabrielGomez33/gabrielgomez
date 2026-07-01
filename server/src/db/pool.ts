import mysql, { type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';

// Connection pool for the SonSoul catalog. Mirrors mirror-server's tuned pool.
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sonsoul',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
  queueLimit: 0,
  charset: 'utf8mb4',
  enableKeepAlive: true,
  keepAliveInitialDelay: 30_000,
});

export default pool;

// mysql2's param type is narrow; callers pass mixed values, so accept a loose
// array and let the driver coerce (values are always bound, never interpolated).
type Params = (string | number | boolean | null | Date | Buffer)[];

/** Run a SELECT and get typed rows. */
export async function query<T extends RowDataPacket[]>(sql: string, params?: unknown[]): Promise<T> {
  const [rows] = await pool.query<T>(sql, params as Params | undefined);
  return rows;
}

/** Run an INSERT/UPDATE/DELETE and get the result header (insertId, affectedRows). */
export async function execute(sql: string, params?: unknown[]): Promise<ResultSetHeader> {
  const [result] = await pool.execute<ResultSetHeader>(sql, params as Params | undefined);
  return result;
}
