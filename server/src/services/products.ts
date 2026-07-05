import { type RowDataPacket } from 'mysql2/promise';
import { query, execute } from '../db/pool';

// =============================================================================
// Product data access. Products + related music tracks, license tiers, clothing
// variants, and gallery images.
// =============================================================================

export type Category = 'music' | 'clothing' | 'accessory';
export type Status = 'draft' | 'published' | 'archived';

export interface ProductRow extends RowDataPacket {
  id: number;
  slug: string;
  sku: string | null;
  category: Category;
  type: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  price_cents: number;
  currency: string;
  status: Status;
  is_digital: number;
  cover_image_path: string | null;
  cover_thumb_path: string | null;
  weight_grams: number | null;
  paypal_product_id: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface CreateProductInput {
  category: Category;
  type: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  priceCents: number;
  currency?: string;
  weightGrams?: number | null;
}

// Empty strings from form selects must become NULL — ENUM columns reject ''.
function emptyToNull<T>(v: T): T | null {
  return v === undefined || v === null || v === '' ? null : v
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 150);
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'product';
  let candidate = root;
  let n = 1;
  // Loop until no collision. Bounded by a sane cap.
  while (n < 500) {
    const rows = await query<RowDataPacket[]>('SELECT id FROM products WHERE slug = ? LIMIT 1', [candidate]);
    if (rows.length === 0) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
  return `${root}-${Date.now()}`;
}

export async function createProduct(input: CreateProductInput): Promise<number> {
  const slug = await uniqueSlug(input.title);
  const isDigital = input.category === 'music' ? 1 : 0;
  const result = await execute(
    `INSERT INTO products (slug, category, type, title, subtitle, description, price_cents, currency, is_digital, weight_grams)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      slug,
      input.category,
      input.type,
      input.title,
      input.subtitle ?? null,
      input.description ?? null,
      Math.max(0, Math.round(input.priceCents)),
      (input.currency || 'USD').toUpperCase(),
      isDigital,
      input.weightGrams ?? null,
    ],
  );
  return result.insertId;
}

export async function getProductById(id: number): Promise<ProductRow | null> {
  const rows = await query<ProductRow[]>('SELECT * FROM products WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function getProductBySlug(slug: string): Promise<ProductRow | null> {
  const rows = await query<ProductRow[]>('SELECT * FROM products WHERE slug = ?', [slug]);
  return rows[0] ?? null;
}

export interface ListFilters {
  category?: Category;
  status?: Status;
  limit?: number;
  offset?: number;
}

export async function listProducts(filters: ListFilters = {}): Promise<ProductRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.category) {
    where.push('category = ?');
    params.push(filters.category);
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const sql = `SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  return query<ProductRow[]>(sql, params);
}

const UPDATABLE: Record<string, string> = {
  title: 'title',
  subtitle: 'subtitle',
  description: 'description',
  priceCents: 'price_cents',
  weightGrams: 'weight_grams',
  coverImagePath: 'cover_image_path',
  coverThumbPath: 'cover_thumb_path',
  sku: 'sku',
};

export async function updateProduct(id: number, patch: Record<string, unknown>): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (key in patch) {
      sets.push(`${column} = ?`);
      params.push(patch[key]);
    }
  }
  if (sets.length === 0) return;
  params.push(id);
  await execute(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`, params);
}

export async function setStatus(id: number, status: Status): Promise<void> {
  if (status === 'published') {
    await execute('UPDATE products SET status = ?, published_at = COALESCE(published_at, NOW()) WHERE id = ?', [
      status,
      id,
    ]);
  } else {
    await execute('UPDATE products SET status = ? WHERE id = ?', [status, id]);
  }
}

export async function setPayPalProductId(id: number, paypalProductId: string): Promise<void> {
  await execute('UPDATE products SET paypal_product_id = ? WHERE id = ?', [paypalProductId, id]);
}

export async function deleteProduct(id: number): Promise<void> {
  await execute('DELETE FROM products WHERE id = ?', [id]);
}

// --- Related rows -----------------------------------------------------------
export async function getTracks(productId: number): Promise<RowDataPacket[]> {
  return query<RowDataPacket[]>('SELECT * FROM music_tracks WHERE product_id = ? ORDER BY position, id', [productId]);
}
export async function getVariants(productId: number): Promise<RowDataPacket[]> {
  return query<RowDataPacket[]>('SELECT * FROM product_variants WHERE product_id = ? ORDER BY id', [productId]);
}
export async function getLicenseTiers(productId: number): Promise<RowDataPacket[]> {
  return query<RowDataPacket[]>('SELECT * FROM music_license_tiers WHERE product_id = ? ORDER BY id', [productId]);
}
export async function getImages(productId: number): Promise<RowDataPacket[]> {
  return query<RowDataPacket[]>('SELECT * FROM product_images WHERE product_id = ? ORDER BY position, id', [productId]);
}

export type MusicStyle = 'vocal' | 'instruments' | 'mixed';

export interface TrackInput {
  name: string;
  artist?: string | null;
  genre?: string | null;
  style?: MusicStyle | null;
  lengthSec?: number | null;
  bpm?: number | null;
  musicKey?: string | null;
  position?: number;
  // Auto-extracted on upload (ffprobe) — optional here.
  fileSizeBytes?: number | null;
  format?: string | null;
  bitrateKbps?: number | null;
  sampleRate?: number | null;
  channels?: number | null;
  originalFilename?: string | null;
  // Folder-analysis classification (sample packs + enriched beatpacks/albums).
  kind?: 'one_shot' | 'loop' | 'instrumental' | 'unknown' | null;
  sampleGroup?: string | null;
  sampleCategory?: string | null;
  isPreview?: boolean;
  relDir?: string | null;
  bpmSource?: string | null;
  keySource?: string | null;
}
export async function addTrack(productId: number, t: TrackInput): Promise<number> {
  const result = await execute(
    `INSERT INTO music_tracks
       (product_id, position, name, artist, genre, style, length_sec, bpm, music_key,
        file_size_bytes, format, bitrate_kbps, sample_rate, channels, original_filename,
        kind, sample_group, sample_category, is_preview, rel_dir, bpm_source, key_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      productId,
      t.position ?? 0,
      t.name,
      emptyToNull(t.artist),
      emptyToNull(t.genre),
      emptyToNull(t.style),
      t.lengthSec ?? null,
      t.bpm ?? null,
      t.musicKey ?? null,
      t.fileSizeBytes ?? null,
      t.format ?? null,
      t.bitrateKbps ?? null,
      t.sampleRate ?? null,
      t.channels ?? null,
      t.originalFilename ?? null,
      emptyToNull(t.kind),
      emptyToNull(t.sampleGroup),
      emptyToNull(t.sampleCategory),
      t.isPreview ? 1 : 0,
      emptyToNull(t.relDir),
      emptyToNull(t.bpmSource),
      emptyToNull(t.keySource),
    ],
  );
  await recomputeMusicAggregates(productId);
  return result.insertId;
}

