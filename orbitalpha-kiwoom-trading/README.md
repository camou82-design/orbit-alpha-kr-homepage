# orbitalpha-kiwoom-trading

## 급등주 모의매매 화면 실행 (PAPER 전용)

> **LIVE·실주문과 무관.** 브라우저는 `data/paper-dashboard.json`만 읽습니다 (paper 루프가 매 틱 갱신).

| 단계 | 할 일 |
| --- | --- |
| 1 | `npm install` (최초 1회) |
| 2 | `npm run paper` 또는 `npm run paper:ui` — 전용 대시보드만 기동 **또는** `npm run paper:all` — paper 엔진과 대시보드 동시 |
| 3 | 브라우저 **http://127.0.0.1:3002** (`PAPER_DASHBOARD_PORT`로 포트 변경 가능) |

엔진만 따로 띄운 경우에는 `npm start` (기본 paper 모드) 후, 다른 터미널에서 `npm run paper:ui`를 실행하면 스냅샷이 갱신됩니다.

---

## 가장 빠른 실행 (로컬)

> **전략 자동 실주문은 비활성**입니다. 제한된 테스트 주문만 `LIVE_TEST_*` 가드·정규장·1종목·1주·1일1회 등을 모두 만족할 때만 가능합니다.

| 단계 | 할 일 |
| --- | --- |
| 1 | `.env` 확인: `cp .env.example .env` 후 키움 계정·키 등 (live는 `KIWOOM_*` 필수) |
| 2 | `npm install` (최초 1회) |
| 3 | `npm run live:test` — live 경로(REST 잔고·시세, dry-run, 제한 테스트 주문만) |
| 4 | `npm run monitor` **또는** `npm run live:all` (엔진+모니터 동시; 엔진이 끝나면 모니터도 종료) |
| 5 | 브라우저 **http://127.0.0.1:3001** (`MONITOR_PORT`로 포트 변경 가능) |

**테스트 주문(실제 매수 1주 지정가) 추가로 필요한 env**: `LIVE_TRADING_ENABLED=true`, `LIVE_TEST_ORDER_ENABLED=true`, `LIVE_TEST_MAX_QTY=1`, `LIVE_TEST_MAX_ORDERS_PER_DAY=1`, `LIVE_TEST_ALLOWED_SYMBOL=…`, `LIVE_TEST_ORDER_CONFIRM=EXECUTE_TEST_BUY_ONCE` — 상세는 `.env.example` 및 코드의 가드 로그 참고.

---

## 운영 배포 (Lightsail/VM · PM2 · Nginx)

로컬은 위 표를 따르고, **운영**은 **지속 프로세스 + 파일 스냅샷**을 전제로 합니다. **Vercel 등 서버리스는 부적합**합니다(장시간 Node 프로세스·로컬 포트·`data/` JSON 유지가 핵심이라 cold start/무상태 모델과 맞지 않음).

### 전제

| 항목 | 내용 |
| --- | --- |
| 런타임 | Node 20+ |
| 프로세스 관리 | PM2 (`ecosystem.config.cjs`) |
| 역방향 프록시 | Nginx → `127.0.0.1:3001` (live monitor), `127.0.0.1:3002` (paper dashboard) |
| 상태 | `data/monitor-status.json`, `data/paper-dashboard.json` 등 **JSON 파일** (엔진·UI 분리 구조 유지) |

### PM2에 등록되는 앱 이름

| PM2 `name` | 역할 | npm 스크립트 |
| --- | --- | --- |
| `orbitalpha-kiwoom-live-engine` | Live 엔진 (REST·가드·스냅샷 갱신 등) | `npm run live:test` |
| `orbitalpha-kiwoom-live-monitor` | Live 계좌형 모니터 HTTP **:3001** | `npm run monitor` |
| `orbitalpha-kiwoom-paper-engine` | Paper 루프 (모의 시그널·`paper-dashboard.json` 갱신) | `npm run paper:engine` |
| `orbitalpha-kiwoom-paper-dashboard` | Paper 대시보드 HTTP **:3002** | `npm run paper:ui` |

엔진은 `.env`를 읽습니다. 서버에 프로젝트를 클론한 뒤 `cp .env.example .env` 로 채우고, **민감값은 저장소에 커밋하지 마세요.**

### 배포 명령 순서 (예: Ubuntu)

```bash
cd /opt/orbitalpha-kiwoom-trading   # 실제 경로
git pull
npm ci
# .env 운영값 설정
npm run build   # 선택: tsc
sudo npm i -g pm2
npm run pm2:start
pm2 save
sudo env PATH=$PATH pm2 startup systemd -u $USER --hp $HOME
```

- **재시작**: `pm2 restart ecosystem.config.cjs` 또는 `npm run pm2:reload`
- **로그**: `pm2 logs` / `pm2 logs orbitalpha-kiwoom-live-monitor`
- **중지·제거**: `npm run pm2:stop` (또는 `pm2 delete <name>`)

