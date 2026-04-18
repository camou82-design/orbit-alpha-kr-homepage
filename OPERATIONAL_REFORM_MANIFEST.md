# 운영 서버 재발 방지형 구조 재편 보고서 (Kodari Standard)

## 1. 개요
최근 반복된 운영 장애의 구조적 원인(인증값 불일치, 자원 고갈, 가짜 정상 상태 등)을 제거하기 위해 시스템 전체를 재편했습니다.

## 2. 주요 개선 사항

### 2.1 환경값 및 인증 정합성 강화
- **표준 Ecosystem 도입**: 모든 앱에 대해 `env`와 `env_production`이 명시된 PM2 설정 파일을 구축했습니다.
  - `lightsail-futures-paper-api`: `ecosystem.config.cjs`
  - `orbitalpha-trading`: `ecosystem.trading.config.cjs` (API + Dashboard)
  - `orbitalpha-futures-paper-loop`: `ecosystem.futures-paper.config.cjs`
- **시크릿 검증 로직**: `Paper API` 기동 시 시크릿이 플레이스홀더(`REPLACE_WITH_...`)인 경우 로그에 경고를 출력하고, `/health` 엔드포인트에서 `misconfigured` 상태를 반환하도록 개선했습니다.

### 2.2 리소스 고갈 방지 (경량화)
- **Tail-based File Access**: 대용량 로그 파일(`events.jsonl`, `health-history.jsonl`) 전체를 메모리에 로드하던 방식을 버리고, 필요한 만큼만 뒤에서부터 읽는(Tail) 방식을 도입했습니다.
  - `readLastLines` 유틸리티를 통한 메모리 안전성 확보.
  - 소형 서버(Lightsail 등)에서의 OOM(Out of Memory) 및 API 응답 지연 원천 봉쇄.

### 2.3 운영 격리 및 가시성 확보
- **프로세스 독립화**: 매매 엔진, 대시보드, API가 서로 다른 프로세스 아이디를 가지며, 메모리 제한(`max_memory_restart`)을 두어 상호 간섭을 최소화했습니다.
- **가짜 정상 제거**: `production-validate.js` 스크립트를 통해 PM2가 `online`이라도 실제 포트가 열려 있는지, `/health`가 유의미한 응답을 주는지 검증할 수 있는 수단을 마련했습니다.

## 3. 핵심 도구 및 위치
- **검증 스크립트**: `/scripts/production-validate.js`
  - 사용법: `node production-validate.js poststart` (기동 후 상태 점검)
- **공통 유틸리티**: `/src/lib/file-utils.ts` (Tail 읽기 로직)

## 4. 향후 운영 원칙 (Kodari Checklist)
1. **임시 실행 금지**: 반드시 `pm2 start ... --env production` 명령으로만 기동할 것.
2. **배포 전 검증**: 시크릿을 수정한 후에는 `GET /health` 응답의 `status`가 `ok`인지 반드시 확인할 것.
3. **포트 충돌 확인**: 동일 포트를 사용하는 잔존 프로세스가 없는지 `production-validate.js`로 체크할 것.
4. **로그 모니터링**: `PM2 online`만 믿지 말고 실제 로그의 `Standardized Startup` 메시지를 확인할 것.

---
**보고자**: 코다리 부장
**상태**: 구조 재편 완료 및 하드닝 적용됨