// --- Sample-pack helpers ----------------------------------------------------
/**
 * Mark/unmark a track as part of the public preview set. Turning a sample OFF
 * also clears its preview media, so a de-selected sample is never auditionable
 * (the invariant: for sample packs, preview_path is set iff is_preview = 1).
 */
export async function setTrackPreview(trackId: number, on: boolean): Promise<void> {
  if (on) {
    await execute('UPDATE music_tracks SET is_preview = 1 WHERE id = ?', [trackId]);
  } else {
    await execute(
      'UPDATE music_tracks SET is_preview = 0, preview_path = NULL, waveform_json = NULL WHERE id = ?',
      [trackId],
    );
  }
}

/** Clear the whole preview set (returns the previous rows so files can be cleaned up). */
export async function clearPreviewSet(productId: number): Promise<TrackRow[]> {
  const previous = await query<TrackRow[]>(
    'SELECT * FROM music_tracks WHERE product_id = ? AND is_preview = 1',
    [productId],
  );
  await execute(
    'UPDATE music_tracks SET is_preview = 0, preview_path = NULL, waveform_json = NULL WHERE product_id = ? AND is_preview = 1',
    [productId],
  );
  return previous;
}

/**
 * Choose `count` tracks for the preview set, spread across sample groups so the
 * preview is representative rather than (say) ten kicks. Deterministic order,
 * shuffled within a group by a rotating offset so it isn't always the same ten.
 */
