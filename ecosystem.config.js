/**
 * PM2: deploy to /var/www/guardy (see .github/workflows/main.yml).
 * Place production .env next to this file — Nest ConfigModule loads .env from process cwd.
 * Do not commit .env. PORT and DB_* come from .env unless overridden below.
 */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'guardy',
      cwd: path.join(__dirname),
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
