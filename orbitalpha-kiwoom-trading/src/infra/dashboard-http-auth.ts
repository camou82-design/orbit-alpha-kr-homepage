import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticate } from "../auth/admin-auth.js";
import { loadConfig } from "./config.js";

const COOKIE = "orb_kw_dash_sess";
const TOKEN_PREFIX = "v1";
const MAX_AGE_SEC = 12 * 3600;
const MIN_SECRET_LEN = 16;

/** 공개 URL 마운트 (선행 /, 후행 슬래시 없음). 예: `/live`, `/paper` */
function normalizeMount(raw: string | undefined): string {
  if (!raw) return "";
  let p = raw.trim();
  if (p === "") return "";
  if (!p.startsWith("/")) p = `/${p}`;
  return p.replace(/\/+$/, "");
}

/**
 * LIVE 대시보드 브라우저 경로 접두사.
 * `KIWOOM_LIVE_PUBLIC_MOUNT=/live` → 로그인 `/live/auth/login`, 복귀 `/live/`.
 * 미설정 시 "" (로컬 포트 직접 접속: `/auth/login` 등 앱 루트 기준).
 */
export function dashboardPublicMountLive(): string {
  return normalizeMount(process.env.KIWOOM_LIVE_PUBLIC_MOUNT);
}

export function dashboardPublicMountPaper(): string {
  return normalizeMount(process.env.KIWOOM_PAPER_PUBLIC_MOUNT);
}

/**
 * 마운트 + 경로를 하나의 절대 경로로 합침. 상대 문자열 이어붙이기 금지 — 항상 이 함수 사용.
 * @param mount `dashboardPublicMountLive()` 등
 * @param suffix `/auth/login`, `/` 등 (항상 선행 /)
 */
export function dashboardAbsolutePath(mount: string, suffix: string): string {
  const s = suffix.startsWith("/") ? suffix : `/${suffix}`;
  const m = (mount ?? "").replace(/\/+$/, "");
  if (!m) return s.length > 1 ? s : "/";
  return `${m}${s}`;
}

/** 로그인 페이지 URL (쿼리는 URLSearchParams로 부착, auth 중복 없음). */
export function dashboardAuthLoginUrl(
  mount: string,
  query?: Record<string, string | undefined>
): string {
  const base = dashboardAbsolutePath(mount, "/auth/login");
  if (!query) return base;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") sp.set(k, v);
  }
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}

/** 브라우저가 보는 LIVE 모니터 경로 (Nginx 하위 경로 배포 시 설정). */
export function dashboardDefaultReturnPathLive(): string {
  const m = dashboardPublicMountLive();
  if (m) return `${m}/`;
  return "/";
}

export function dashboardDefaultReturnPathPaper(): string {
  const m = dashboardPublicMountPaper();
  if (m) return `${m}/`;
  return "/";
}

export function dashboardHttpAuthEnabled(): boolean {
  const v = process.env.KIWOOM_DASHBOARD_HTTP_AUTH?.trim().toLowerCase();
  return v === "1" || v === "true";
}

export function dashboardSessionSecretOk(): boolean {
  const s = (process.env.KIWOOM_DASHBOARD_SESSION_SECRET ?? "").trim();
  return s.length >= MIN_SECRET_LEN;
}

function secret(): string {
  return (process.env.KIWOOM_DASHBOARD_SESSION_SECRET ?? "").trim();
}