export async function pickPreviewTrackIds(productId: number, count: number, seed: number): Promise<number[]> {
  const rows = await query<TrackRow[]>(
    'SELECT id, sample_group FROM music_tracks WHERE product_id = ? ORDER BY id',
    [productId],
  );
  if (rows.length === 0) return [];
  // Bucket by group.
  const buckets = new Map<string, number[]>();
  for (const r of rows) {
    const g = r.sample_group || 'other';
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g)!.push(r.id);
  }
  // Rotate each bucket by the seed so repeated picks vary.
  for (const ids of buckets.values()) {
    const off = seed % ids.length;
    ids.push(...ids.splice(0, off));
  }
  // Round-robin across groups until we have `count`.
  const groups = [...buckets.values()];
  const chosen: number[] = [];
  let i = 0;
  while (chosen.length < Math.min(count, rows.length)) {
    const g = groups[i % groups.length];
    if (g.length) chosen.push(g.shift()!);
    i++;
    if (groups.every((x) => x.length === 0)) break;
  }
  return chosen;
}

export async function getPreviewCount(productId: number): Promise<number> {
  const rows = await query<RowDataPacket[]>(
    'SELECT COUNT(*) AS n FROM music_tracks WHERE product_id = ? AND is_preview = 1',
    [productId],
  );
  return Number(rows[0]?.n) || 0;
}

/** Update a track's analysis fields (BPM/key always; classification for samples). */
export async function updateTrackAnalysis(
  trackId: number,
  a: {
    bpm: number | null;
    musicKey: string | null;
    bpmSource: string | null;
    keySource: string | null;
    kind?: string | null;
    sampleGroup?: string | null;
    sampleCategory?: string | null;
    applyClassification?: boolean;
  },
): Promise<void> {
  const sets = ['bpm = ?', 'music_key = ?', 'bpm_source = ?', 'key_source = ?'];
  const params: unknown[] = [a.bpm ?? null, a.musicKey ?? null, emptyToNull(a.bpmSource), emptyToNull(a.keySource)];
  if (a.applyClassification) {
    sets.push('kind = ?', 'sample_group = ?', 'sample_category = ?');
    params.push(emptyToNull(a.kind), emptyToNull(a.sampleGroup), emptyToNull(a.sampleCategory));
  }
  params.push(trackId);
  await execute(`UPDATE music_tracks SET ${sets.join(', ')} WHERE id = ?`, params);
}

/** Delete a track row and recompute aggregates. Returns the row (for file cleanup). */
export async function deleteTrack(trackId: number): Promise<TrackRow | null> {
  const rows = await query<TrackRow[]>('SELECT * FROM music_tracks WHERE id = ?', [trackId]);
  const row = rows[0];
  if (!row) return null;
  await execute('DELETE FROM music_tracks WHERE id = ?', [trackId]);
  await recomputeMusicAggregates(row.product_id);
  return row;
}

// --- Product-level music metadata ------------------------------------------
export interface MusicMetaInput {
  genre?: string | null;
  style?: MusicStyle | null;
  notes?: string | null;
}
export async function setMusicMeta(productId: number, meta: MusicMetaInput): Promise<void> {
  await execute(
    `INSERT INTO music_meta (product_id, genre, style, notes) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       genre = COALESCE(VALUES(genre), genre),
       style = COALESCE(VALUES(style), style),
       notes = COALESCE(VALUES(notes), notes)`,
    [productId, emptyToNull(meta.genre), emptyToNull(meta.style), emptyToNull(meta.notes)],
  );
}

