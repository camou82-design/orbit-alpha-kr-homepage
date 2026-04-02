/**
 * PM2 (Lightsail). Edit paths and secrets before: pm2 start ecosystem.config.cjs
 * Prereq: repo cloned, `npm install` run in this directory.
 */
module.exports = {
  apps: [
    {
      name: "lightsail-futures-paper-api",
      cwd: __dirname,
      script: "npm",
      args: "start",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      env_production: {
        NODE_ENV: "production",
        PORT: "3991",
        // Set these in the file or override: pm2 start ecosystem.config.cjs --env production
        ORBITALPHA_FUTURES_PAPER_ROOT: "/home/admin/orbitalpha-futures-paper",
        ORBITALPHA_FUTURES_PAPER_API_SECRET: "REPLACE_WITH_STRONG_SECRET"
      }
    }
  ]
};
