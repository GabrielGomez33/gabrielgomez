import express, { type Request, type Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { requireAdmin } from '../../auth/middleware';
import * as products from '../../services/products';
import { probe, makeTaggedPreview, extractPeaks, resolveInStorage } from '../../services/media';
import { processCover, SUPPORTED_COVER_EXT } from '../../services/images';
import { analyzeAudio, prettifyName, keyForFilename, type Analysis } from '../../services/audioAnalysis';
import { productDir, ensureDir, safeName, relFromRoot } from '../../services/storage';

// =============================================================================
// Admin upload pipeline. Audio (file-by-file or a whole folder) → masters on the
// SSD, ffprobe technical info, 10s tagged preview + waveform peaks. Cover images
// too. All JWT-gated.
// =============================================================================

const router = express.Router();
router.use(requireAdmin);

// Reject non-numeric ids before multer touches the filesystem.
router.param('id', (_req, res, next, value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    res.status(400).json({ success: false, error: 'Invalid product id.' });
    return;
  }
  next();
});

const AUDIO_EXT = new Set(['.wav', '.mp3', '.aiff', '.aif', '.flac', '.m4a', '.ogg']);
const MAX_FILES = Number(process.env.MAX_UPLOAD_FILES || 300); // sample packs can be large
const DSP_ENABLED = process.env.AUDIO_DSP !== 'off'; // aubio/keyfinder if present
const PREVIEW_SET_SIZE = Number(process.env.PREVIEW_SET_SIZE || 10);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(productDir(Number(req.params.id)), 'incoming');
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName(file.originalname)}`),
  }),
  limits: { fileSize: 400 * 1024 * 1024 }, // 400 MB/file (WAV stems can be big)
});

function cleanup(files: Express.Multer.File[]): void {
  for (const f of files) {
    try {
      if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
    } catch {
      /* best effort */
    }
  }
}

// A human, self-describing filename for a sample master: prettified stem plus
// BPM and key, so the downloaded files are informative (e.g. "Dusk Loop 140BPM
// Amin.wav"). Only truly unsafe characters are stripped; spaces/#/() are kept.
function sampleMasterFilename(original: string, analysis: Analysis): string {
  const ext = path.extname(original).toLowerCase();
  const pretty = prettifyName(original);
  const compact = pretty.toLowerCase().replace(/\s+/g, '');
  const parts = [pretty];
  // Only append BPM/key if the name doesn't already carry them.
  if (analysis.bpm && !compact.includes(String(analysis.bpm))) parts.push(`${analysis.bpm}BPM`);
  const kf = keyForFilename(analysis.key);
  if (kf && !compact.includes(kf.toLowerCase())) parts.push(kf);
  const base = parts
    .join(' ')
    .replace(/[^\w\s#()\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${base || 'sample'}${ext}`;
}

