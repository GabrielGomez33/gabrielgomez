import fs from 'fs';
import path from 'path';

// =============================================================================
// Filesystem layout for uploaded media, all under STORAGE_ROOT (the SSD mount,
// outside the web root). Masters + previews live here; nothing is web-served
// directly — previews stream through the gated endpoint, masters via download
// grants, cover images through a public cover route.
//
//   <STORAGE_ROOT>/products/<id>/incoming/   ← multer temp landing
//   <STORAGE_ROOT>/products/<id>/masters/    ← full audio (never web-served)
//   <STORAGE_ROOT>/products/<id>/previews/   ← 10s tagged previews
//   <STORAGE_ROOT>/products/<id>/cover.<ext> ← cover image
// =============================================================================

const STORAGE_ROOT = process.env.STORAGE_ROOT || '/var/www/GabrielGomez-storage';

export function storageRoot(): string {
  return path.resolve(STORAGE_ROOT);
}

export function productDir(productId: number): string {
  return path.join(storageRoot(), 'products', String(productId));
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Filesystem-safe version of a user-supplied filename. */
export function safeName(name: string): string {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

/** Storage-relative path (what we persist in the DB). */
export function relFromRoot(abs: string): string {
  return path.relative(storageRoot(), abs);
}
