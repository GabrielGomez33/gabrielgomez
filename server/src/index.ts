import './env'; // must be first — loads .env from the server root before anything reads process.env
import express, { type Request, type Response, type NextFunction } from 'express';
import 'express-async-errors'; // patch Router so async handler throws reach the error middleware
import cors from 'cors';
import helmet from 'helmet';
import contactRouter from './routes/contact';
import adminAuthRouter from './routes/admin/auth';
import adminProductsRouter from './routes/admin/products';
import adminUploadsRouter from './routes/admin/uploads';
import adminOptionsRouter from './routes/admin/options';
import storeCatalogRouter from './routes/store/catalog';
import storeStreamRouter from './routes/store/stream';

// =============================================================================
// Gabriel Gomez API
// -----------------------------------------------------------------------------
// Behind Apache: ProxyPass /GabrielGomez/api -> http://127.0.0.1:8448/GabrielGomez/api
// All routes are mounted under /GabrielGomez/api so the public path and the
// internal path line up (same convention as admin-server's /admin/api).
//
// Phase 1 (now):   health check + scaffolding.
// Phase 2 (next):  Instagram feed proxy, SonSoul catalog, PayPal Orders,
//                  secure download delivery.
// =============================================================================

const app = express();
const PORT = Number(process.env.GABRIELGOMEZ_PORT ?? 8448);
const BASE = '/GabrielGomez/api';

app.disable('x-powered-by');
// Behind Apache's reverse proxy — trust X-Forwarded-For so req.ip is the real
// client address (used by the contact rate limiter).
app.set('trust proxy', true);
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const router = express.Router();

// -- Health ------------------------------------------------------------------
// Consumed by the CI/CD health check (curl localhost:8448/GabrielGomez/api/health).
const startedAt = Date.now();
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'gabrielgomez-server',
    uptime_s: Math.round((Date.now() - startedAt) / 1000),
    time: new Date().toISOString(),
  });
});

// -- Contact / inquiry (Resend email) ----------------------------------------
router.use('/contact', contactRouter);

// -- SonSoul: admin (creator pipeline, JWT-gated) ----------------------------
router.use('/admin/auth', adminAuthRouter);
router.use('/admin/products', adminProductsRouter);
router.use('/admin/products', adminUploadsRouter); // upload endpoints (:id/audio, :id/cover)
router.use('/admin/options', adminOptionsRouter);

// -- SonSoul: public storefront catalog + secure preview streaming -----------
router.use('/store', storeCatalogRouter);
router.use('/store', storeStreamRouter);

// -- Instagram feed (later) --------------------------------------------------
router.get('/instagram/feed', (_req: Request, res: Response) => {
  res.status(501).json({ status: 'not_implemented', message: 'Instagram feed lands later.' });
});

app.use(BASE, router);

// -- Fallthrough --------------------------------------------------------------
app.use((_req: Request, res: Response) => {
  res.status(404).json({ status: 'not_found' });
});

// -- Error handler (catches async throws via express-async-errors) ------------
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[gabrielgomez-server] unhandled error:', err instanceof Error ? err.stack : err);
  if (!res.headersSent) {
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[gabrielgomez-server] listening on 127.0.0.1:${PORT} (base ${BASE})`);
  console.log(
    `[gabrielgomez-server] email ${
      process.env.RESEND_API_KEY ? 'configured (Resend)' : 'NOT configured (RESEND_API_KEY missing)'
    }`,
  );
});

// Graceful shutdown for PM2 (shutdown_with_message + SIGINT).
function shutdown(signal: string) {
  console.log(`[gabrielgomez-server] ${signal} received, closing...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('message', (msg) => {
  if (msg === 'shutdown') shutdown('shutdown');
});