// Ensure a filename doesn't collide in its folder: "name.wav" → "name (2).wav".
function uniqueInDir(dir: string, filename: string): string {
  const ext = path.extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  let candidate = filename;
  let n = 2;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${stem} (${n})${ext}`;
    n += 1;
  }
  return candidate;
}

// Sanitize a browser-supplied relative folder path (from a folder upload) into a
// safe, nested storage subpath — never allowing traversal outside masters/.
function safeRelDir(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return '';
  const dir = raw.includes('/') ? raw.slice(0, raw.lastIndexOf('/')) : '';
  return dir
    .split('/')
    .map((seg) => safeName(seg))
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .slice(0, 6) // cap nesting depth
    .join('/');
}

// Build a 10s tagged preview + waveform peaks for one track from its master.
// One-shots skip the producer tag (a tag would swamp a half-second sample).
async function buildTrackPreview(
  productId: number,
  trackId: number,
  masterAbs: string,
  kind: string | null,
): Promise<boolean> {
  const previewsDir = path.join(productDir(productId), 'previews');
  ensureDir(previewsDir);
  const previewAbs = path.join(previewsDir, `${trackId}.mp3`);
  try {
    await makeTaggedPreview(masterAbs, previewAbs, kind === 'one_shot' ? { tagFile: '' } : {});
    const peaks = await extractPeaks(previewAbs, 400);
    await products.setTrackMedia(trackId, {
      masterPath: relFromRoot(masterAbs),
      previewPath: fs.existsSync(previewAbs) ? relFromRoot(previewAbs) : null,
      waveform: peaks.length ? peaks : null,
    });
    return true;
  } catch (err) {
    console.error('[uploads] preview build failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

// --- Audio: one or many files (folder upload = multiple) ---------------------
router.post('/:id/audio', upload.array('files', MAX_FILES), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const product = await products.getProductById(id);
  if (!product) {
    cleanup(files);
    res.status(404).json({ success: false, error: 'Product not found.' });
    return;
  }
  if (product.category !== 'music') {
    cleanup(files);
    res.status(400).json({ success: false, error: 'Audio can only be added to music products.' });
    return;
  }
  if (files.length === 0) {
    res.status(400).json({ success: false, error: 'No files uploaded (field name must be "files").' });
    return;
  }

  const isSamplePack = product.type === 'samplepack';
  const mastersDir = path.join(productDir(id), 'masters');
  ensureDir(mastersDir);

  // Relative folder paths, aligned by index with the uploaded files (from a
  // folder upload). Sent as a JSON array on the `relPaths` field.
  let relPaths: string[] = [];
  try {
    if (typeof req.body.relPaths === 'string') relPaths = JSON.parse(req.body.relPaths);
  } catch {
    relPaths = [];
  }

  const existing = await products.getTracks(id);
  let position = existing.length;
  const added: Array<Record<string, unknown>> = [];

  for (let idx = 0; idx < files.length; idx++) {
    const f = files[idx];
    const ext = path.extname(f.originalname).toLowerCase();
    if (!AUDIO_EXT.has(ext)) {
      try {
        fs.unlinkSync(f.path);
      } catch {
        /* ignore */
      }
      continue; // skip non-audio silently
    }
    position += 1;
    const relDir = safeRelDir(relPaths[idx]);
    const destDir = relDir ? path.join(mastersDir, relDir) : mastersDir;
    ensureDir(destDir);
    // Land under a temporary safe name; we may rename it to a self-describing
    // name once analysis is done (needs the file on disk to probe/analyze).
    let masterAbs = path.join(destDir, `${position}_${safeName(f.originalname)}`);
    fs.renameSync(f.path, masterAbs);

    // Technical info (ffprobe).
    let meta = {
      durationSec: null as number | null,
      format: null as string | null,
      bitrateKbps: null as number | null,
      sampleRate: null as number | null,
      channels: null as number | null,
      sizeBytes: null as number | null,
    };
    try {
      meta = await probe(masterAbs);
    } catch (err) {
      console.error('[uploads] ffprobe failed:', err instanceof Error ? err.message : err);
    }

    // Classify (filename + duration heuristics, refined by DSP when available).
    const analysis = await analyzeAudio({
      filename: f.originalname,
      durationSec: meta.durationSec,
      absFile: masterAbs,
      useDsp: DSP_ENABLED,
    });

    // Sample-pack masters get a human, self-describing filename (BPM + key) so
    // the downloaded files are tidy. Other types keep their internal name.
    if (isSamplePack) {
      const finalName = uniqueInDir(destDir, sampleMasterFilename(f.originalname, analysis));
      const finalAbs = path.join(destDir, finalName);
      try {
        fs.renameSync(masterAbs, finalAbs);
        masterAbs = finalAbs;
      } catch (err) {
        console.error('[uploads] master rename failed:', err instanceof Error ? err.message : err);
      }
    }

    const trackId = await products.addTrack(id, {
      name: prettifyName(f.originalname),
      position,
      genre: (req.body.genre as string) ?? null,
      style: (req.body.style as products.MusicStyle) ?? null,
      lengthSec: meta.durationSec,
      bpm: analysis.bpm,
      musicKey: analysis.key,
      kind: analysis.kind,
      sampleGroup: analysis.group,
      sampleCategory: analysis.category,
      relDir: relDir || null,
      bpmSource: analysis.bpmSource,
      keySource: analysis.keySource,
      fileSizeBytes: meta.sizeBytes,
      format: meta.format,
      bitrateKbps: meta.bitrateKbps,
      sampleRate: meta.sampleRate,
      channels: meta.channels,
      originalFilename: f.originalname,
    });

    // Sample packs defer previews to the curated preview set (only ~10 of ~100
    // get one). Singles/albums/beatpacks preview every track, as before.
    if (!isSamplePack) {
      await buildTrackPreview(id, trackId, masterAbs, analysis.kind);
    } else {
      await products.setTrackMedia(trackId, { masterPath: relFromRoot(masterAbs), previewPath: null, waveform: null });
    }

    added.push({
      trackId,
      name: prettifyName(f.originalname),
      position,
      kind: analysis.kind,
      group: analysis.group,
      category: analysis.category,
      bpm: analysis.bpm,
      key: analysis.key,
      ...meta,
    });
  }

  await products.recomputeMusicAggregates(id);

  // For a sample pack, auto-seed the preview set on the first upload so there's
  // always something to audition — the admin can re-roll or fine-tune after.
  if (isSamplePack && (await products.getPreviewCount(id)) === 0) {
    await autoPickPreviewSet(id, PREVIEW_SET_SIZE);
  }

  res.status(201).json({
    success: true,
    added,
    isSamplePack,
    previewCount: await products.getPreviewCount(id),
    musicMeta: await products.getMusicMeta(id),
  });
});

// Regenerate the preview set: clear the old one, pick a fresh diversified set,
// and build previews for the chosen samples. Returns the chosen track ids.
async function autoPickPreviewSet(productId: number, count: number): Promise<number[]> {
  const previous = await products.clearPreviewSet(productId);
  for (const p of previous) {
    if (p.preview_path) {
      try {
        fs.unlinkSync(resolveInStorage(p.preview_path));
      } catch {
        /* best effort */
      }
    }
  }
  const seed = previous.length + 1; // rotate selection each time it's re-picked
  const ids = await products.pickPreviewTrackIds(productId, count, seed);
  for (const trackId of ids) {
    const track = await products.getTrackById(trackId);
    if (!track?.master_path) continue;
    let masterAbs: string;
    try {
      masterAbs = resolveInStorage(track.master_path);
    } catch {
      continue;
    }
    const ok = await buildTrackPreview(productId, trackId, masterAbs, track.kind);
    if (ok) await products.setTrackPreview(trackId, true);
  }
  return ids;
}

// --- Preview set: auto-pick ~10 diversified samples --------------------------
router.post('/:id/preview-set/auto', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const product = await products.getProductById(id);
  if (!product || product.category !== 'music') {
    res.status(404).json({ success: false, error: 'Music product not found.' });
    return;
  }
  const count = Math.min(Math.max(Number(req.body?.count) || PREVIEW_SET_SIZE, 1), 30);
  const ids = await autoPickPreviewSet(id, count);
  res.json({ success: true, chosen: ids, previewCount: await products.getPreviewCount(id) });
});

// --- Preview set: toggle a single sample -------------------------------------
router.post('/:id/tracks/:trackId/preview', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const trackId = Number(req.params.trackId);
  const on = Boolean(req.body?.on);
  const track = await products.getTrackById(trackId);
  if (!track || track.product_id !== id) {
    res.status(404).json({ success: false, error: 'Track not found.' });
    return;
  }
  if (on) {
    if (!track.master_path) {
      res.status(400).json({ success: false, error: 'This sample has no master file.' });
      return;
    }
    let masterAbs: string;
    try {
      masterAbs = resolveInStorage(track.master_path);
    } catch {
      res.status(400).json({ success: false, error: 'Sample file is unavailable.' });
      return;
    }
    const ok = await buildTrackPreview(id, trackId, masterAbs, track.kind);
    if (!ok) {
      res.status(500).json({ success: false, error: 'Could not build the preview.' });
      return;
    }
    await products.setTrackPreview(trackId, true);
  } else {
    if (track.preview_path) {
      try {
        fs.unlinkSync(resolveInStorage(track.preview_path));
      } catch {
        /* best effort */
      }
    }
    await products.setTrackPreview(trackId, false);
  }
  res.json({ success: true, previewCount: await products.getPreviewCount(id) });
});

// --- Cover image -------------------------------------------------------------
router.post('/:id/cover', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const f = req.file;
  const product = await products.getProductById(id);
  if (!product) {
    if (f) cleanup([f]);
    res.status(404).json({ success: false, error: 'Product not found.' });
    return;
  }
  if (!f) {
    res.status(400).json({ success: false, error: 'No image uploaded (field name must be "image").' });
    return;
  }
  const ext = path.extname(f.originalname).toLowerCase();
  if (!SUPPORTED_COVER_EXT.has(ext)) {
    cleanup([f]);
    res.status(400).json({
      success: false,
      error: 'Unsupported image type. Use JPEG, PNG, WebP, GIF, or HEIC.',
    });
    return;
  }
  // Decode (incl. HEIC), orient upright, and normalize to WebP cover + thumbnail.
  let processed;
  try {
    processed = await processCover(f.path, productDir(id));
  } catch (err) {
    cleanup([f]);
    console.error('[uploads] cover processing failed:', err instanceof Error ? err.message : err);
    res.status(400).json({ success: false, error: 'That image could not be read. Please try another file.' });
    return;
  } finally {
    cleanup([f]); // remove the original upload; we keep only the normalized outputs
  }
  await products.updateProduct(id, {
    coverImagePath: processed.coverRel,
    coverThumbPath: processed.thumbRel,
  });
  res.json({ success: true, coverPath: processed.coverRel, thumbPath: processed.thumbRel });
});

export default router;