### Nginx 경로 예시

| 외부 경로 | 내부 |
| --- | --- |
| `https://<도메인>/kiwoom/live/` | `http://127.0.0.1:3001/` |
| `https://<도메인>/kiwoom/paper/` | `http://127.0.0.1:3002/` |

설정 템플릿: `deploy/nginx-kiwoom.example.conf` — `X-Forwarded-*` / `Host` 포함. WebSocket 미사용 시 일반 `proxy_pass` 만으로 충분합니다.

**상호 이동 링크 (monitor ↔ paper 대시보드):** `.env`에 `KIWOOM_LIVE_PUBLIC_MOUNT=/live`, `KIWOOM_PAPER_PUBLIC_MOUNT=/paper` 를 Nginx 공개 경로와 맞추면 링크·로그인 리다이렉트가 `/live/`, `/paper/` 기준으로 고정됩니다. 절대 URL이 필요하면 `KIWOOM_LIVE_URL` / `KIWOOM_PAPER_URL` 을 씁니다. 마운트가 비어 있고 프록시 헤더만 있으면 기본 `/live/`, `/paper/` 를 씁니다. 로컬 직접 포트 접속은 `127.0.0.1:3001`·`:3002` URL (`src/infra/cross-nav-links.ts`, `dashboard-http-auth.ts`).

### 최소 보안 (권장)

- **Live monitor**는 계좌 스냅샷 등 민감도가 높으므로 공개 전 **Nginx `allow` IP 제한** 또는 **Basic 인증** 중 하나 이상을 적용하세요. 예시는 `deploy/nginx-kiwoom.example.conf` 주석에 있습니다.
- **Paper dashboard**는 read-only 이지만, 동일 서버 정책에 따라 IP 제한·Basic 인증·경로 비공개를 검토하세요.
- **실주문 가드·`LIVE_*` 기본값·전략 로직은 배포 설정으로 완화하지 마세요.**

### 운영 시 남는 리스크 (요약)

1. **프록시 헤더 누락** 시 링크가 포트 URL로 생성될 수 있음 → `KIWOOM_LIVE_PUBLIC_MOUNT` / `KIWOOM_PAPER_PUBLIC_MOUNT` 로 명시하거나 Nginx에서 `X-Forwarded-*` 전달 확인.
2. **디스크·권한**: `data/`·`logs/` 쓰기 권한, 디스크 부족 시 스냅샷 실패.
3. **PM2·Nginx 장애**: 한쪽만 재시작되면 포트 불일치; 배포 후 `pm2 status`·`curl -I` 로 확인.

---

## 목적

키움증권 **국내 주식** 자동매매 엔진을 **독립 저장소·독립 실행**으로 설계·개발하기 위한 프로젝트입니다. 다른 앱(홈페이지, 선물 페이퍼 등)과 코드를 섞지 않고, 국내 주식에 맞는 실행 계층을 별도로 다듬는 것이 목표입니다.

## orbitalpha-trading(업비트 등)과의 차이

| 구분 | orbitalpha-trading | 이 프로젝트 |
| --- | --- | --- |
| 시장 | 암호화폐(업비트 등) API 모델 | 키움 국내 주식 세션·주문·계좌 모델 |
| 실행 계층 | 거래소 REST/WebSocket에 맞춘 흐름 | 키움 전용 `kiwoom/` 어댑터로 분리 예정 |
| 배포/포트 | 기존 스택에 맞춤 | **별도 Node 프로젝트**로 포트·환경 충돌 없이 기동 |
| 손익·비용 | 보통 매수/매도 수수료 중심(코인 거래세 구조와 다름) | **매수·매도 수수료 + 매도 거래세**(일반 개인·단순 모델)를 반영한 **최종 순손익(final net)** 기준으로 paper 트레이드·요약·진입 필터를 맞춤 |

### 국내 주식 비용과 final net PnL (paper)

- **업비트(코인)**는 대개 **양방향 수수료**만 빼면 되는 경우가 많지만, **국내 현물 주식**은 **매도 시 거래세**가 붙습니다(본 레포는 복잡한 세법 분기 없이 **일반 개인 투자자 기준 단순 모델**만 사용).
- Paper 청산 시 `grossPnlKrw`·수수료·세금·`finalNetPnlKrw`를 JSONL에 남기고, **`pnlKrw`는 `finalNetPnlKrw`와 동일 값**(레거시 호환)입니다. **`pnlPct`는 매수 금액 대비 최종 순이익률**입니다.
- **작은 가격 수익**이라도 수수료·세금·슬리피지를 합치면 **순손익은 마이너스**가 될 수 있습니다. 전략 평가·`trade-summary`의 합계·승패는 **final net**을 기준으로 합니다.
- **진입 필터**: `pump-selector`는 상한가 잔여 여력과 익절 목표 중 작은 쪽을 **예상 이동폭**으로 보고, **매수·매도 수수료 + (옵션) 매도세 + 양쪽 슬리피지**에 **버퍼**(`PAPER_COST_EDGE_BUFFER_PCT`)를 더한 값보다 작으면 `insufficient_edge_after_cost`로 제외합니다.

