const path = require('path');

// =============================================================================
// PM2 process definition for the Gabriel Gomez API.
// Mirrors the proven admin-server ecosystem: single stateless Node process,
// hard-restart friendly, logs alongside the other TUGRR services.
// Listens on :8448 (Apache proxies /GabrielGomez/api -> 127.0.0.1:8448).
// =============================================================================
const CWD = __dirname;
const DIST = path.join(CWD, 'dist');
const LOGS = '/root/.pm2/logs';

module.exports = {
  apps: [
    {
      name: 'gabrielgomez-server',
      script: path.join(DIST, 'index.js'),
      cwd: CWD,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      max_memory_restart: '256M',
      out_file: path.join(LOGS, 'gabrielgomez-server-out.log'),
      error_file: path.join(LOGS, 'gabrielgomez-server-error.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--enable-source-maps',
        GABRIELGOMEZ_PORT: '8448',
      },
      kill_timeout: 5000,
      shutdown_with_message: true,
    },
  ],
};
