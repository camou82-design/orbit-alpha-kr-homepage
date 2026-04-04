# Lightsail / VM 배포 체크리스트 (orbitalpha.kr `/kiwoom/*`)

이 문서는 **서버에서 직접** 실행하는 순서입니다. Cursor/CI는 원격 SSH를 대신 실행할 수 없습니다.

## 1. 코드 반영

```bash
cd /opt/orbitalpha-kiwoom-trading
git pull
npm ci
npm run build
```

## 2. 운영 `.env` (예시 키)

- `NODE_ENV=production`
- `KIWOOM_PUBLIC_BASE_PATH=/kiwoom`
- `MONITOR_HOST=127.0.0.1`
- `PAPER_DASHBOARD_HOST=127.0.0.1`
- `MONITOR_PORT=3001`
- `PAPER_DASHBOARD_PORT=3002`
- **스냅샷 경로 고정(권장):** 엔진과 `npm run monitor`의 `process.cwd()`가 다르면 구버전 JSON을 읽을 수 있음. 예: `MONITOR_STATUS_FILE=/home/admin/.../orbitalpha-kiwoom-trading/data/monitor-status.json` (절대 경로) 또는 `KIWOOM_PROJECT_ROOT`를 동일 값으로 설정.
- 기존 `KIWOOM_*`·`LIVE_*`·`PAPER_*` 등은 운영값 유지 (가드 완화 금지)

## 3. PM2

```bash
sudo npm i -g pm2
npm run pm2:start
pm2 status
pm2 logs --lines 100
pm2 save
sudo env PATH=$PATH pm2 startup systemd -u "$USER" --hp "$HOME"
```

## 4. Nginx

`deploy/nginx-kiwoom.example.conf` 를 참고해 `server { ... }` 안에 다음을 반영합니다.

- `location /kiwoom/live/` → `proxy_pass http://127.0.0.1:3001/;`
- `location /kiwoom/paper/` → `proxy_pass http://127.0.0.1:3002/;`
- 필수 헤더: `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`
- `location = /kiwoom/live` → `301 /kiwoom/live/` (trailing slash)
- `location = /kiwoom/paper` → `301 /kiwoom/paper/`

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. 서버 내부 검증

```bash
pm2 status
curl -I http://127.0.0.1:3001/
curl -I http://127.0.0.1:3002/
curl -sS -H "X-Forwarded-Proto: https" -H "X-Forwarded-Host: orbitalpha.kr" http://127.0.0.1:3001/ | grep -i href
curl -sS -H "X-Forwarded-Proto: https" -H "X-Forwarded-Host: orbitalpha.kr" http://127.0.0.1:3002/ | grep -i href
```

## 6. 외부 검증

- `https://orbitalpha.kr/kiwoom/paper/`
- `https://orbitalpha.kr/kiwoom/live/`
- 홈페이지 TOOLS 첫 카드 → `/kiwoom/paper/` 이동
