import { type Request, type Response, type NextFunction } from 'express';
import { verifyAdminToken, type AdminTokenPayload } from './tokens';

// Augment Express Request with the authenticated admin.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminTokenPayload;
    }
  }
}

/** Require a valid admin bearer token. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ success: false, error: 'Authentication required.' });
    return;
  }
  try {
    req.admin = verifyAdminToken(token);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired session.' });
  }
}