## 왜 업비트 로직을 그대로 쓰지 않는가

- **세마다 규칙이 다름**: 시장 시간, 호가·체결 단위, 상하한가, 동시호가 등이 암호화폐와 다릅니다.
- **결합도 방지**: 업비트용 코드를 통째로 복사하면 키움 예외가 전역에 퍼져 유지보수가 어렵습니다.
- **재사용 단위**: “전략 철학·판단 뼈대”는 `core/`에서 공유할 수 있지만, **주문·시세·계좌**는 `kiwoom/`에 두고 바꿀 수 있게 합니다.

## 앱 구조: 통합 진입점 · 엔진 분리

UI는 **콘솔 기준 하나의 진입**(`npm start` → 로그인 생략 가능 → 대시보드 → 모드)이지만, **실행 계층은 분리**합니다.

| 영역 | 역할 |
| --- | --- |
| `src/auth/` | 로컬 계정·세션·역할(viewer / trader). DB·OAuth 없음. |
| `src/paper/` | mock 시세 + paper loop(시그널·트레이드 JSONL). **실주문 없음.** |
| `src/live/` | 실거래용 셸 — **REST 잔고·시세**·dry-run 가드·**제한된 테스트 주문 경로**(`LIVE_TEST_*`). 전략 루프에서의 자동 실주문 없음. |
| `src/reports/` · `npm run summarize-*` | JSONL 요약·리포트. paper/live 런타임과 **합치지 않음**. |

- **viewer**: paper·reports 안내 가능. **live 엔진 진입 불가.**
- **trader**: live 메뉴(dry-run) 가능. `LIVE_CONFIRMATION_REQUIRED=true`이면 `CONFIRM LIVE` 입력 전까지 live 가드가 막습니다.
- **AUTH_ENABLED=false**: 비밀번호 없이 `dev` 세션(역할은 `AUTH_BYPASS_ROLE`). 기본 진입 모드는 **paper**(기존 스크립트와 호환).

## 현재 단계

**Paper 경로에서는** `MockMarketDataAdapter`로 시세를 흉내 낸 뒤, `LOOP_INTERVAL_MS` 간격으로 **paper loop**가 돌고, 종목 후보는 `BasicUniverseFilter`로 거르고, `evaluateScore`로 점수를 낸 다음 **`data/signals/YYYY-MM-DD.jsonl`**(또는 `EXPERIMENT_TAG`가 있으면 **`YYYY-MM-DD-<tag>.jsonl`**)에 한 줄씩 적재합니다. 요약 로그는 **`logs/paper-loop-YYYY-MM-DD.log`**(태그가 있으면 파일명에 `-<tag>`)에 JSON 한 줄로 남습니다.

같은 JSONL을 **`npm run summarize-signals`**로 읽어 **전체 + REGULAR 전용** 후보 비율·세션·심볼 분포·경고를 한 번에 보는 **signal summary**까지 가능합니다(키움 API 불필요).

또한 `data/trades/*.jsonl`(mock pump paper trading 결과)을 분석하는 **trade summary**까지 제공합니다(역시 키움 API 불필요).

추가로 **업비트식 급등주 탐지에 가까운 mock paper 매매**가 붙어 있습니다: `candidate` 중 `pump-selector`로 진입 후보를 고르고, 인메모리 **`PaperBroker`**에서 손절·익절·최대 보유 틱·트레일링(구조)으로 청산하며, 체결은 **`SimpleFillSimulator`**(슬리피지)만 사용합니다. 완료된 트레이드는 **`data/trades/YYYY-MM-DD[-tag].jsonl`**에 한 줄씩 저장됩니다. 이는 **수익 검증용 시뮬**이며 **실계좌 주문이 아닙니다**.

## 다음 작업 우선순위 (로드맵 요약)

1. **키움 실제 시세 어댑터**: `MarketDataAdapter` 구현체를 mock 자리에 연결 (REST/OCX 등 선택은 별도 설계).
2. **시장시간 게이트 고도화**: 공휴일·조기종료·동시호가 구간 반영.
3. **소액 실주문(마지막 단계)**: mock paper에서 검증된 파라미터만 키움 주문 계층에 연결(별도 설계).

## 실행 방법

```bash
cd orbitalpha-kiwoom-trading
npm install
cp .env.example .env   # 로컬 검증 시: 민감정보는 .env에만 기입 (저장소에 커밋하지 말 것)
# 짧게 검증만 하려면 (예: 2틱 후 종료):
# Windows PowerShell: $env:PAPER_LOOP_MAX_TICKS=2; npm start
# bash: PAPER_LOOP_MAX_TICKS=2 npm start
npm start
```

