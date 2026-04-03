import type { AppConfig } from "../infra/config.js";

/** Kiwoom REST: OAuth + TR-style POST helpers. */

export interface KiwoomTokenResult {
  ok: true;
  accessToken: string;
  expiresInSec: number;
}

export interface KiwoomTokenError {
  ok: false;
  message: string;
}

export type KiwoomTokenOutcome = KiwoomTokenResult | KiwoomTokenError;

let cached: { token: string; expMs: number } | null = null;
const SKEW_MS = 60_000;

export function parseKiwoomAccountParts(accountNo: string): {
  cano: string;
  acnt_prdt_cd: string;
} | null {
  const digits = accountNo.replace(/\D/g, "");
  if (digits.length >= 10) {
    return { cano: digits.slice(0, 8), acnt_prdt_cd: digits.slice(8, 10) };
  }
  if (digits.length === 8) {
    return { cano: digits, acnt_prdt_cd: "01" };
  }
  return null;
}

export function clearKiwoomTokenCache(): void {
  cached = null;
}

/** OAuth 응답 메타만 기록 (토큰·키 값은 출력하지 않음). */
function describeOAuthResponseBody(json: unknown): {
  topLevelKeys: string[];
  returnCode: unknown;
  returnMsg: unknown;
  error: unknown;
  errorDescription: unknown;
  hasAccessToken: boolean;
  hasToken: boolean;
  hasTokenType: boolean;
  hasExpiresIn: boolean;
} {
  if (json === null || json === undefined || typeof json !== "object") {
    return {
      topLevelKeys: [],
      returnCode: undefined,
      returnMsg: undefined,
      error: undefined,
      errorDescription: undefined,
      hasAccessToken: false,
      hasToken: false,
      hasTokenType: false,
      hasExpiresIn: false,
    };
  }
  const rec = json as Record<string, unknown>;
  return {
    topLevelKeys: Object.keys(rec),
    returnCode: rec.return_code ?? rec.return_cd,
    returnMsg: rec.return_msg,
    error: rec.error,
    errorDescription: rec.error_description,
    hasAccessToken: typeof rec.access_token === "string" && rec.access_token.length > 0,
    hasToken: typeof rec.token === "string" && rec.token.length > 0,
    hasTokenType: typeof rec.token_type === "string" && rec.token_type.length > 0,
    hasExpiresIn: rec.expires_in !== undefined && rec.expires_in !== null,
  };
}

function logOAuthDebug(payload: Record<string, unknown>): void {
  console.info("[oauth.real.debug]", payload);
}

