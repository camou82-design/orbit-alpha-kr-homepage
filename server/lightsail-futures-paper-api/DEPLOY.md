# paper-api.orbitalpha.kr — Lightsail + Nginx + Vercel (runbook)

`orbitalpha-trading` 실거래 코드와 무관합니다. homepage + `server/lightsail-futures-paper-api`만 대상입니다.

## 0. 전제

- Lightsail 인스턴스 공인 IP: `<LIGHTSAIL_IP>` (인스턴스 콘솔에서 확인)
- 서버에 Node 20+, Nginx, Certbot, PM2 사용 가능
- 저장소가 인스턴스에 클론됨: 경로 예) `/home/admin/orbit-alpha-kr-homepage`

## 1. DNS (도메인 관리하는 곳에서)

**A 레코드**

| Name | Type | Value |
|------|------|--------|
| `paper-api` | A | `<LIGHTSAIL_IP>` |

- `orbitalpha.kr`이 **Vercel DNS**에 있으면: Vercel → 프로젝트/도메인 → **DNS** → 위 레코드 추가.
- 다른 호스팅(가비아, Route53 등)이면 동일하게 A 레코드 추가.

전파 확인(로컬 PC):

```bash
nslookup paper-api.orbitalpha.kr
curl -sS https://paper-api.orbitalpha.kr/health
```

## 2. Lightsail 네트워크

- 인스턴스 방화벽에서 **TCP 22, 80, 443** 허용.

## 3. API 서버 (npm ci + PM2)

인스턴스에서:

```bash
cd /home/admin/orbit-alpha-kr-homepage/server/lightsail-futures-paper-api
git pull
npm ci
```

`ecosystem.config.cjs`의 `ORBITALPHA_FUTURES_PAPER_ROOT`, `ORBITALPHA_FUTURES_PAPER_API_SECRET`을 실제 값으로 수정한 뒤:

```bash
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup   # 안내 명령 한 번 실행
```

기본 포트는 **3991** (`PORT`).

## 4. Nginx + Certbot (HTTPS 리버스 프록시)

`nginx-paper-api.orbitalpha.kr.conf.example`를 참고해 `/etc/nginx/sites-available/`, `sites-enabled`에 링크.

**먼저** 80만 열린 임시 server 블록으로 certbot을 쓰거나, `certbot certonly --standalone -d paper-api.orbitalpha.kr` (PM2/Nginx 잠시 중지 후) 등으로 인증서 발급.

인증서 경로를 맞춘 뒤:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`location /` → `proxy_pass http://127.0.0.1:3991;` (예시 파일과 동일).

## 5. Vercel Production (homepage)

프로젝트 → **Settings → Environment Variables → Production**:

| Name | Value |
|------|--------|
| `ORBITALPHA_FUTURES_PAPER_API_URL` | `https://paper-api.orbitalpha.kr` |
| `ORBITALPHA_FUTURES_PAPER_API_SECRET` | Lightsail `ecosystem.config.cjs`과 **동일** |

저장 후 **Deployments → Redeploy** (또는 `main`에 빈 커밋 푸시).

Vercel에는 `ORBITALPHA_FUTURES_PAPER_ROOT`를 두지 않거나 비워서, **원격 API만** 쓰게 합니다.

## 6. 검증

**Lightsail API (직접)**

```bash
curl -sS https://paper-api.orbitalpha.kr/health
curl -sS -H "x-orbitalpha-futures-paper-token: <SECRET>" \
  -H "Accept: application/json" \
  "https://paper-api.orbitalpha.kr/api/futures-paper/data" | head -c 600
```

**홈페이지** (관리자 로그인 후 브라우저 쿠키 필요)

- `GET https://www.orbitalpha.kr/api/futures-paper/data` (로그인 후) → `configured: true` 및 JSON 번들.
- `https://www.orbitalpha.kr/futures-paper` → 심볼·성과 블록에 실데이터 표시.

로컬에서 쿠키 없이 API만 보려면:

```bash
curl -sS "https://www.orbitalpha.kr/api/futures-paper/data"
# → 401 (정상)

# 로그인 후 브라우저 개발자 도구에서 쿠키 homepage_admin_auth 복사해 테스트
```

## 7. 실패 시

- `curl: Could not resolve host` → DNS A 레코드/전파 대기.
- `502` / 연결 거부 → PM2·포트 3991·Nginx `proxy_pass` 확인.
- `401` on Lightsail data → 헤더 `x-orbitalpha-futures-paper-token`과 `ORBITALPHA_FUTURES_PAPER_API_SECRET` 일치 확인.
- Vercel에서 데이터 없음 → `ORBITALPHA_FUTURES_PAPER_API_URL`/`SECRET`과 **재배포** 여부 확인.