- **로그인**: `.env`에서 `AUTH_ENABLED=true`로 두면 콘솔에서 사용자/비밀번호를 묻습니다. `AUTH_ENABLED=false`(기본)면 로그인 생략.
- **모드**: `APP_ENTRY_MODE=paper|reports|live|menu` — 비우면 `AUTH_ENABLED=false`일 때 **paper**로 바로 실행(기존 동작), `AUTH_ENABLED=true`일 때는 **menu**로 모드 선택 프롬프트.
- **live**: `APP_ENTRY_MODE=live` 또는 메뉴에서 `live`. **전략 자동 실주문은 없음.** `live-guard`·`LIVE_TRADING_ENABLED`는 dry-run 판정에 사용. **제한된 테스트 매수 1주**는 `LIVE_TEST_*` 가드·정규장 등을 만족할 때만 별도 경로에서 전송 가능.

- **`PAPER_LOOP_MAX_TICKS`**: 비우면 Ctrl+C까지 반복. 숫자를 넣으면 해당 횟수만 돌고 종료합니다.
- **`SIGNALS_DIR` / `LOGS_DIR`**: 기본값은 각각 `data/signals`, `logs`입니다.
- **`FORCE_SESSION_PHASE`**: 비우면 시계 기준 세션. 값을 주면 mock paper loop에서만 해당 세션으로 고정(예: 밤에 **`REGULAR`**로 두고 후보·signal-summary를 장중처럼 검증). 허용: `CLOSED`, `PRE_OPEN`, `PREMARKET`(=PRE_OPEN), `REGULAR`, `AFTER_HOURS`. 잘못된 값은 경고 후 무시됩니다.
- **`EXPERIMENT_TAG`**: 비우면 기본 파일명. 값을 주면 같은 날짜라도 시그널·루프 로그·summary JSON 파일명에 `-<tag>`를 붙여 **점수 컷·턴오버 컷** 등을 바꿔가며 결과를 나란히 비교하기 쉽게 합니다(영문·숫자·`_`·`-` 권장).

### 환경 파일: `.env.example` vs `.env`

| 파일 | 용도 |
| --- | --- |
| **`.env.example`** | **샘플·템플릿만** 저장소에 둡니다. 비밀번호·계좌·API 키/시크릿 등 **민감정보를 넣지 마세요** (placeholder 또는 빈 값). |
| **`.env`** | 로컬·개인 검증용 **실제 값**은 여기에만 둡니다. **`.gitignore`에 포함**되어 커밋되지 않습니다. `cp .env.example .env` 후 편집하세요. |

**live 모드의 의미**: `APP_ENTRY_MODE=live`이면 **키움 REST 잔고·시세 조회**와 dry-run 가드를 실행합니다. **실주문**은 전략에서 일괄 전송하지 않으며, **테스트 주문**은 `LIVE_TEST_*` 등 가드가 모두 통과할 때만 제한적으로 전송됩니다.

환경 변수 키 목록은 `.env.example` 상단 주석과 아래 표를 참고하세요.

### Kiwoom 연결 검증 (dry-run 전용, 실주문 없음)

**목적**: **실주문이 아니라** 계좌·시세 **연결 준비**와 **안전 점검**만 합니다. 브로커 주문 API는 **호출하지 않습니다**.

**필수·권장 환경변수 (연결 스텁·시작 검증)** — 값은 **`.env`에만** 기입합니다.

| 상황 | 요구 |
| --- | --- |
| `AUTH_ENABLED=true` | `ADMIN_PASSWORD`, `VIEWER_PASSWORD`, `TRADER_PASSWORD` **셋 모두** 비어 있지 않아야 함 (시작 시 검증). |
| `APP_ENTRY_MODE=live` | `KIWOOM_ACCOUNT_NO`, `KIWOOM_API_KEY`, `KIWOOM_API_SECRET` **셋 모두** `.env`에 설정 (없으면 `live connection not configured`로 **즉시 종료**). **이 경우에도 실주문은 비활성**이며 dry-run만 진행됩니다. |
| `LIVE_TRADING_ENABLED` | dry-run 가드·테스트 주문 전제 조건에 사용 (`true`여야 테스트 주문 가드 일부 통과). **전략 자동 실주문은 없음.** |

**실행 순서 (예시)**

1. `.env`에 위 값을 직접 채움 (저장소에는 비밀번호·키를 넣지 않음).
2. `AUTH_BYPASS_ROLE=trader` 또는 `AUTH_ENABLED=true`로 **trader** 세션 확보.
3. `APP_ENTRY_MODE=live`로 기동하거나, 메뉴에서 `live` 선택.
4. `CONFIRM LIVE` 프롬프트가 나오면 입력(드라이런 확인).
5. 콘솔에서 `config.loaded` → `session.current` → `dashboard.ready` → `live.engine` → `kiwoom.connect` / `kiwoom.account` / `kiwoom.quote` → `live.dry_run` / `live.dry_run.decision` 로그 확인.