export async function fetchKiwoomAccessToken(
  config: AppConfig
): Promise<KiwoomTokenOutcome> {
  const now = Date.now();
  if (cached && cached.expMs > now + 5_000) {
    logOAuthDebug({
      msg: "oauth cache hit (token value not logged)",
      cacheHit: true,
      expiresInSecApprox: Math.floor((cached.expMs - now) / 1000),
    });
    return {
      ok: true,
      accessToken: cached.token,
      expiresInSec: Math.floor((cached.expMs - now) / 1000),
    };
  }

  const base = config.kiwoomRestBaseUrl.replace(/\/$/, "");
  const path = config.kiwoomRestOAuthPath.startsWith("/")
    ? config.kiwoomRestOAuthPath
    : `/${config.kiwoomRestOAuthPath}`;
  const finalOAuthUrl = `${base}${path}`;
  const body = {
    grant_type: "client_credentials",
    appkey: config.kiwoomApiKey,
    secretkey: config.kiwoomApiSecret,
  };

  logOAuthDebug({
    msg: "oauth request (body secrets omitted)",
    oauthEndpointFinalUrl: finalOAuthUrl,
    grantType: "client_credentials",
  });

  let res: Response;
  try {
    res = await fetch(finalOAuthUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logOAuthDebug({
      msg: "oauth network error",
      oauthEndpointFinalUrl: finalOAuthUrl,
      error: message,
    });
    return { ok: false, message: `oauth network: ${message}` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    logOAuthDebug({
      msg: "oauth response not json",
      oauthEndpointFinalUrl: finalOAuthUrl,
      httpStatus: res.status,
    });
    return { ok: false, message: `oauth non-json http=${res.status}` };
  }

  const meta = describeOAuthResponseBody(json);

  logOAuthDebug({
    msg: "oauth response meta",
    oauthEndpointFinalUrl: finalOAuthUrl,
    httpStatus: res.status,
    topLevelKeys: meta.topLevelKeys,
    returnCode: meta.returnCode,
    returnMsg: meta.returnMsg,
    error: meta.error,
    errorDescription: meta.errorDescription,
    hasAccessTokenField: meta.hasAccessToken,
    hasTokenField: meta.hasToken,
    hasTokenTypeField: meta.hasTokenType,
    hasExpiresInField: meta.hasExpiresIn,
  });

  if (!res.ok) {
    return {
      ok: false,
      message: `oauth http=${res.status} keys=${meta.topLevelKeys.join(",")}`,
    };
  }

  /** 키움 OAuth: HTTP 200이어도 body에 return_code≠0 이 올 수 있음 */
  const rc = meta.returnCode;
  const kiwoomBizError =
    rc !== undefined &&
    rc !== null &&
    !(rc === 0 || rc === "0");
  if (kiwoomBizError) {
    return {
      ok: false,
      message: `oauth return_code=${String(rc)} return_msg=${String(meta.returnMsg ?? "")}`,
    };
  }

  if (meta.error !== undefined && meta.error !== null && meta.error !== "") {
    return {
      ok: false,
      message: `oauth error=${String(meta.error)} error_description=${String(meta.errorDescription ?? "")}`,
    };
  }

  const rec = json as Record<string, unknown>;
  const token =
    (typeof rec.access_token === "string" && rec.access_token) ||
    (typeof rec.token === "string" && rec.token) ||
    "";
  if (!token) {
    logOAuthDebug({
      msg: "oauth missing token after success-shaped response",
      oauthEndpointFinalUrl: finalOAuthUrl,
      httpStatus: res.status,
      topLevelKeys: meta.topLevelKeys,
      hasAccessTokenField: meta.hasAccessToken,
      hasTokenField: meta.hasToken,
    });
    return { ok: false, message: `oauth missing token keys=${meta.topLevelKeys.join(",")}` };
  }

  const expiresIn =
    typeof rec.expires_in === "number"
      ? rec.expires_in
      : typeof rec.expires_in === "string"
        ? Number(rec.expires_in)
        : 3600;
  const sec = Number.isFinite(expiresIn) ? Math.max(60, Math.floor(expiresIn)) : 3600;
  cached = { token, expMs: now + sec * 1000 - SKEW_MS };

  logOAuthDebug({
    msg: "oauth success (token value not logged)",
    oauthEndpointFinalUrl: finalOAuthUrl,
    httpStatus: res.status,
    expiresInSec: sec,
    hasAccessTokenField: meta.hasAccessToken,
    hasTokenField: meta.hasToken,
  });

  return { ok: true, accessToken: token, expiresInSec: sec };
}

export interface KiwoomTrPostResult {
  ok: boolean;
  httpStatus: number;
  json: unknown;
  message: string;
}

export async function kiwoomTrPost(
  config: AppConfig,
  accessToken: string,
  pathSuffix: string,
  apiId: string,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): Promise<KiwoomTrPostResult> {
  const base = config.kiwoomRestBaseUrl.replace(/\/$/, "");
  const path = pathSuffix.startsWith("/") ? pathSuffix : `/${pathSuffix}`;
  const url = `${base}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "api-id": apiId,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, httpStatus: 0, json: null, message: `network: ${message}` };
  }

  let json: unknown;
  try {
    const text = await res.text();
    json = text ? JSON.parse(text) : null;
  } catch {
    return {
      ok: false,
      httpStatus: res.status,
      json: null,
      message: "response not json",
    };
  }

  const okHttp = res.ok;
  const rec = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const rc = rec?.return_code ?? rec?.return_cd ?? rec?.rt_cd;
  const codeOk =
    rc === 0 ||
    rc === "0" ||
    rc === undefined ||
    (typeof rc === "string" && rc.toLowerCase() === "success");
  const ok = okHttp && codeOk;

  return {
    ok,
    httpStatus: res.status,
    json,
    message: ok
      ? "ok"
      : `http=${res.status} return=${String(rc)} body=${JSON.stringify(json)}`,
  };
}

export function isKiwoomTrBusinessOk(json: unknown): boolean {
  if (json === null || json === undefined) return false;
  const rec = json as Record<string, unknown>;
  const rc = rec.return_code ?? rec.return_cd ?? rec.rt_cd;
  /** Some TR bodies omit return_code on success (HTTP 200 only). */
  if (rc === undefined) return true;
  if (rc === 0 || rc === "0") return true;
  if (typeof rc === "string" && rc.toLowerCase() === "success") return true;
  return false;
}

/**
 * Kiwoom TR 금액·수치가 문자열로 올 때: 쉼표·공백·선행 + 등을 제거 후 숫자만 안정적으로 변환.
 * 변환 실패 시 0.
 */
function parseKiwoomDecoratedNumericString(raw: string): number {
  let t = raw.trim();
  if (t === "") return 0;
  t = t.replace(/,/g, "").replace(/\uFF0C/g, "");
  t = t.replace(/\s/g, "");
  t = t.replace(/^\+/, "");
  let n = Number(t);
  if (Number.isFinite(n)) return n;
  n = parseFloat(t);
  if (Number.isFinite(n)) return n;
  const loose = t.replace(/[^\d.\-]/g, "");
  n = parseFloat(loose);
  return Number.isFinite(n) ? n : 0;
}

/** Best-effort number from nested keys / string ints. */
export function pickNumeric(obj: unknown, keys: string[]): number {
  if (obj === null || obj === undefined) return NaN;
  if (typeof obj === "number" && Number.isFinite(obj)) return obj;
  if (typeof obj === "string") {
    return parseKiwoomDecoratedNumericString(obj);
  }
  if (typeof obj !== "object") return NaN;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    if (k in o) {
      const v = pickNumeric(o[k], keys);
      if (Number.isFinite(v)) return v;
    }
  }
  return NaN;
}

export function firstOutputArray(json: unknown): Record<string, unknown>[] {
  if (json === null || json === undefined) return [];
  const rec = json as Record<string, unknown>;
  const o1 = rec.output1;
  if (Array.isArray(o1)) {
    return o1.filter((x): x is Record<string, unknown> => x !== null && typeof x === "object");
  }
  const data = rec.data;
  if (Array.isArray(data)) {
    return data.filter((x): x is Record<string, unknown> => x !== null && typeof x === "object");
  }
  return [];
}
