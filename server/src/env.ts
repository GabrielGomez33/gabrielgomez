import path from 'path';
import dotenv from 'dotenv';

// Load .env from the server root (one level up from dist/), independent of the
// process working directory — so PM2 cwd or where you launched from can't cause
// a "missing env var" surprise. Imported first in index.ts so every other
// module sees the loaded values.
dotenv.config({ path: path.join(__dirname, '..', '.env') });