function isHttps(req: IncomingMessage): boolean {
  const x = req.headers["x-forwarded-proto"];
  if (typeof x === "string" && x.split(",")[0]?.trim().toLowerCase() === "https")
    return true;
  return false;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function parseCookies(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function getDashboardCookie(req: IncomingMessage): string | undefined {
  return parseCookies(req.headers.cookie)[COOKIE];
}

function verifyToken(token: string, key: string): string | null {
  const parts = token.split("|");
  if (parts.length !== 4 || parts[0] !== TOKEN_PREFIX) return null;
  const [, expStr, username, sig] = parts;
  const exp = Number(expStr);
  if (!username || !Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  const payload = `${TOKEN_PREFIX}|${expStr}|${username}`;
  const expected = sign(payload, key);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return username;
}

export function dashboardSessionUsername(
  req: IncomingMessage
): string | null {
  if (!dashboardHttpAuthEnabled() || !dashboardSessionSecretOk()) return null;
  const key = secret();
  const raw = getDashboardCookie(req);
  if (!raw) return null;
  return verifyToken(raw, key);
}

function issueToken(username: string, key: string): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const payload = `${TOKEN_PREFIX}|${exp}|${username}`;
  const sig = sign(payload, key);
  return `${payload}|${sig}`;
}

function setCookieHeader(
  req: IncomingMessage,
  value: string | null
): string {
  const secure = isHttps(req) ? "; Secure" : "";
  const parts = [
    `${COOKIE}=${value ? encodeURIComponent(value) : ""}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${value ? String(MAX_AGE_SEC) : "0"}`,
  ];
  return `${parts.join("; ")}${secure}`;
}

export function readUrlEncodedBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => {
      chunks.push(c);
      if (chunks.reduce((n, b) => n + b.length, 0) > 1_000_000) {
        reject(new Error("body_too_large"));
      }
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        const q = new URLSearchParams(raw);
        const o: Record<string, string> = {};
        q.forEach((v, k) => {
          o[k] = v;
        });
        resolve(o);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export function sendNoStoreHeaders(res: ServerResponse): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
}

export function requireDashboardSession(
  req: IncomingMessage,
  res: ServerResponse,
  loginRedirectPath: string,
  mount: string
): boolean {
  if (!dashboardHttpAuthEnabled()) return true;
  if (!dashboardSessionSecretOk()) {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("KIWOOM_DASHBOARD_SESSION_SECRET is missing or too short (min 16).");
    return false;
  }
  const u = dashboardSessionUsername(req);
  if (u) return true;
  const nextPath = loginRedirectPath || "/";
  res.writeHead(302, {
    Location: dashboardAuthLoginUrl(mount, { next: nextPath }),
  });
  res.end();
  return false;
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function handleDashboardLoginPost(
  req: IncomingMessage,
  res: ServerResponse,
  defaultAfterLogin = "/",
  mount = ""
): Promise<void> {
  if (!dashboardHttpAuthEnabled() || !dashboardSessionSecretOk()) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("dashboard auth disabled");
    return;
  }
  let body: Record<string, string>;
  try {
    body = await readUrlEncodedBody(req);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("bad body");
    return;
  }
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  const nextRaw = (body.next ?? "").trim();
  let next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : defaultAfterLogin;
  if (next === "/" && defaultAfterLogin !== "/") next = defaultAfterLogin;

  const config = loadConfig();
  const role = authenticate(username, password, config);
  if (!role) {
    sendNoStoreHeaders(res);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      renderLoginPage(
        next,
        "아이디 또는 비밀번호가 올바르지 않습니다.",
        false,
        null,
        mount
      )
    );
    return;
  }
  void role;
  const token = issueToken(username, secret());
  res.writeHead(302, {
    Location: next,
    "Set-Cookie": setCookieHeader(req, token),
  });
  res.end();
}

export function handleDashboardLogoutPost(
  req: IncomingMessage,
  res: ServerResponse,
  mount: string
): void {
  sendNoStoreHeaders(res);
  if (dashboardHttpAuthEnabled() && dashboardSessionSecretOk()) {
    res.writeHead(302, {
      Location: dashboardAuthLoginUrl(mount, { bye: "1" }),
      "Set-Cookie": setCookieHeader(req, null),
    });
  } else {
    res.writeHead(302, {
      Location: dashboardAuthLoginUrl(mount, { noop: "1" }),
    });
  }
  res.end();
}

/**
 * @returns true if the request was fully handled (caller should return).
 */
export async function tryDashboardAuthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  qs: string,
  defaultAfterLogin = "/",
  mount = ""
): Promise<boolean> {
  if (path === "/auth/login") {
    if (req.method === "GET") {
      const params = new URLSearchParams(qs);
      const nextRaw = params.get("next")?.trim() || "";
      let next =
        nextRaw.startsWith("/") && !nextRaw.startsWith("//")
          ? nextRaw
          : defaultAfterLogin;
      if (next === "/" && defaultAfterLogin !== "/") next = defaultAfterLogin;
      const bye = params.get("bye");
      const noop = params.get("noop");
      let info: string | null = null;
      if (bye === "1") info = "로그아웃되었습니다. 다시 로그인하세요.";
      if (noop === "1") info = "서버 측 대시보드 세션을 사용하지 않는 구성입니다.";
      sendNoStoreHeaders(res);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        renderLoginPage(next, null, !dashboardHttpAuthEnabled(), info, mount)
      );
      return true;
    }
    if (req.method === "POST") {
      sendNoStoreHeaders(res);
      await handleDashboardLoginPost(req, res, defaultAfterLogin, mount);
      return true;
    }
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("method not allowed");
    return true;
  }

  if (path === "/auth/logout") {
    if (req.method === "POST") {
      sendNoStoreHeaders(res);
      handleDashboardLogoutPost(req, res, mount);
      return true;
    }
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("method not allowed");
    return true;
  }

  return false;
}

export function renderLoginPage(
  next: string,
  error: string | null,
  authDisabled: boolean,
  info: string | null = null,
  mount = ""
): string {
  const loginAction = dashboardAbsolutePath(mount, "/auth/login");
  const dashboardRootHref = dashboardAbsolutePath(mount, "/");
  const errBlock = error ? `<p style="color:#b00020;font-size:13px">${escHtml(error)}</p>` : "";
  const infoBlock = info ? `<p style="color:#2e7d32;font-size:13px">${escHtml(info)}</p>` : "";
  const note = authDisabled
    ? `<p style="color:#555;font-size:13px">대시보드 HTTP 인증이 꺼져 있습니다. 서버는 브라우저 로그인 세션을 유지하지 않습니다.</p><p><a href="${escAttr(dashboardRootHref)}">대시보드로 돌아가기</a></p>`
    : "";
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>로그인 — Kiwoom dashboard</title>
  <style>
    body { font-family: "Malgun Gothic","맑은 고딕",sans-serif; background:#e9ecef; margin:0; padding:2rem; }
    .box { max-width: 380px; margin: 0 auto; background:#fff; border:1px solid #c5cbd3; padding:1.25rem; border-radius:4px; }
    h1 { font-size: 1.1rem; margin: 0 0 1rem; }
    label { display:block; font-size:12px; color:#444; margin-top:0.6rem; }
    input { width:100%; box-sizing:border-box; padding:0.45rem; margin-top:0.2rem; font-size:14px; }
    button { margin-top:1rem; padding:0.5rem 1rem; font-weight:600; cursor:pointer; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Kiwoom 운영 대시보드</h1>
    ${infoBlock}
    ${note}
    ${authDisabled ? "" : `<form method="post" action="${escAttr(loginAction)}">
      <input type="hidden" name="next" value="${escAttr(next)}" />
      <label>아이디 <input name="username" autocomplete="username" required /></label>
      <label>비밀번호 <input name="password" type="password" autocomplete="current-password" required /></label>
      ${errBlock}
      <button type="submit">로그인</button>
    </form>`}
  </div>
</body>
</html>`;
}
