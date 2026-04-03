/**
 * PM2 — Lightsail/VM 등 지속 실행 환경용 (Vercel/serverless 부적합).
 * 저장소 루트에서: pm2 start ecosystem.config.cjs
 * 재부팅 후 복구: pm2 startup && pm2 save (한 번 설정)
 */
const root = __dirname;

module.exports = {
  apps: [
    {
      name: "orbitalpha-kiwoom-live-engine",
      cwd: root,
      script: "npm",
      args: "run live:test",
      autorestart: true,
      max_restarts: 30,
      min_uptime: "10s",
      env: { NODE_ENV: "production" },
    },
    {
      name: "orbitalpha-kiwoom-live-monitor",
      cwd: root,
      script: "npm",
      args: "run monitor",
      autorestart: true,
      max_restarts: 30,
      min_uptime: "5s",
      env: { NODE_ENV: "production" },
    },
    {
      name: "orbitalpha-kiwoom-paper-engine",
      cwd: root,
      script: "npm",
      args: "run paper:engine",
      autorestart: true,
      max_restarts: 30,
      min_uptime: "10s",
      env: { NODE_ENV: "production" },
    },
    {
      name: "orbitalpha-kiwoom-paper-dashboard",
      cwd: root,
      script: "npm",
      args: "run paper:ui",
      autorestart: true,
      max_restarts: 30,
      min_uptime: "5s",
      env: { NODE_ENV: "production" },
    },
  ],
};
