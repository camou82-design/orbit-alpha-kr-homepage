/**
 * PM2 — Lightsail/VM 등 지속 실행 환경용 (Vercel/serverless 부적합).
 * 저장소 루트에서: pm2 start ecosystem.config.cjs
 * 재부팅 후 복구: pm2 startup && pm2 save (한 번 설정)
 *
 * 프로젝트 루트의 `.env`를 여기서 로드해 각 앱(npm 자식)에 동일 env를 전달합니다.
 * (쉘에서 export 하지 않아도 KIWOOM_* · MONITOR_STATUS_FILE 등이 live/monitor/paper에 적용됨)
 */
const path = require("path");
const root = __dirname;

require("dotenv").config({ path: path.join(root, ".env") });

const env = { ...process.env };
if (!env.NODE_ENV) env.NODE_ENV = "production";

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
      env,
    },
    {
      name: "orbitalpha-kiwoom-live-monitor",
      cwd: root,
      script: "npm",
      args: "run monitor",
      autorestart: true,
      max_restarts: 30,
      min_uptime: "5s",
      env,
    },
    {
      name: "orbitalpha-kiwoom-paper-engine",
      cwd: root,
      script: "npm",
      args: "run paper:engine",
      autorestart: true,
      max_restarts: 30,
      min_uptime: "10s",
      env,
    },
    {
      name: "orbitalpha-kiwoom-paper-dashboard",
      cwd: root,
      script: "npm",
      args: "run paper:ui",
      autorestart: true,
      max_restarts: 30,
      min_uptime: "5s",
      env,
    },
  ],
};