/** Recompute contents aggregates (count / total length / total size) from tracks. */
export async function recomputeMusicAggregates(productId: number): Promise<void> {
  await execute(
    `INSERT INTO music_meta (product_id, track_count, total_length_sec, total_size_bytes)
       SELECT ?, COUNT(*), COALESCE(SUM(length_sec),0), COALESCE(SUM(file_size_bytes),0)
       FROM music_tracks WHERE product_id = ?
     ON DUPLICATE KEY UPDATE
       track_count = VALUES(track_count),
       total_length_sec = VALUES(total_length_sec),
       total_size_bytes = VALUES(total_size_bytes)`,
    [productId, productId],
  );
}

export async function getMusicMeta(productId: number): Promise<RowDataPacket | null> {
  const rows = await query<RowDataPacket[]>('SELECT * FROM music_meta WHERE product_id = ?', [productId]);
  return rows[0] ?? null;
}

/** Batch genre/style/track_count for a set of products (one query, for listings). */
export async function getMusicMetaForProducts(
  ids: number[],
): Promise<Map<number, { genre: string | null; style: string | null; trackCount: number }>> {
  const map = new Map<number, { genre: string | null; style: string | null; trackCount: number }>();
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await query<RowDataPacket[]>(
    `SELECT product_id, genre, style, track_count FROM music_meta WHERE product_id IN (${placeholders})`,
    ids,
  );
  for (const r of rows) {
    map.set(r.product_id, { genre: r.genre ?? null, style: r.style ?? null, trackCount: Number(r.track_count) || 0 });
  }
  return map;
}

export interface TrackRow extends RowDataPacket {
  id: number;
  product_id: number;
  name: string;
  kind: string | null;
  sample_group: string | null;
  sample_category: string | null;
  is_preview: number;
  preview_path: string | null;
  master_path: string | null;
  length_sec: number | null;
}
export async function getTrackById(id: number): Promise<TrackRow | null> {
  const rows = await query<TrackRow[]>('SELECT * FROM music_tracks WHERE id = ?', [id]);
  return rows[0] ?? null;
}

/** Attach generated media (master/preview paths + waveform peaks) to a track. */
export async function setTrackMedia(
  trackId: number,
  m: { masterPath?: string | null; previewPath?: string | null; waveform?: number[] | null },
): Promise<void> {
  await execute('UPDATE music_tracks SET master_path = ?, preview_path = ?, waveform_json = ? WHERE id = ?', [
    m.masterPath ?? null,
    m.previewPath ?? null,
    m.waveform ? JSON.stringify(m.waveform) : null,
    trackId,
  ]);
}

export interface VariantInput {
  sku?: string | null;
  size?: string | null;
  color?: string | null;
  style?: string | null;
  priceDeltaCents?: number;
  stockQty?: number;
  weightGrams?: number | null;
}
export async function addVariant(productId: number, v: VariantInput): Promise<number> {
  const result = await execute(
    `INSERT INTO product_variants (product_id, sku, size, color, style, price_delta_cents, stock_qty, weight_grams)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      productId,
      v.sku ?? null,
      v.size ?? null,
      v.color ?? null,
      v.style ?? null,
      v.priceDeltaCents ?? 0,
      v.stockQty ?? 0,
      v.weightGrams ?? null,
    ],
  );
  return result.insertId;
}

export type LicenseTier = 'mp3' | 'wav' | 'stems' | 'exclusive';
export async function addLicenseTier(productId: number, tier: LicenseTier, priceCents: number): Promise<number> {
  const result = await execute(
    `INSERT INTO music_license_tiers (product_id, tier, price_cents) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE price_cents = VALUES(price_cents), is_active = 1`,
    [productId, tier, Math.max(0, Math.round(priceCents))],
  );
  return result.insertId;
}

/** Full product with all related rows, for detail views. */
export async function getFullProduct(row: ProductRow) {
  const [tracks, variants, tiers, images, musicMeta] = await Promise.all([
    getTracks(row.id),
    getVariants(row.id),
    getLicenseTiers(row.id),
    getImages(row.id),
    row.category === 'music' ? getMusicMeta(row.id) : Promise.resolve(null),
  ]);
  return { ...row, tracks, variants, licenseTiers: tiers, images, musicMeta };
}