**성공 기준 (연결 검증 관점)**

1. trader(또는 우회 trader)로 대시보드까지 진입.
2. `live.engine`이 **dry-run only**로 기동.
3. `kiwoom.connect` **attempt** 로그 및 `not_configured` 또는 **OAuth/연결 성공** 로그.
4. `kiwoom.account` / `kiwoom.quote` **fetch attempt** 로그.
5. **실주문**: 전략 일괄 전송 없음. `submitLiveOrderNotImplemented`는 로그 전용. **테스트 매수**는 `LIVE_TEST_*` 가드 통과 시에만.

### 로컬 live 빠른 실행 (`live:test` / `live:local`)

**권장**: `npm run live:test` — 로컬에서 live 경로만 바로 실행합니다. (`npm run live:local`은 동일 명령의 별칭입니다.)

```bash
npm run live:test
```

- **동작 방식**:
  - 내부적으로 `AUTH_ENABLED=false`, `AUTH_BYPASS_ROLE=trader`, `APP_ENTRY_MODE=live`, `LIVE_CONFIRMATION_REQUIRED=false`로 설정하고 `src/app/main.ts`를 실행합니다.
  - `AUTH_ENABLED=false`이므로 **로그인 프롬프트 없이** trader 권한 `dev` 세션으로 대시보드 및 live 엔진에 진입합니다.
- **목적**:
  - `live.engine` 기동, `market.session` 감지, `kiwoom.connect` / `kiwoom.account` / `kiwoom.quote` 시도 로그, `live.dry_run` / `live.dry_run.decision` 로그, (조건부) 제한 테스트 주문 로그를 관찰하기 위한 경로입니다.
- **주의사항**:
  - **로컬 검증 전용**입니다. 운영·배포 기본 설정으로 사용하지 마세요.
  - **전략 자동 실주문은 없음.** 테스트 주문은 `LIVE_TEST_*`·정규장·확인 문자열 등을 모두 만족할 때만.

### 로컬 읽기 전용 모니터 (localhost, 브라우저)

CLI 구조는 그대로 두고, **별도 프로세스**로 `127.0.0.1` 전용 **읽기 전용** 페이지만 띄웁니다. 운영 배포용이 아니며, **주문·실행·정지·재시작 버튼 없음**. 엔진과 함께 띄우려면 **`npm run live:all`** (엔진 종료 시 모니터도 함께 종료).

| 항목 | 설명 |
| --- | --- |
| **역할** | `data/monitor-status.json`(CLI가 마지막 실행 시 갱신)을 읽어 **요약 HTML**로 표시. `/api/status`는 **원본 JSON** 그대로 유지 |
| **금지** | 모니터가 CLI를 시작/종료하지 않음. 브로커·주문 API 호출 없음 |
| **포트** | 기본 `3001` (`MONITOR_PORT`로 변경 가능) |
| **상태 파일** | 기본 `data/monitor-status.json` (`MONITOR_STATUS_FILE`로 상대 경로 변경 가능) — `.gitignore`에 포함 |
| **갱신** | 루트 페이지는 서버에서 HTML을 렌더링하며, 약 **5초마다 자동 새로고침**(읽기 전용). 원문 JSON은 **「원문 JSON 보기」**에서만 펼침 |

**실행 방법**

1. **한 번에**: `npm run live:all` — 엔진(`live:test`) + 모니터 동시 (엔진이 끝나면 모니터도 종료).
2. **터미널 2개**: `npm run live:test`(또는 `npm run live:local`) + 다른 터미널에서 `npm run monitor` → 종료 시 스냅샷 갱신.
3. **paper 등**: `npm start`로 모드 선택 시에도 동일하게 모니터만 별도 실행하면 됩니다.

```bash
npm run monitor
```

**접속 주소**: `http://127.0.0.1:3001` (또는 설정한 `MONITOR_PORT`)

첫 화면은 **HTS 느낌의 계좌형 요약**(총 평가·매입·손익·순손익·수익률, 보유 종목 표, 연결/조회 시각, dry-run 판정)을 우선 표시하고, **원문 JSON**은 접힌 영역에서만 확인합니다. dry-run 스텁에서는 합계·보유가 0일 수 있습니다. API 소비용으로 **`/api/status`**(JSON)는 그대로입니다.

### Mock REGULAR 파라미터 실험 (score / turnover 컷 비교)

`FORCE_SESSION_PHASE=REGULAR`로 장중처럼 고정한 뒤, 후보 점수 하한(`SIGNAL_CANDIDATE_MIN_SCORE`)과 유니버스 최소 거래대금(`UNIVERSE_MIN_TURNOVER_KRW`)만 바꿔 **mock 후보 품질**을 비교합니다. 각 프리셋은 **30틱**(`PAPER_LOOP_MAX_TICKS=30`)으로 맞춰 두었습니다.

