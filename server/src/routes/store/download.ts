import express, { type Request, type Response } from 'express';
import { getGrantByToken, claimDownload, streamZip, tierIncludesStems } from '../../services/delivery';

// =============================================================================
// Secure download. Validates the grant (exists, not expired, count remaining),
// atomically claims a slot, then streams a freshly-built zip of the masters.
// No file path is ever exposed. Only reachable with a valid paid-order token.
// =============================================================================

const router = express.Router();

router.get('/download/:token', async (req: Request, res: Response): Promise<void> => {
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) {
    res.status(400).json({ success: false, error: 'Invalid download token.' });
    return;
  }

  const grant = await getGrantByToken(token);
  if (!grant) {
    res.status(404).json({ success: false, error: 'Download not found.' });
    return;
  }
  if (new Date(grant.expires_at).getTime() < Date.now()) {
    res.status(410).json({ success: false, error: 'This download link has expired.' });
    return;
  }
  if (grant.download_count >= grant.max_downloads) {
    res.status(429).json({ success: false, error: 'Download limit reached.' });
    return;
  }

  // Atomically claim a slot BEFORE streaming — prevents exceeding the cap.
  const claimed = await claimDownload(grant.id);
  if (!claimed) {
    res.status(429).json({ success: false, error: 'Download limit reached.' });
    return;
  }

  // WAV leases never receive the stems/ folder; higher tiers (and non-tiered
  // products like sample packs) do.
  streamZip(res, grant.file_path, `sonsoul-${token.slice(0, 8)}`, tierIncludesStems(grant.license_tier));
});

export default router;
