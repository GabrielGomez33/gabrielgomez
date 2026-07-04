import express, { type Request, type Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { requireAdmin } from '../../auth/middleware';
import * as products from '../../services/products';
import { probe, makeTaggedPreview, extractPeaks } from '../../services/media';
import { productDir, ensureDir, safeName, relFromRoot } from '../../services/storage';

// =============================================================================
// Admin upload pipeline. Audio (file-by-file or a whole folder) → masters on the
// SSD, ffprobe technical info, 10s tagged preview + waveform peaks. Cover images
// too. All JWT-gated.
// =============================================================================

const router = express.Router();
router.use(requireAdmin);

const AUDIO_EXT = new Set(['.wav', '.mp3', '.aiff', '.aif', '.flac', '.m4a', '.ogg']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(productDir(Number(req.params.id)), 'incoming');
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${safeName(file.originalname)}`),
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

// --- Audio: one or many files (folder upload = multiple) ---------------------
router.post('/:id/audio', upload.array('files', 50), async (req: Request, res: Response): Promise<void> => {
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

  const mastersDir = path.join(productDir(id), 'masters');
  const previewsDir = path.join(productDir(id), 'previews');
  ensureDir(mastersDir);
  ensureDir(previewsDir);

  const existing = await products.getTracks(id);
  let position = existing.length;
  const added: Array<Record<string, unknown>> = [];

  for (const f of files) {
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
    const masterAbs = path.join(mastersDir, `${position}_${safeName(f.originalname)}`);
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

    const trackId = await products.addTrack(id, {
      name: path.parse(f.originalname).name,
      position,
      genre: (req.body.genre as string) ?? null,
      style: (req.body.style as products.MusicStyle) ?? null,
      lengthSec: meta.durationSec,
      fileSizeBytes: meta.sizeBytes,
      format: meta.format,
      bitrateKbps: meta.bitrateKbps,
      sampleRate: meta.sampleRate,
      channels: meta.channels,
      originalFilename: f.originalname,
    });

    // Preview + waveform (best effort — a failure here doesn't lose the master).
    const previewAbs = path.join(previewsDir, `${trackId}.mp3`);
    let peaks: number[] = [];
    try {
      await makeTaggedPreview(masterAbs, previewAbs);
      peaks = await extractPeaks(previewAbs, 400);
    } catch (err) {
      console.error('[uploads] preview/peaks failed:', err instanceof Error ? err.message : err);
    }
    await products.setTrackMedia(trackId, {
      masterPath: relFromRoot(masterAbs),
      previewPath: fs.existsSync(previewAbs) ? relFromRoot(previewAbs) : null,
      waveform: peaks.length ? peaks : null,
    });

    added.push({ trackId, name: path.parse(f.originalname).name, position, ...meta });
  }

  await products.recomputeMusicAggregates(id);
  res.status(201).json({ success: true, added, musicMeta: await products.getMusicMeta(id) });
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
  if (!IMAGE_EXT.has(ext)) {
    cleanup([f]);
    res.status(400).json({ success: false, error: 'Unsupported image type.' });
    return;
  }
  ensureDir(productDir(id));
  const coverAbs = path.join(productDir(id), `cover${ext === '.jpeg' ? '.jpg' : ext}`);
  fs.renameSync(f.path, coverAbs);
  await products.updateProduct(id, { coverImagePath: relFromRoot(coverAbs) });
  res.json({ success: true, coverPath: relFromRoot(coverAbs) });
});

export default router;