| 스크립트 | 목적 | 점수 컷 | turnover 컷 (KRW) | 태그 파일 |
| --- | --- | --- | --- | --- |
| `npm run run:regular:test` | 기본(현재 기본값과 동일) | 38 | 500,000,000 | `regular-test` |
| `npm run run:regular:strict` | 엄격·후보 적게 | 45 | 2,000,000,000 | `regular-strict` |
| `npm run run:regular:loose` | 완화·후보 많게 | 32 | 200,000,000 | `regular-loose` |

실행 후 같은 날짜에 대해 요약을 저장합니다(예: 오늘 날짜).

```bash
npm run run:regular:strict
npm run summarize-signals:regular:strict
# → data/reports/signal-summary-YYYY-MM-DD-regular-strict.json
```

`npm run summarize-signals:regular:test` 등은 내부적으로 `summarize-signals --save --tag=...`를 호출합니다. 다른 날짜는 `npm run summarize-signals -- --date=2026-04-03 --save --tag=regular-strict`처럼 지정합니다.

### Signal summary 비교 시 보는 지표 (mock REGULAR)

아래 네 가지를 중심으로 **어떤 컷이 목적에 맞는지** 판단합니다. `FORCE_SESSION_PHASE=REGULAR`를 쓴 땐 **전체 비율**이 아니라 **`REGULAR only` 블록과 `regularCandidateRatio`**를 우선합니다.

| 지표 | 의미 | 좋은 방향(가이드) |
| --- | --- | --- |
| **candidate ratio** (`candidateRatio`) | 전체 레코드 대비 후보 비율 | 실험 간 상대 비교. 너무 높으면 노이즈, 너무 낮으면 기회 부족. |
| **regularCandidateRatio** | REGULAR 레코드만 대상으로 한 후보 비율 | 장중 품질의 핵심. `too_few` / `too_many` 경고와 함께 봄. |
| **candidate_symbol_skew** (`candidate_symbol_skew` 경고) | 후보가 특정 심볼에 쏠렸는지 | 경고가 나오면 한 종목에 과도하게 의존하는 설정일 수 있음. |
| **too_few / too_many** (`too_few_candidates`, `too_many_candidates`, `regular_too_few_candidates`, `regular_too_many_candidates`, `regular_no_candidates`) | 경고 코드 | **엄격** 프리셋은 `regular_*_too_few`·`regular_no_candidates`가 나오기 쉽고, **완화**는 `regular_too_many_candidates`가 나오기 쉬움. 목표 밸런스에 맞춰 컷을 조정. |

세 프리셋의 `summary` JSON을 나란히 열어 `stats.regularCandidateRatio`, `warnings`를 비교하면 됩니다.

### 밤에 REGULAR 기준으로 mock 검증 (예시)

```bash
# PowerShell
$env:FORCE_SESSION_PHASE="REGULAR"; $env:PAPER_LOOP_MAX_TICKS="20"; npm start
npm run summarize-signals -- --save

# bash
FORCE_SESSION_PHASE=REGULAR PAPER_LOOP_MAX_TICKS=20 npm start
npm run summarize-signals -- --save
```

`.env`에 `FORCE_SESSION_PHASE=REGULAR`를 넣어두고 `npm start`만 해도 됩니다. 틱 로그에는 `effectiveSessionPhase`와 `forcedSessionPhase`(강제 여부)가 포함됩니다.

### Mock 급등주 paper trading (pump)

