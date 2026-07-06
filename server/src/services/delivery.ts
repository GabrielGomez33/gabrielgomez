import crypto from 'crypto';
import fs from 'fs';
import { type Response } from 'express';
import archiver from 'archiver';
import { type RowDataPacket } from 'mysql2/promise';
import { query, execute } from '../db/pool';
import { resolveInStorage } from './media';

// =============================================================================
// Secure digital delivery. Grants are single-token, expiring, count-limited, and
// only ever created for a captured (paid) order. Files are zipped on the fly at
// download time from the masters under STORAGE_ROOT — no path is ever exposed,
// and nothing zipped is stored to leak.
// =============================================================================

const DOWNLOAD_TTL_DAYS = Number(process.env.DOWNLOAD_TTL_DAYS || 30);
const DOWNLOAD_MAX = Number(process.env.DOWNLOAD_MAX || 5);

export interface GrantRow extends RowDataPacket {
  id: number;
  order_item_id: number;
  token: string;
  file_path: string; // storage-relative masters dir for the product
  max_downloads: number;
  download_count: number;
  expires_at: string;
}

/** Create one download grant per digital line of a paid order. Returns tokens. */
export async function createDigitalGrants(orderId: number): Promise<string[]> {
  const items = await query<RowDataPacket[]>(
    'SELECT id, product_id FROM order_items WHERE order_id = ? AND is_digital = 1',
    [orderId],
  );
  const tokens: string[] = [];
  for (const it of items) {
    // Idempotent: skip if a grant already exists for this item.
    const existing = await query<RowDataPacket[]>('SELECT token FROM download_grants WHERE order_item_id = ?', [it.id]);
    if (existing[0]) {
      tokens.push(existing[0].token as string);
      continue;
    }
    const token = crypto.randomBytes(32).toString('hex');
    const dir = `products/${it.product_id}/masters`;
    await execute(
      `INSERT INTO download_grants (order_item_id, token, file_path, max_downloads, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [it.id, token, dir, DOWNLOAD_MAX, DOWNLOAD_TTL_DAYS],
    );
    tokens.push(token);
  }
  return tokens;
}

/** Revoke all download grants for an order (e.g. on refund) — links stop working. */
export async function revokeOrderGrants(orderId: number): Promise<void> {
  await execute(
    `UPDATE download_grants dg
       JOIN order_items oi ON oi.id = dg.order_item_id
        SET dg.expires_at = NOW(), dg.max_downloads = 0
      WHERE oi.order_id = ?`,
    [orderId],
  );
}

export async function getGrantByToken(token: string): Promise<GrantRow | null> {
  const rows = await query<GrantRow[]>('SELECT * FROM download_grants WHERE token = ?', [token]);
  return rows[0] ?? null;
}

/**
 * Atomically claim one download against a grant (prevents exceeding max via
 * races). Returns true if a slot was claimed.
 */
export async function claimDownload(grantId: number): Promise<boolean> {
  const result = await execute(
    'UPDATE download_grants SET download_count = download_count + 1 WHERE id = ? AND download_count < max_downloads',
    [grantId],
  );
  return result.affectedRows === 1;
}

/** Stream a zip of every master file in the grant's directory to the response. */
export function streamZip(res: Response, storageRelDir: string, downloadName: string): void {
  let absDir: string;
  try {
    absDir = resolveInStorage(storageRelDir);
  } catch {
    if (!res.headersSent) res.status(404).end();
    return;
  }
  if (!fs.existsSync(absDir)) {
    if (!res.headersSent) res.status(404).end();
    return;
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}.zip"`);
  res.setHeader('Cache-Control', 'no-store');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', () => {
    if (!res.headersSent) res.status(500).end();
  });
  archive.pipe(res);
  // Recurse so sample-pack folder structure (drums/…, loops/…) is preserved in
  // the zip, not flattened. `false` = no extra top-level wrapper directory.
  archive.directory(absDir, false);
  archive.finalize();
}
