# Lightsail: futures-paper read-only API

Serves the same JSON bundle as the homepage `/api/futures-paper/data`, but reads `ORBITALPHA_FUTURES_PAPER_ROOT/data` on **this** machine (e.g. Lightsail where `orbitalpha-futures-paper` lives).

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | none |
| GET | `/api/futures-paper/data` | Header `x-orbitalpha-futures-paper-token: <secret>` |

## Env (Lightsail)

- `ORBITALPHA_FUTURES_PAPER_ROOT` — e.g. `/home/admin/orbitalpha-futures-paper`
- `ORBITALPHA_FUTURES_PAPER_API_SECRET` — long random string; **must match** Vercel `ORBITALPHA_FUTURES_PAPER_API_SECRET`
- `PORT` — default `3991`

## Run

From the **homepage repo root** (so `../../src/lib/futuresPaperBundleCore.ts` resolves):

```bash
cd server/lightsail-futures-paper-api
npm install
export ORBITALPHA_FUTURES_PAPER_ROOT=/home/admin/orbitalpha-futures-paper
export ORBITALPHA_FUTURES_PAPER_API_SECRET=your-secret
npm start
```

Use **HTTPS** on the public URL (Vercel server-side `fetch` should call `https://...`).

Put Nginx (or Caddy) in front with TLS; optionally restrict source IPs to Vercel, plus the shared secret.

## Vercel (homepage)

Set:

- `ORBITALPHA_FUTURES_PAPER_API_URL` — public base URL of this API (no trailing slash required)
- `ORBITALPHA_FUTURES_PAPER_API_SECRET` — same value as on Lightsail

Unset `ORBITALPHA_FUTURES_PAPER_ROOT` on Vercel (not used when API URL is set).

## PM2 (Lightsail)

1. Clone/pull this repo on the instance (path below is an example).

```bash
cd /path/to/orbit-alpha-kr-homepage/server/lightsail-futures-paper-api
npm ci
# Edit ecosystem.config.cjs: ORBITALPHA_FUTURES_PAPER_ROOT and ORBITALPHA_FUTURES_PAPER_API_SECRET
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup   # follow the printed command once
```

## Nginx + TLS (`https://paper-api.orbitalpha.kr`)

1. DNS: **A** record `paper-api.orbitalpha.kr` → Lightsail instance public IP.
2. Copy `nginx-paper-api.orbitalpha.kr.conf.example` into `/etc/nginx/sites-available/`, adjust paths, enable site, `nginx -t && systemctl reload nginx`.
3. `certbot --nginx -d paper-api.orbitalpha.kr` (or `certonly` first).

## Post-deploy checks (from any machine)

```bash
curl -sS https://paper-api.orbitalpha.kr/health
curl -sS -H "x-orbitalpha-futures-paper-token: YOUR_SECRET" \
  https://paper-api.orbitalpha.kr/api/futures-paper/data | head -c 400
```

Vercel Production must have `ORBITALPHA_FUTURES_PAPER_API_URL=https://paper-api.orbitalpha.kr` and the same `ORBITALPHA_FUTURES_PAPER_API_SECRET`, then redeploy the homepage.