- **목적**: 시그널·후보(`candidate`) 다음 단계로, **진입 컷·유동성·REGULAR**를 만족하는 종목만 골라 `PaperBroker`에 **가상 포지션**을 열고, 매 틱 **청산 조건**을 검사합니다. **실주문·키움 API 없음.**
- **주식 전용 진입 품질**: 코인처럼 “틱만 강하면 추격”하기 어렵습니다. 국내 주식은 **상한가·갭·당일 고저·윗꼬리** 구조 때문에 **이미 늦은 급등**이나 **윗꼬리 과열**은 추격 매수에 불리합니다. 현재 mock paper 엔진은 `pump-selector`에서 아래를 순서대로 적용합니다: **상한가 잔여여력(headroom)** → **비용 대비 예상 수익폭(수수료·세금·슬리피지 + 버퍼)** → **전일 종가 대비 상승률(갭 과열)** → **윗꼬리 비율** → **(선택) US risk regime**.
- **US risk regime (mock)**: 한국 장은 **미국 선물·환율·국내 선물** 영향이 큽니다. 본 엔진은 외부 API 없이 `getMockGlobalRiskSnapshot()`으로 **나스닥 선물 % · 달러/원 변화 % · 코스피200 선물 %** 스냅샷을 넣고, 세 가지 조건 중 **임계값을 벗어난 항목이 2개 이상**이면 `risk-off`로 판정합니다. `US_FILTER_ENABLED=true`일 때: `US_RISK_BLOCK_MODE=true`면 해당 틱에서 조건을 통과한 후보도 **`us_risk_off`로 진입 제외**; `false`면 **점수 감점**(`US_RISK_SCORE_PENALTY`, 기본 10)만 적용합니다. 임계는 `US_NASDAQ_FUTURES_NEGATIVE_PCT` / `US_USDKRW_POSITIVE_PCT` / `US_KOSPI200_FUTURES_NEGATIVE_PCT`로 조정합니다. **테스트**: `US_MOCK_RISK_SCENARIO=normal`(기본)·`weak`(한 조건만)·`strong`(세 조건 모두)로 mock 스냅샷을 바꿉니다. `paper.tick`에 `usRiskOff`·세 지표·`usRiskReasons`가 붙고, 제외 시 `paper.pump.exclude`에 `reason: us_risk_off`와 지표가 남습니다.
- **Monday weekend-news filter (mock)**: 금요일 장 마감 후~월요일 장 시작 전까지 **뉴스·이벤트가 누적**되므로, 월요일 장초에는 평일과 동일한 급등 추격이 부담될 수 있습니다. 외부 뉴스 API 없이 `getMockWeekendRiskSnapshot()`의 플래그(`usRiskOff`는 US risk 결과와 병합, `usdkrwShock`·`oilShock`·`sectorBadNews`)를 세고, `MONDAY_WEEKEND_RISK_*_THRESHOLD`로 **진입 차단** 또는 **점수 감점**(`MONDAY_EXTRA_SCORE_PENALTY`)을 적용합니다. **정규장 개장 후 `MONDAY_OPEN_BLOCK_MINUTES` 동안**은 신규 진입을 막습니다(`monday_open_block`). **월요일 장초(개장 후 `MONDAY_OPEN_BLOCK_MINUTES`분, 값이 0이면 내부 기본 10분)**에는 전일 대비 상승률 컷을 `MONDAY_GAP_STRICTER_PCT`로 **더 엄격**히 적용합니다(`monday_gap_overextended`). **테스트**: 밤에 `FORCE_SESSION_PHASE=REGULAR`일 때 `MONDAY_DEV_SIMULATE_WEEKDAY=1`, `MONDAY_DEV_SIMULATE_MINUTES_AFTER_OPEN=5`로 월요일·개장 직후를 흉내 냅니다. `MONDAY_MOCK_WEEKEND_SCENARIO=severe`면 `monday_weekend_risk_block`, `caution`이면 감점 위주입니다. mock 종목 `444444`는 전일 대비 ~17%로 **평일 20% 컷보다 월요일 15% 컷이 먼저** 걸리도록 설계했습니다.
- **상한가 잔여여력(headroom)**: **상한가까지 남은 비율**이 `PAPER_MIN_HEADROOM_TO_UPPER_LIMIT_PCT`(기본 5%) 미만이면 제외(`low_upper_limit_headroom`). `upperLimitPrice`가 없으면 mock에서는 `prevClose`×**1.30** 근사(실제 제한폭은 종목별 상이).
- **비용 대비 엣지**: `min(headroom, PAPER_TAKE_PROFIT_PCT)`가 **매수·매도 수수료 + (옵션) 매도세 + 2×슬리피지 + PAPER_COST_EDGE_BUFFER_PCT**보다 작으면 제외(`insufficient_edge_after_cost`). `paper.pump.exclude`에 `minRequiredPct`·`estimatedMovePct`·`costEdgeThresholdPct`가 붙습니다.
- **갭 과열**: **전일 종가 대비 현재가 상승률**이 `PAPER_MAX_CHANGE_FROM_PREV_CLOSE_PCT`(기본 20) **초과**면 제외(`overextended_from_prev_close`). (시가 갭 전용 컷은 추후 확장 가능.)
- **윗꼬리 과다**: 당일 **고가·저가·현재가**로 본 윗꼬리 비율이 `PAPER_MAX_UPPER_WICK_RATIO_PCT`(기본 45) **초과**면 제외(`excessive_upper_wick`).
- **끄기**: `PAPER_TRADING=false` 이면 시그널 JSONL만 쓰고 브로커·트레이드 파일은 건너뜁니다.
- **주요 환경변수**: 위 세 컷 + `PAPER_ENTRY_MIN_SCORE`, `PAPER_MAX_OPEN_POSITIONS`, `PAPER_POSITION_SIZE_KRW`, 손익·보유·슬리피지·`TRADES_DIR` 등. 전체는 `.env.example` 참고.
- **로그**: `paper.open` / `paper.close`, `paper.pump.exclude`(제외 사유·`changeFromPrevClosePct`·`upperWickRatioPct`·OHLC 등), `paper.tick`에 `pumpExcludedCount` 등. 시그널 JSONL·진입 로그의 상한가 필드는 기존과 동일.
- **테스트**: `FORCE_SESSION_PHASE=REGULAR`로 두고 `npm start` 시 mock 유니버스의 `111111`(갭 과열), `222222`(윗꼬리), `333333`(정상 샘플) 등이 시그널 후보가 되면 `paper.pump.exclude`에 이유 코드와 수치가 남습니다. 로그에서 `overextended_from_prev_close` / `excessive_upper_wick` / `us_risk_off`(시나리오·블록 모드에 따라)를 확인합니다.
- **비교**: `npm run summarize-signals`로 후보 품질을 보고, **`data/trades/*.jsonl`**로 틱당 체결 PnL을 추적합니다.

```bash
# 예: 밤에 REGULAR 강제 + 짧은 틱 수로 pump paper 스모크
# PowerShell
$env:FORCE_SESSION_PHASE="REGULAR"; $env:PAPER_LOOP_MAX_TICKS="40"; npm start
```

### Signal summary (JSONL 분석)

```bash
# 기본: 오늘 날짜 → data/signals/YYYY-MM-DD.jsonl
npm run summarize-signals

# 특정 일자
npm run summarize-signals -- --date=2026-04-03

# JSON 리포트 저장 (data/reports/signal-summary-YYYY-MM-DD.json)
npm run summarize-signals -- --date=2026-04-03 --save

# 실험 태그가 붙은 파일 (data/signals/YYYY-MM-DD-regular-strict.jsonl 등)
npm run summarize-signals -- --date=2026-04-03 --save --tag=regular-strict

# 후보 심볼 상위 개수 (기본 5)
npm run summarize-signals -- --top=8
```

- **`REPORTS_DIR`**: `--save` 시 요약 JSON 저장 경로(기본 `data/reports`).
- **`SIGNALS_DIR`**: 읽을 JSONL 디렉터리(기본 `data/signals`).
- **`--tag=`**: `EXPERIMENT_TAG`와 동일한 파일명 접미사. 비우면 `--tag=`만으로 태그 없는 기본 파일을 읽습니다.
- 요약에는 **전체 지표**와 **`REGULAR` 전용 지표**(장중 후보 품질)가 함께 들어가며, `--save` JSON에도 동일하게 기록됩니다.

### Trade summary (trades JSONL 분석)

```bash
# 기본: 오늘 날짜 → data/trades/YYYY-MM-DD.jsonl
npm run summarize-trades

# 특정 일자 + 태그(선택)
npm run summarize-trades -- --date=2026-04-03 --tag=regular-strict

# JSON 리포트 저장
npm run summarize-trades -- --date=2026-04-03 --tag=regular-strict --save

# 상위 심볼 출력 개수 (기본 5)
npm run summarize-trades -- --date=2026-04-03 --tag=regular-strict --top=8
```

- **`REPORTS_DIR`**: `--save` 시 요약 JSON 저장 경로(기본 `data/reports`).
- **`TRADES_DIR`**: 읽을 JSONL 디렉터리(기본 `data/trades`).
- **`--tag=`**: `EXPERIMENT_TAG`와 동일한 파일명 접미사. 비우면 태그 없는 기본 파일을 읽습니다.

## 폴더 개요

- `src/auth/` — 로컬 로그인·세션·역할 (viewer/trader)
- `src/app/` — `main.ts` 진입, `login.ts` / `dashboard.ts` / `run-modes.ts` (paper·reports·live 분기), `monitor-server.ts`(로컬 읽기 전용 모니터)
- `src/live/` — 실거래용 **틀** (`live-engine` dry-run, `live-guard` 한도, `kiwoom-client` 연결 스텁). paper 엔진과 **별도 파일**
- `src/core/` — 거래소와 무관한 판단 로직 (`evaluateScore`, `pump-selector`, `PaperPosition` 타입 등)
- `src/kiwoom/` — 시장·주문·계좌·시간; `mock-market-data.ts`·`basic-universe-filter.ts`로 paper loop 검증
- `src/paper/` — `startPaperLoop`, `PaperBroker`, `SimpleFillSimulator`, `paper-exit` — mock 시세·시그널·**가상 매매**, 실주문 없음
- `src/infra/` — 설정, 콘솔 로거, 시계, `log-file.ts`(일별 요약 로그 append), `monitor-snapshot.ts`(로컬 모니터용 JSON 스냅샷)
- `src/reports/` — `signals-jsonl.ts`, `signal-summary.ts`, `trades-jsonl.ts`(종료 트레이드 JSONL)
- `data/signals/` — 일자별 `*.jsonl` 시그널 스트림 (`EXPERIMENT_TAG` 시 `YYYY-MM-DD-<tag>.jsonl`)
- `data/trades/` — `YYYY-MM-DD[-tag].jsonl` 청산된 paper 트레이드 한 줄당 1레코드
- `data/reports/` — `signal-summary-YYYY-MM-DD.json` 또는 `-<tag>.json` (`--save` 시)
- `logs/` — 일자별 `paper-loop-YYYY-MM-DD.log` 또는 `-<tag>.log` (틱 요약 JSON 줄)
